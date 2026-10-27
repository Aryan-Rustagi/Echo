import { API_BASE } from "../../config";
import { getStoredToken } from "../../api/client";
import type { Message, LlmProvider } from "./types";

export async function getResponse(
  input: string | Message[],
  provider?: LlmProvider,
  systemPrompt?: string
): Promise<string> {
  const messages: Message[] = typeof input === "string"
    ? [{ role: "user", content: input }]
    : input;

  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      messages: messages,
      provider: provider || "openai",
      systemPrompt: systemPrompt || undefined,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(function handleJsonError() {
      return {};
    })) as { error?: string };
    throw new Error(err.error || "Response generation failed");
  }

  const data = (await res.json()) as { reply?: string };
  return data.reply ?? "";
}

export async function streamResponse(
  input: string | Message[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
  provider?: LlmProvider,
  systemPrompt?: string
): Promise<string> {
  const messages: Message[] = typeof input === "string"
    ? [{ role: "user", content: input }]
    : input;

  const requestController = new AbortController();
  let firstTokenReceived = false;
  let firstTokenTimeout: ReturnType<typeof setTimeout> | null = setTimeout(function abortStalledStream() {
    if (!firstTokenReceived) {
      requestController.abort();
    }
  }, 12000);

  const abortRequest = function abortRequest() {
    requestController.abort();
  };
  signal?.addEventListener("abort", abortRequest, { once: true });

  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        messages: messages,
        provider: provider || "openai",
        systemPrompt: systemPrompt || undefined,
      }),
      signal: requestController.signal,
    });
  } catch (err) {
    if (firstTokenTimeout) {
      clearTimeout(firstTokenTimeout);
      firstTokenTimeout = null;
    }
    signal?.removeEventListener("abort", abortRequest);
    if (signal?.aborted) {
      throw err;
    }
    const fallback = await getResponse(messages, provider, systemPrompt);
    onToken(fallback);
    return fallback;
  }

  if (!res.ok) {
    if (firstTokenTimeout) {
      clearTimeout(firstTokenTimeout);
      firstTokenTimeout = null;
    }
    signal?.removeEventListener("abort", abortRequest);
    const err = (await res.json().catch(function handleJsonError() {
      return {};
    })) as { error?: string };
    throw new Error(err.error || "Streaming response generation failed");
  }

  if (!res.body) {
    if (firstTokenTimeout) {
      clearTimeout(firstTokenTimeout);
      firstTokenTimeout = null;
    }
    signal?.removeEventListener("abort", abortRequest);
    throw new Error("No response body received from server");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulated = "";
  let streamBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      streamBuffer += decoder.decode(value, { stream: true });
      const lines = streamBuffer.split("\n");
      streamBuffer = lines.pop() || "";

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line || !line.startsWith("data: ")) {
          continue;
        }

        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          continue;
        }

        try {
          const parsed = JSON.parse(payload) as { token?: string };
          if (typeof parsed.token === "string" && parsed.token.length > 0) {
            if (!firstTokenReceived) {
              firstTokenReceived = true;
              if (firstTokenTimeout) {
                clearTimeout(firstTokenTimeout);
                firstTokenTimeout = null;
              }
            }
            accumulated += parsed.token;
            onToken(parsed.token);
          }
        } catch (_jsonErr) {
          // ignore non-json SSE chunks
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      throw err;
    }
    if (!accumulated) {
      const fallback = await getResponse(messages, provider, systemPrompt);
      onToken(fallback);
      accumulated = fallback;
    }
  } finally {
    if (firstTokenTimeout) {
      clearTimeout(firstTokenTimeout);
      firstTokenTimeout = null;
    }
    signal?.removeEventListener("abort", abortRequest);
  }

  return accumulated;
}
