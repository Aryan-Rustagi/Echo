import { API_BASE } from "../config";

export type Message = { role: "user" | "assistant"; content: string };

export async function getResponse(input: string | Message[]): Promise<string> {
  const messages: Message[] = typeof input === "string"
    ? [{ role: "user", content: input }]
    : input;

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
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
  signal?: AbortSignal
): Promise<string> {
  const messages: Message[] = typeof input === "string"
    ? [{ role: "user", content: input }]
    : input;

  const requestController = new AbortController();
  const timeout = setTimeout(function abortStalledStream() {
    requestController.abort();
  }, 2500);
  const abortRequest = function abortRequest() {
    requestController.abort();
  };
  signal?.addEventListener("abort", abortRequest, { once: true });

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
      signal: requestController.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
    if (signal?.aborted) {
      throw err;
    }
    const fallback = await getResponse(messages);
    onToken(fallback);
    return fallback;
  }

  if (!res.ok) {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
    const err = (await res.json().catch(function handleJsonError() {
      return {};
    })) as { error?: string };
    throw new Error(err.error || "Streaming response generation failed");
  }

  if (!res.body) {
    clearTimeout(timeout);
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
    const fallback = await getResponse(messages);
    if (!accumulated) {
      onToken(fallback);
      accumulated = fallback;
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }

  return accumulated;
}
