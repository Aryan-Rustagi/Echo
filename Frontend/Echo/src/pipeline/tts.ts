interface QueueItem {
  id: number;
  text: string;
  abortController: AbortController;
  audioPromise: Promise<AudioBuffer | null>;
}

export type TtsProvider = "browser" | "elevenlabs" | "piper";

let audioContext: AudioContext | null = null;
let queue: QueueItem[] = [];
let isPlaying = false;
let currentSourceNode: AudioBufferSourceNode | null = null;
let nextItemId = 1;
let onFirstAudioCallback: (() => void) | null = null;
let firstAudioFired = false;
let queueDrainResolvers: (() => void)[] = [];
let selectedProvider: TtsProvider = "browser";
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) || "http://localhost:3000";

export function setTtsProvider(provider: TtsProvider): void {
  selectedProvider = provider;
}

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

export function setOnFirstAudio(callback: (() => void) | null): void {
  onFirstAudioCallback = callback;
  firstAudioFired = false;
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(function resolveVoices(resolve) {
    if (!window.speechSynthesis) {
      return resolve([]);
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      return resolve(existing);
    }

    let done = false;
    function finish() {
      if (!done) {
        done = true;
        resolve(window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
      }
    }

    const timer = setTimeout(finish, 1000);
    window.speechSynthesis.onvoiceschanged = function handleVoicesChanged() {
      clearTimeout(timer);
      finish();
    };
  });
}

export function speakWithBrowserTTS(text: string): Promise<void> {
  return new Promise(async function handleSpeech(resolve) {
    if (!window.speechSynthesis) {
      return resolve();
    }

    window.speechSynthesis.cancel();
    const voices = await loadVoices();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.0;

    let preferredVoice: SpeechSynthesisVoice | undefined;
    for (let i = 0; i < voices.length; i += 1) {
      const v = voices[i];
      if (v.lang.startsWith("en") && /zira|female|samantha|victoria|aria|jenny|natural|susan|hazel|karen/i.test(v.name)) {
        preferredVoice = v;
        break;
      }
    }
    if (!preferredVoice) {
      for (let i = 0; i < voices.length; i += 1) {
        const v = voices[i];
        if (v.lang.startsWith("en") && !/david|mark|george|male|guy/i.test(v.name)) {
          preferredVoice = v;
          break;
        }
      }
    }

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    let finished = false;
    function complete() {
      if (!finished) {
        finished = true;
        clearTimeout(watchdogTimer);
        resolve();
      }
    }

    const watchdogMs = text.length * 90 + 3000;
    const watchdogTimer = setTimeout(function handleWatchdog() {
      console.warn("[TTS] Browser SpeechSynthesis watchdog triggered for text:", text.slice(0, 30));
      try {
        window.speechSynthesis.cancel();
      } catch (_e) {
        // ignore
      }
      complete();
    }, watchdogMs);

    utterance.onend = function handleEnd() {
      complete();
    };

    utterance.onerror = function handleError(e: SpeechSynthesisErrorEvent) {
      console.warn("[TTS] SpeechSynthesis error:", e.error);
      complete();
    };

    window.speechSynthesis.speak(utterance);
  });
}

async function synthesizeRemote(text: string, provider: TtsProvider, signal: AbortSignal): Promise<AudioBuffer> {
  const response = await fetch(`${apiBase}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, provider }),
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        detail = payload.error;
      }
    } catch (_error) {
      // Keep the HTTP status when the server does not return JSON.
    }
    throw new Error(`TTS provider failed: ${detail}`);
  }

  const bytes = await response.arrayBuffer();
  return getAudioContext().decodeAudioData(bytes);
}

async function processQueue(): Promise<void> {
  if (isPlaying) {
    return;
  }

  if (queue.length === 0) {
    const resolvers = queueDrainResolvers;
    queueDrainResolvers = [];
    for (let i = 0; i < resolvers.length; i += 1) {
      resolvers[i]();
    }
    return;
  }

  isPlaying = true;
  const item = queue.shift();
  if (!item) {
    isPlaying = false;
    return;
  }

  let audioBuffer: AudioBuffer | null = null;
  try {
    audioBuffer = await item.audioPromise;
  } catch (error) {
    console.warn(`[TTS] ${selectedProvider} failed; using browser speech instead.`, error);
  }

  // Signal first audio start for timing and UI state
  if (!firstAudioFired) {
    firstAudioFired = true;
    if (onFirstAudioCallback) {
      onFirstAudioCallback();
    }
  }

  if (audioBuffer) {
    await new Promise<void>(function playBuffer(resolve) {
      const ctx = getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentSourceNode = source;

      source.onended = function handleEnded() {
        currentSourceNode = null;
        resolve();
      };

      source.start(0);
    });
  } else {
    // Fall back to browser SpeechSynthesis for this sentence
    await speakWithBrowserTTS(item.text);
  }

  isPlaying = false;
  void processQueue();
}

export function enqueueSentence(text: string, turnSignal?: AbortSignal): void {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  if (turnSignal && turnSignal.aborted) {
    return;
  }

  const abortController = new AbortController();

  if (turnSignal) {
    turnSignal.addEventListener("abort", function handleTurnAbort() {
      abortController.abort();
    });
  }

  const item: QueueItem = {
    id: nextItemId += 1,
    text: trimmed,
    abortController: abortController,
    audioPromise:
      selectedProvider === "browser"
        ? Promise.resolve(null)
        : synthesizeRemote(trimmed, selectedProvider, abortController.signal),
  };

  queue.push(item);
  void processQueue();
}

export function stopAll(): void {
  for (let i = 0; i < queue.length; i += 1) {
    try {
      queue[i].abortController.abort();
    } catch (_e) {
      // ignore
    }
  }
  queue = [];

  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch (_e) {
      // ignore
    }
    currentSourceNode = null;
  }

  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (_e) {
      // ignore
    }
  }

  isPlaying = false;
  firstAudioFired = false;

  const resolvers = queueDrainResolvers;
  queueDrainResolvers = [];
  for (let i = 0; i < resolvers.length; i += 1) {
    resolvers[i]();
  }
}

export function waitForQueueDrain(): Promise<void> {
  if (!isPlaying && queue.length === 0) {
    return Promise.resolve();
  }
  return new Promise<void>(function registerResolver(resolve) {
    queueDrainResolvers.push(resolve);
  });
}
