const express = require("express");
const router = express.Router();

const SYSTEM_PROMPT = "You are Echo, a helpful voice assistant. Reply in one short sentence. Do not use markdown, bullet points, or emojis. Do not introduce yourself. Respond directly to what the user said.";

router.post("/", async (req, res) => {
  let { messages, message } = req.body;

  // Support single message or messages array
  if (!messages && typeof message === "string" && message.trim()) {
    messages = [{ role: "user", content: message }];
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided" });
  }

  try {
    const isGroq = Boolean(process.env.GROQ_API_KEY);
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    const url = isGroq
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const model = isGroq ? "openai/gpt-oss-120b" : "gpt-4o-mini";

    if (!apiKey) {
      console.error("[Chat] Neither GROQ_API_KEY nor OPENAI_API_KEY is configured in .env");
      return res.status(500).json({ error: "No LLM API key configured" });
    }

    const payloadMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 80,
        messages: payloadMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Chat] LLM API Error:", response.status, errorText);
      return res.status(500).json({ error: "Response generation failed" });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return res.json({ reply });
  } catch (err) {
    console.error("[Chat] Server Error:", err);
    return res.status(500).json({ error: "Response generation failed" });
  }
});

module.exports = router;
