import { API_BASE } from "../../config";
import { getStoredToken } from "../../api/client";
import type { TranscribeResponse } from "./types";

export interface TranscribeOptions {
  engine?: "auto" | "local" | "cloud";
  language?: string;
}

export async function transcribeAudio(
  blob: Blob,
  options?: TranscribeOptions
): Promise<TranscribeResponse> {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `recording.${ext}`);

  if (options?.engine) {
    form.append("engine", options.engine);
  }
  if (options?.language) {
    form.append("language", options.language);
  }

  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    const err = (await res.json().catch(function handleJsonError() {
      return {};
    })) as { error?: string };
    throw new Error(err.error || `Transcription failed with HTTP ${res.status}`);
  }

  const data = (await res.json()) as TranscribeResponse;
  return {
    transcript: data.transcript ?? "",
    engine: data.engine,
    durationMs: data.durationMs,
  };
}
