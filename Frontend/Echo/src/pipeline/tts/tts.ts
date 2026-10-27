import { API_BASE } from "../../config";
import { getStoredToken } from "../../api/client";
import type { TtsProvider, QueueItem } from "./types";

let audioContext: AudioContext | null = null;
let outputAnalyserNode: AnalyserNode | null = null;
let queue: QueueItem[] = [];
let isPlaying = false;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentPlayingItem: QueueItem | null = null;
let nextItemId = 1;
let onFirstAudioCallback: (() => void) | null = null;
let onFallbackNoticeCallback: ((notice: string | null) => void) | null = null;
let firstAudioFired = false;
let queueDrainResolvers: (() => void)[] = [];
let selectedProvider: TtsProvider = "elevenlabs";
let fallbackToBrowserForCurrentTurn = false;

export function setTtsProvider(provider: TtsProvider): void {
  selectedProvider = provider;
}

export function getTtsProvider(): TtsProvider {
  return selectedProvider;
}

export function setOnFallbackNotice(callback: ((notice: string | null) => void) | null): void {
  onFallbackNoticeCallback = callback;
}

export function startNewTurnAudio(): void {
  firstAudioFired = false;
  fallbackToBrowserForCurrentTurn = false;
  if (onFallbackNoticeCallback) {
    onFallbackNoticeCallback(null);
  }
}

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

export function getOutputAnalyser(): AnalyserNode {
  const ctx = getAudioContext();
  if (!outputAnalyserNode) {
    outputAnalyserNode = ctx.createAnalyser();
    outputAnalyserNode.fftSize = 256;
    outputAnalyserNode.smoothingTimeConstant = 0.8;
    outputAnalyserNode.connect(ctx.destination);
  }
  return outputAnalyserNode;
}

export function getOutputAudioLevel(): number {
  if (!outputAnalyserNode || !isPlaying || !currentSourceNode) {
    return 0;
  }
  const dataArray = new Uint8Array(outputAnalyserNode.frequencyBinCount);
  outputAnalyserNode.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i += 1) {
    sum += dataArray[i];
  }
  return sum / (dataArray.length * 255);
}

export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

export function setOnFirstAudio(callback: (() => void) | null): void {
  onFirstAudioCallback = callback;
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

export async function speakWithBrowserTTS(text: string): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (_e) {
    // ignore
  }

  const voices = await loadVoices();

  return new Promise<void>(function handleSpeech(resolve) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.volume = 1.0;

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
      complete();
    }, watchdogMs);

    utterance.onend = function handleEnd() {
      complete();
    };

    utterance.onerror = function handleError(e: SpeechSynthesisErrorEvent) {
      console.warn("[TTS] SpeechSynthesis error:", e.error);
      complete();
    };

    try {
      window.speechSynthesis.speak(utterance);
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (_speakErr) {
      complete();
    }
  });
}

async function synthesizeRemote(text: string, provider: TtsProvider, signal: AbortSignal): Promise<AudioBuffer> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: headers,
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
      // Keep fallback detail
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
    currentPlayingItem = null;
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
    currentPlayingItem = null;
    return;
  }

  currentPlayingItem = item;

  let audioBuffer: AudioBuffer | null = null;
  if (!fallbackToBrowserForCurrentTurn && selectedProvider !== "browser") {
    try {
      audioBuffer = await item.audioPromise;
    } catch (error) {
      console.warn(`[TTS] ${selectedProvider} failed for current answer; sticking to browser voice:`, error);
      fallbackToBrowserForCurrentTurn = true;
      if (onFallbackNoticeCallback) {
        onFallbackNoticeCallback("Using browser voice (ElevenLabs unavailable)");
      }
    }
  }

  // If the turn or item was aborted while fetching/decoding audio, exit immediately!
  if (item.abortController.signal.aborted) {
    currentPlayingItem = null;
    isPlaying = false;
    void processQueue();
    return;
  }

  // Signal first audio start for timing and UI state
  if (!firstAudioFired) {
    firstAudioFired = true;
    if (onFirstAudioCallback) {
      onFirstAudioCallback();
    }
  }

  if (audioBuffer && !fallbackToBrowserForCurrentTurn) {
    await new Promise<void>(function playBuffer(resolve) {
      if (item.abortController.signal.aborted) {
        return resolve();
      }

      const ctx = getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const analyser = getOutputAnalyser();
      source.connect(analyser);
      currentSourceNode = source;

      let settled = false;
      function handleDone() {
        if (!settled) {
          settled = true;
          item.abortController.signal.removeEventListener("abort", handleAbort);
          currentSourceNode = null;
          resolve();
        }
      }

      function handleAbort() {
        try {
          source.stop();
          source.disconnect();
        } catch (_e) {
          // ignore
        }
        handleDone();
      }

      source.onended = handleDone;
      item.abortController.signal.addEventListener("abort", handleAbort, { once: true });

      try {
        source.start(0);
      } catch (_startErr) {
        handleDone();
      }
    });
  } else {
    // Fall back to browser SpeechSynthesis for this sentence if not aborted
    if (!item.abortController.signal.aborted) {
      await speakWithBrowserTTS(item.text);
    }
  }

  currentPlayingItem = null;
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
    function handleTurnAbort() {
      abortController.abort();
    }
    turnSignal.addEventListener("abort", handleTurnAbort, { once: true });
  }

  const shouldUseBrowser = fallbackToBrowserForCurrentTurn || selectedProvider === "browser";

  const item: QueueItem = {
    id: nextItemId += 1,
    text: trimmed,
    abortController: abortController,
    audioPromise: shouldUseBrowser
      ? Promise.resolve(null)
      : synthesizeRemote(trimmed, selectedProvider, abortController.signal),
  };

  queue.push(item);
  void processQueue();
}

export function stopAll(): void {
  if (currentPlayingItem) {
    try {
      currentPlayingItem.abortController.abort();
    } catch (_e) {
      // ignore
    }
    currentPlayingItem = null;
  }

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
  // Note: firstAudioFired is NOT reset here per Phase 3.2 rules. It is reset only when startNewTurnAudio() is called.

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
