export type TtsProvider = "browser" | "elevenlabs";

export interface QueueItem {
  id: number;
  text: string;
  abortController: AbortController;
  audioPromise: Promise<AudioBuffer | null>;
}
