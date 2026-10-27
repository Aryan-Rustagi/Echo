const express = require("express");
const router = express.Router();

const DEFAULT_SYSTEM_PROMPT = [
  "You are Echo, a helpful voice assistant.",
  "Use the entire conversation history to answer follow-up questions.",
  "Remember facts the user tells you and use them later.",
  "Never repeat a question that was already answered in the conversation.",
  "If the user says a fact is theirs but does not provide the value, ask for the missing value once.",
  "Reply in one short natural sentence.",
  "Do not use markdown, bullet points, or emojis.",
  "Do not introduce yourself."
].join(" ");

function resolveSystemPrompt(clientPrompt) {
  if (typeof clientPrompt === "string" && clientPrompt.trim()) {
    const trimmed = clientPrompt.trim().slice(0, 2500);
    // Guarantee essential voice safety constraints so speech synthesis stays natural
    const voiceSafetyRule = " Spoken conversation constraint: Reply in 1-2 concise spoken sentences. Never use markdown, bullet points, asterisks, or emojis.";
    if (!/markdown|bullet|emoji/i.test(trimmed)) {
      return trimmed + voiceSafetyRule;
    }
    return trimmed;
  }
  return DEFAULT_SYSTEM_PROMPT;
}

const MAX_MESSAGES = 20;
const PER_MESSAGE_CAP = 4000;
const TOTAL_CHAR_BUDGET = 16000;

function cleanMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  const cleaned = [];
  for (let i = 0; i < rawMessages.length; i += 1) {
    const item = rawMessages[i];
    if (!item || typeof item !== "object") {
      continue;
    }

    const role = item.role;
    // Only allow roles "user" and "assistant". Never allow client-supplied "system".
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    if (typeof item.content !== "string") {
      continue;
    }

    const trimmed = item.content.trim();
    if (!trimmed) {
      continue;
    }

    cleaned.push({
      role: role,
      content: trimmed.slice(0, PER_MESSAGE_CAP),
    });
  }

  const recent = cleaned.slice(-MAX_MESSAGES);
  const budgeted = [];
  let totalChars = 0;

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const msg = recent[i];
    if (totalChars + msg.content.length > TOTAL_CHAR_BUDGET && budgeted.length > 0) {
      break;
    }
    budgeted.unshift(msg);
    totalChars += msg.content.length;
  }

  return budgeted;
}

function formatGeminiContents(cleaned) {
  const contents = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const item = cleaned[i];
    const role = item.role === "assistant" ? "model" : "user";
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += "\n" + item.content;
    } else {
      contents.push({
        role: role,
        parts: [{ text: item.content }],
      });
    }
  }

  // Ensure first turn begins with role "user"
  while (contents.length > 0 && contents[0].role !== "user") {
    contents.shift();
  }

  if (contents.length === 0 && cleaned.length > 0) {
    contents.push({
      role: "user",
      parts: [{ text: cleaned[cleaned.length - 1].content }],
    });
  }

  return contents;
}

// Call Google Gemini Flash (non-streaming)
async function callGeminiNonStreaming(cleaned, systemPrompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is not configured in .env");
  }

  const activePrompt = resolveSystemPrompt(systemPrompt);
  const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
  const geminiContents = formatGeminiContents(cleaned);

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiKey,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: activePrompt }],
      },
      contents: geminiContents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 150,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  let reply = "";
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    const parts = data.candidates[0].content.parts;
    for (let p = 0; p < parts.length; p += 1) {
      if (typeof parts[p].text === "string") {
        reply += parts[p].text;
      }
    }
  }
  return reply.trim();
}

// Call OpenAI / Groq (non-streaming)
async function callOpenAINonStreaming(cleaned, systemPrompt) {
  const isGroq = Boolean(process.env.GROQ_API_KEY);
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Neither GROQ_API_KEY nor OPENAI_API_KEY is configured in .env");
  }

  const activePrompt = resolveSystemPrompt(systemPrompt);
  const url = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = isGroq
    ? (process.env.GROQ_MODEL || "llama-3.3-70b-versatile")
    : (process.env.OPENAI_MODEL || "gpt-4o-mini");

  const payloadMessages = [
    { role: "system", content: activePrompt },
    ...cleaned,
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      temperature: 0.7,
      max_tokens: 150,
      messages: payloadMessages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI/Groq API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    ? data.choices[0].message.content
    : "";
  return reply.trim();
}

// Stream Google Gemini Flash (Server-Sent Events)
async function streamGemini(cleaned, res, abortSignal, systemPrompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is not configured in .env");
  }

  const activePrompt = resolveSystemPrompt(systemPrompt);
  const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse`;
  const geminiContents = formatGeminiContents(cleaned);

  const upstreamResponse = await fetch(geminiUrl, {
    method: "POST",
    signal: abortSignal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiKey,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: activePrompt }],
      },
      contents: geminiContents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 150,
      },
    }),
  });

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text();
    throw new Error(`Gemini Stream Error ${upstreamResponse.status}: ${errorText}`);
  }

  if (!upstreamResponse.body) {
    throw new Error("No stream body from Gemini");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let totalTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || !line.startsWith("data: ")) {
        continue;
      }

      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") {
        continue;
      }

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts) {
          const parts = parsed.candidates[0].content.parts;
          for (let p = 0; p < parts.length; p += 1) {
            const textChunk = parts[p].text;
            if (typeof textChunk === "string" && textChunk.length > 0) {
              totalTokens += 1;
              res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
            }
          }
        }
      } catch (_jsonErr) {
        // ignore non-json SSE frames
      }
    }
  }

  if (totalTokens === 0) {
    res.write(`data: ${JSON.stringify({ token: "" })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  return res.end();
}

// Stream OpenAI / Groq (Server-Sent Events)
async function streamOpenAI(cleaned, res, abortSignal, systemPrompt) {
  const isGroq = Boolean(process.env.GROQ_API_KEY);
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Neither GROQ_API_KEY nor OPENAI_API_KEY is configured in .env");
  }

  const activePrompt = resolveSystemPrompt(systemPrompt);
  const url = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = isGroq
    ? (process.env.GROQ_MODEL || "llama-3.3-70b-versatile")
    : (process.env.OPENAI_MODEL || "gpt-4o-mini");

  const payloadMessages = [
    { role: "system", content: activePrompt },
    ...cleaned,
  ];

  const upstreamResponse = await fetch(url, {
    method: "POST",
    signal: abortSignal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      temperature: 0.7,
      max_tokens: 150,
      stream: true,
      messages: payloadMessages,
    }),
  });

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text();
    throw new Error(`OpenAI Stream Error ${upstreamResponse.status}: ${errorText}`);
  }

  if (!upstreamResponse.body) {
    throw new Error("No stream body from OpenAI");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let totalTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || !line.startsWith("data: ")) {
        continue;
      }

      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") {
        continue;
      }

      try {
        const parsed = JSON.parse(dataStr);
        const deltaContent = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
        if (typeof deltaContent === "string" && deltaContent.length > 0) {
          totalTokens += 1;
          res.write(`data: ${JSON.stringify({ token: deltaContent })}\n\n`);
        }
      } catch (_jsonErr) {
        // ignore non-json SSE frames
      }
    }
  }

  if (totalTokens === 0) {
    res.write(`data: ${JSON.stringify({ token: "" })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  return res.end();
}

function resolveProvider(requested) {
  if (requested === "openai") {
    if (process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY) {
      return "openai";
    }
    if (process.env.GEMINI_API_KEY) {
      return "gemini";
    }
    return "openai";
  }

  // Requested gemini (or default)
  if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  if (process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY) {
    return "openai";
  }
  return "gemini";
}

// 1. Non-streaming chat route
router.post("/", async function handleChat(req, res) {
  let { messages, message, provider, systemPrompt } = req.body;

  if (!messages && typeof message === "string" && message.trim()) {
    messages = [{ role: "user", content: message }];
  }

  const cleaned = cleanMessages(messages);
  if (cleaned.length === 0) {
    return res.status(400).json({ error: "No valid messages provided" });
  }

  const targetProvider = resolveProvider(provider);

  if (targetProvider === "gemini") {
    try {
      const reply = await callGeminiNonStreaming(cleaned, systemPrompt);
      return res.json({ reply: reply });
    } catch (geminiErr) {
      console.warn("[Chat] Gemini failed, falling back to OpenAI/Groq:", geminiErr.message);
    }

    try {
      const reply = await callOpenAINonStreaming(cleaned, systemPrompt);
      return res.json({ reply: reply });
    } catch (openAiErr) {
      const errMsg = `[Chat] All providers failed: ${openAiErr.message}\n`;
      console.error(errMsg);
      try {
        require("fs").appendFileSync(require("path").resolve(__dirname, "../server_error.log"), `${new Date().toISOString()} ${errMsg}`);
      } catch (_e) {}
      return res.status(502).json({
        error: "All LLM providers failed to generate a response: " + openAiErr.message,
        provider: targetProvider,
      });
    }
  }

  // targetProvider === "openai"
  try {
    const reply = await callOpenAINonStreaming(cleaned, systemPrompt);
    return res.json({ reply: reply });
  } catch (openAiErr) {
    console.warn("[Chat] OpenAI/Groq failed, attempting Gemini fallback:", openAiErr.message);
    if (process.env.GEMINI_API_KEY) {
      try {
        const reply = await callGeminiNonStreaming(cleaned, systemPrompt);
        return res.json({ reply: reply });
      } catch (geminiErr) {
        console.warn("[Chat] Gemini fallback also failed:", geminiErr.message);
      }
    }
    const errMsg = `[Chat] All providers failed: ${openAiErr.message}\n`;
    console.error(errMsg);
    try {
      require("fs").appendFileSync(require("path").resolve(__dirname, "../server_error.log"), `${new Date().toISOString()} ${errMsg}`);
    } catch (_e) {}
    return res.status(502).json({
      error: "All LLM providers failed to generate a response: " + openAiErr.message,
      provider: targetProvider,
    });
  }
});

// 2. Streaming chat route (Server-Sent Events)
router.post("/stream", async function handleChatStream(req, res) {
  let { messages, message, provider, systemPrompt } = req.body;

  if (!messages && typeof message === "string" && message.trim()) {
    messages = [{ role: "user", content: message }];
  }

  const cleaned = cleanMessages(messages);
  if (cleaned.length === 0) {
    return res.status(400).json({ error: "No valid messages provided" });
  }

  const abortController = new AbortController();
  req.on("close", function handleClientClose() {
    abortController.abort();
  });

  const targetProvider = resolveProvider(provider);

  if (targetProvider === "gemini") {
    try {
      await streamGemini(cleaned, res, abortController.signal, systemPrompt);
      return;
    } catch (geminiErr) {
      if (abortController.signal.aborted) {
        return;
      }
      if (res.headersSent) {
        console.error("[Chat Stream] Gemini error after headers sent:", geminiErr.message);
        return res.end();
      }
      console.warn("[Chat Stream] Gemini stream failed, falling back to OpenAI stream:", geminiErr.message);
    }

    try {
      await streamOpenAI(cleaned, res, abortController.signal, systemPrompt);
      return;
    } catch (openAiErr) {
      if (abortController.signal.aborted) {
        return;
      }
      const errMsg = `[Chat Stream] All providers failed: ${openAiErr.message}\n`;
      console.error(errMsg);
      try {
        require("fs").appendFileSync(require("path").resolve(__dirname, "../server_error.log"), `${new Date().toISOString()} ${errMsg}`);
      } catch (_e) {}
      if (!res.headersSent) {
        return res.status(502).json({
          error: "All LLM providers failed to stream a response: " + openAiErr.message,
          provider: targetProvider,
        });
      }
      return res.end();
    }
  }

  // targetProvider === "openai"
  try {
    await streamOpenAI(cleaned, res, abortController.signal, systemPrompt);
  } catch (openAiErr) {
    if (abortController.signal.aborted) {
      return;
    }
    if (!res.headersSent && process.env.GEMINI_API_KEY) {
      console.warn("[Chat Stream] OpenAI stream failed, attempting Gemini fallback:", openAiErr.message);
      try {
        await streamGemini(cleaned, res, abortController.signal, systemPrompt);
        return;
      } catch (geminiErr) {
        console.warn("[Chat Stream] Gemini fallback also failed:", geminiErr.message);
      }
    }
    const errMsg = `[Chat Stream] All providers failed: ${openAiErr.message}\n`;
    console.error(errMsg);
    try {
      require("fs").appendFileSync(require("path").resolve(__dirname, "../server_error.log"), `${new Date().toISOString()} ${errMsg}`);
    } catch (_e) {}
    if (!res.headersSent) {
      return res.status(502).json({
        error: "All LLM providers failed to stream a response: " + openAiErr.message,
        provider: targetProvider,
      });
    }
    return res.end();
  }
});

module.exports = router;
