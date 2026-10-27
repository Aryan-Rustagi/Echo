export * from "./stt/index";
// Backward compatibility alias for transcribe(blob)
import { transcribeAudio } from "./stt/index";
export async function transcribe(blob: Blob): Promise<string> {
  const res = await transcribeAudio(blob);
  return res.transcript || "";
}