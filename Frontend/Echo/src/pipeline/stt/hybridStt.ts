import { startBrowserTranscription, isBrowserSttSupported } from "./browserStt";
import { startRecording, stopRecording } from "./recorder";
import { transcribeAudio } from "./transcribeClient";
import type { TranscriptionController, HybridSttOptions } from "./types";

/**
 * Start a Speculative Dual-Path Hybrid STT session:
 * 1. Streams instant interim words via browser Web Speech API (<50ms display latency).
 * 2. Concurrently captures clean linear audio via MediaRecorder.
 * 3. On speech conclusion (VAD or stop), dispatches the audio to the backend STT engine
 *    (Open-source whisper.cpp or Cloud API) for canonical capitalization, punctuation,
 *    and acoustic accuracy.
 * 4. Gracefully falls back to browser transcript if backend transcription is unavailable.
 */
export async function startHybridTranscription(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (err: Error) => void,
  onEndOfTurn?: () => void,
  onSpeechStarted?: () => void,
  options?: HybridSttOptions
): Promise<TranscriptionController> {
  let isStopped = false;
  let turnFinalized = false;
  let browserController: TranscriptionController | null = null;
  let accumulatedBrowserText = "";
  let lastInterimText = "";

  // 1. Start audio buffer recording concurrently
  try {
    await startRecording();
  } catch (recErr: unknown) {
    const errObj = recErr instanceof Error ? recErr : new Error(String(recErr));
    console.warn("[Hybrid STT] Audio recorder failed, continuing with browser-only mode:", errObj);
  }

  async function finalizeCanonicalTurn(): Promise<void> {
    if (turnFinalized) {
      return;
    }
    turnFinalized = true;

    // Stop browser transcription if still running
    if (browserController) {
      const bc = browserController;
      browserController = null;
      try {
        await bc.stop();
      } catch (_e) {
        // ignore
      }
    }

    // Stop audio recording to get the canonical audio clip
    let audioBlob: Blob | null = null;
    try {
      audioBlob = await stopRecording();
    } catch (_stopErr) {
      audioBlob = null;
    }

    const fallbackTranscript = (accumulatedBrowserText + " " + lastInterimText).trim();

    // If audio was captured and exceeds empty container threshold (~1200 bytes)
    if (audioBlob && audioBlob.size > 1200) {
      if (options?.onProcessing) {
        options.onProcessing();
      }
      try {
        console.log(`[Hybrid STT] Turn concluded. Resolving canonical transcript for ${audioBlob.size} bytes...`);
        const result = await transcribeAudio(audioBlob, {
          engine: options?.enginePreference || "auto",
          language: options?.lang,
        });

        const canonicalText = (result.transcript || "").trim();
        if (canonicalText) {
          console.log(`[Hybrid STT] Canonical transcript resolved via ${result.engine || "backend"}: "${canonicalText}"`);
          onTranscript(canonicalText, true);
        } else if (fallbackTranscript) {
          console.log(`[Hybrid STT] Backend returned empty, using browser transcript: "${fallbackTranscript}"`);
          onTranscript(fallbackTranscript, true);
        } else {
          onTranscript("", true);
        }
      } catch (backendErr: unknown) {
        console.warn("[Hybrid STT] Backend transcription failed, gracefully falling back to browser text:", backendErr);
        if (fallbackTranscript) {
          onTranscript(fallbackTranscript, true);
        } else {
          onError(backendErr instanceof Error ? backendErr : new Error(String(backendErr)));
        }
      }
    } else if (fallbackTranscript) {
      // Audio clip too small for Whisper, commit browser accumulated text
      console.log(`[Hybrid STT] Audio clip small, committing browser text: "${fallbackTranscript}"`);
      onTranscript(fallbackTranscript, true);
    } else {
      onTranscript("", true);
    }

    if (onEndOfTurn) {
      onEndOfTurn();
    }
  }

  // 2. Start Browser STT for live interim feedback
  if (isBrowserSttSupported()) {
    try {
      browserController = startBrowserTranscription(
        function handleBrowserTranscript(text: string, isFinal: boolean) {
          if (turnFinalized || isStopped) return;

          const trimmed = (text || "").trim();
          if (!trimmed) return;

          if (isFinal) {
            accumulatedBrowserText = (accumulatedBrowserText + " " + trimmed).trim();
            lastInterimText = "";
            // Stream partial accumulation to UI without locking as final turn yet
            onTranscript(accumulatedBrowserText, false);
          } else {
            lastInterimText = trimmed;
            const fullInterim = (accumulatedBrowserText + " " + trimmed).trim();
            onTranscript(fullInterim, false);
          }
        },
        function handleBrowserError(err: Error) {
          console.warn("[Hybrid STT] Browser STT error:", err.message);
          // If browser speech fails, don't crash session; let finalizeCanonicalTurn use recorded audio
        },
        function handleBrowserEndOfTurn() {
          if (!turnFinalized && !isStopped) {
            void finalizeCanonicalTurn();
          }
        },
        onSpeechStarted,
        {
          lang: options?.lang,
          silenceThresholdMs: options?.silenceThresholdMs ?? 1300,
          onAudioLevel: options?.onAudioLevel,
        }
      );
    } catch (browserLaunchErr) {
      console.warn("[Hybrid STT] Could not start browser speech recognition:", browserLaunchErr);
    }
  }

  return {
    stop: async function stop(): Promise<void> {
      if (isStopped) {
        return;
      }
      isStopped = true;

      if (!turnFinalized) {
        await finalizeCanonicalTurn();
      }
    },
    getAudioStream: function getAudioStream() {
      return null;
    },
  };
}
