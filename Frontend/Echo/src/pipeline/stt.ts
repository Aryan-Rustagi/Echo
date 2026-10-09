import { API_BASE } from "../config";

export async function transcribe(blob: Blob): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  form.append("audio", blob, `recording.${ext}`);

  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(function handleJsonError() {
      return {};
    });
    throw new Error(err.error || "Transcription failed");
  }

  const data = await res.json();
  return data.transcript ?? "";
}