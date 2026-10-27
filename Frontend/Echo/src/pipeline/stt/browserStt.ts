import type { TranscriptionController, BrowserSttOptions } from "./types";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstanceLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onaudiostart: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onaudioend: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onerror: ((this: SpeechRecognitionInstanceLike, ev: SpeechRecognitionErrorEventLike) => unknown) | null;
  onnomatch: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onresult: ((this: SpeechRecognitionInstanceLike, ev: SpeechRecognitionEventLike) => unknown) | null;
  onsoundstart: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onsoundend: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onspeechstart: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onspeechend: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onstart: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstanceLike;

/**
 * Safely retrieve the browser's native SpeechRecognition constructor (standard or webkit).
 */
export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    mozSpeechRecognition?: SpeechRecognitionConstructor;
    msSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return (
    win.SpeechRecognition ||
    win.webkitSpeechRecognition ||
    win.mozSpeechRecognition ||
    win.msSpeechRecognition ||
    null
  );
}

/**
 * Returns true if the current browser supports native SpeechRecognition.
 */
export function isBrowserSttSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

/**
 * Start real-time speech transcription using the browser's native Web Speech API.
 *
 * Hardened Features:
 * - Direct uncontended microphone capture via browser speech subsystem
 * - Safe session recovery on Chromium 'no-speech' and 'onend' events
 * - Dynamic audio level feedback driven by native speech recognition activity events
 * - Adaptive Silence VAD detection for automatic conversational turns
 */
export function startBrowserTranscription(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (err: Error) => void,
  onEndOfTurn?: () => void,
  onSpeechStarted?: () => void,
  options?: BrowserSttOptions
): TranscriptionController {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionCtor) {
    throw new Error(
      "Browser Speech Recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or switch to Deepgram in settings."
    );
  }

  let recognition: SpeechRecognitionInstanceLike | null = null;
  let isStopped = false;
  let isTurnCompleted = false;
  let accumulatedFinalText = "";
  let currentInterimText = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let levelResetTimer: ReturnType<typeof setTimeout> | null = null;
  let speechStartedFired = false;
  let consecutiveNetworkErrors = 0;
  const silenceThresholdMs = options?.silenceThresholdMs ?? 1400;

  function clearSilenceTimer(): void {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function pulseAudioLevel(level: number): void {
    if (options?.onAudioLevel && !isStopped) {
      options.onAudioLevel(level);
      if (levelResetTimer) {
        clearTimeout(levelResetTimer);
      }
      if (level > 0) {
        levelResetTimer = setTimeout(() => {
          if (!isStopped) {
            options.onAudioLevel?.(0);
          }
        }, 350);
      }
    }
  }

  function scheduleSilenceDetection(): void {
    clearSilenceTimer();
    if (isStopped || isTurnCompleted) {
      return;
    }

    silenceTimer = setTimeout(function handleSilenceElapsed() {
      if (isStopped || isTurnCompleted) {
        return;
      }

      const totalSpoken = (accumulatedFinalText + " " + currentInterimText).trim();
      if (totalSpoken.length > 0) {
        if (currentInterimText.trim()) {
          accumulatedFinalText = totalSpoken;
          onTranscript(currentInterimText.trim(), true);
          currentInterimText = "";
        }

        isTurnCompleted = true;
        clearSilenceTimer();
        pulseAudioLevel(0);

        if (onEndOfTurn) {
          onEndOfTurn();
        }

        try {
          if (recognition) {
            recognition.stop();
          }
        } catch (_stopErr) {
          // ignore
        }
      }
    }, silenceThresholdMs);
  }

  function createRecognitionInstance(): SpeechRecognitionInstanceLike {
    const rec = new SpeechRecognitionCtor!();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const defaultLang =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";
    rec.lang = options?.lang || defaultLang;

    rec.onstart = function handleStart(): void {
      console.log("[Browser STT] SpeechRecognition session started (lang: " + rec.lang + ")");
    };

    rec.onsoundstart = function handleSoundStart(): void {
      pulseAudioLevel(55);
      if (!speechStartedFired && onSpeechStarted) {
        speechStartedFired = true;
        onSpeechStarted();
      }
    };

    rec.onspeechstart = function handleSpeechStart(): void {
      pulseAudioLevel(75);
      if (!speechStartedFired && onSpeechStarted) {
        speechStartedFired = true;
        onSpeechStarted();
      }
    };

    rec.onsoundend = function handleSoundEnd(): void {
      pulseAudioLevel(0);
    };

    rec.onspeechend = function handleSpeechEnd(): void {
      pulseAudioLevel(0);
    };

    rec.onresult = function handleResult(event: SpeechRecognitionEventLike): void {
      if (isStopped || isTurnCompleted) {
        return;
      }

      consecutiveNetworkErrors = 0;

      if (!speechStartedFired && onSpeechStarted) {
        speechStartedFired = true;
        onSpeechStarted();
      }

      // Generate dynamic audio meter pulse for visual feedback
      pulseAudioLevel(Math.min(95, Math.floor(45 + Math.random() * 45)));

      let newFinalPiece = "";
      let interimPiece = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const phrase = res[0] ? res[0].transcript : "";
        if (res.isFinal) {
          newFinalPiece += (newFinalPiece ? " " : "") + phrase.trim();
        } else {
          interimPiece += (interimPiece ? " " : "") + phrase.trim();
        }
      }

      if (newFinalPiece) {
        accumulatedFinalText += (accumulatedFinalText ? " " : "") + newFinalPiece;
        onTranscript(newFinalPiece, true);
        currentInterimText = "";
      }

      if (interimPiece) {
        currentInterimText = interimPiece;
        onTranscript(currentInterimText, false);
      }

      scheduleSilenceDetection();
    };

    rec.onerror = function handleError(event: SpeechRecognitionErrorEventLike): void {
      if (isStopped || isTurnCompleted) {
        return;
      }

      const err = event.error;

      // 'no-speech' is a normal pause in speech; do not abort session
      if (err === "no-speech") {
        pulseAudioLevel(0);
        return;
      }

      // 'aborted' is triggered when stop/abort is called
      if (err === "aborted") {
        return;
      }

      if (err === "not-allowed" || err === "service-not-allowed") {
        isStopped = true;
        clearSilenceTimer();
        pulseAudioLevel(0);
        onError(
          new Error(
            "Microphone permission blocked. Please click the lock or camera icon in your browser address bar, set Microphone to 'Allow', and refresh."
          )
        );
        return;
      }

      if (err === "audio-capture") {
        isStopped = true;
        clearSilenceTimer();
        pulseAudioLevel(0);
        onError(
          new Error(
            "No audio input hardware detected or microphone is in use by another application. Please check your system sound settings."
          )
        );
        return;
      }

      if (err === "network") {
        consecutiveNetworkErrors += 1;
        console.warn(`[Browser STT] Speech service network error (${consecutiveNetworkErrors}/2)`);
        if (consecutiveNetworkErrors >= 2) {
          isStopped = true;
          clearSilenceTimer();
          pulseAudioLevel(0);
          onError(
            new Error(
              "Browser Speech Recognition network connection failed. Check your internet connection or switch to Deepgram Nova-3 in settings."
            )
          );
        }
        return;
      }

      console.warn(`[Browser STT] Recognition error: ${err}`);
    };

    rec.onend = function handleEnd(): void {
      pulseAudioLevel(0);
      if (isStopped || isTurnCompleted) {
        return;
      }

      // Chromium timeout recovery: recreate recognition instance cleanly
      if (restartTimer) {
        clearTimeout(restartTimer);
      }
      restartTimer = setTimeout(function restartRecognition() {
        if (!isStopped && !isTurnCompleted) {
          try {
            recognition = createRecognitionInstance();
            recognition.start();
          } catch (_startErr) {
            console.warn("[Browser STT] Recognition restart failed:", _startErr);
          }
        }
      }, 100);
    };

    return rec;
  }

  try {
    recognition = createRecognitionInstance();
    recognition.start();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to start Browser Speech Recognition: ${message}`);
  }

  return {
    stop: async function stop(): Promise<void> {
      if (isStopped) {
        return;
      }
      isStopped = true;
      isTurnCompleted = true;
      clearSilenceTimer();

      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }

      if (levelResetTimer) {
        clearTimeout(levelResetTimer);
        levelResetTimer = null;
      }

      pulseAudioLevel(0);

      try {
        if (recognition) {
          recognition.abort();
          recognition = null;
        }
      } catch (_e) {
        // ignore
      }
    },
    getAudioStream: function getAudioStream() {
      return null;
    },
  };
}
