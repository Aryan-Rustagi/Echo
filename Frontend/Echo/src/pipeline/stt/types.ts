export type SttEngine =
  | "hybrid"
  | "browser"
  | "deepgram"
  | "speechmatics"
  | "local_whisper";

export interface TranscriptionController {
  stop(): Promise<void>;
  getAudioStream?: () => MediaStream | null;
}

export interface BrowserSttOptions {
  lang?: string;
  silenceThresholdMs?: number;
  onAudioLevel?: (level: number) => void;
}

export interface HybridSttOptions {
  lang?: string;
  silenceThresholdMs?: number;
  enginePreference?: "auto" | "local" | "cloud";
  onAudioLevel?: (level: number) => void;
  onProcessing?: () => void;
}

export interface TranscribeResponse {
  transcript: string;
  engine?: "whisper.cpp" | "groq" | "openai" | "browser_fallback";
  durationMs?: number;
}
