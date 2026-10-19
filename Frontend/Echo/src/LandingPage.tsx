import { useState, useRef, useEffect, useMemo } from "react";
import { startBrowserTranscription, isBrowserSttSupported } from "./pipeline/browserStt";
import { startRealtimeTranscription, type TranscriptionController } from "./pipeline/deepgram";
import { startSpeechmaticsTranscription } from "./pipeline/speechmatics";
import { startRecording, stopRecording } from "./pipeline/recorder";
import { transcribe } from "./pipeline/stt";
import { streamResponse, type Message, type LlmProvider } from "./pipeline/llm";
import { createSentenceSplitter } from "./pipeline/sentences";
import {
  enqueueSentence,
  stopAll,
  resumeAudioContext,
  setOnFirstAudio,
  waitForQueueDrain,
  setTtsProvider,
  type TtsProvider,
} from "./pipeline/tts";
import { useTheme } from "./context/ThemeContext";
import { useAuth } from "./context/AuthContext";

type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";
type Engine = "browser" | "deepgram" | "speechmatics";

interface FinishTurnFn {
  (): Promise<void>;
}

export interface LandingPageProps {
  onNavigate?: (view: "landing" | "login" | "signup" | "studio") => void;
  initialView?: "studio";
}

export default function LandingPage({ onNavigate }: LandingPageProps = {}) {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const [activeView, setActiveView] = useState<"studio">("studio");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>("idle");
  const [engine, setEngine] = useState<Engine>("browser");
  const [sttLanguage, setSttLanguage] = useState<string>("en-US");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("openai");
  const [ttsProvider, setTtsProviderState] = useState<TtsProvider>("elevenlabs");
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [fallbackNotice, setFallbackNotice] = useState("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [replayingIdx, setReplayingIdx] = useState<number | null>(null);
  const [textInput, setTextInput] = useState("");
  const [audioVolume, setAudioVolume] = useState<number>(0);

  const statusRef = useRef<Status>("idle");
  const messagesRef = useRef<Message[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const finalizedTextRef = useRef("");
  const latestTranscriptRef = useRef("");
  const turnActiveRef = useRef<boolean>(false);
  const isFallbackRef = useRef<boolean>(false);
  const continuousModeRef = useRef<boolean>(false);
  const llmProviderRef = useRef<LlmProvider>("openai");
  const transcriptionControllerRef = useRef<TranscriptionController | null>(null);
  const finishTurnRef = useRef<FinishTurnFn | null>(null);
  const turnAbortControllerRef = useRef<AbortController | null>(null);
  const speechEndTimestampRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isNativeSttSupported = useMemo(function checkBrowserStt() {
    return isBrowserSttSupported();
  }, []);

  function updateStatus(newStatus: Status): void {
    statusRef.current = newStatus;
    setStatus(newStatus);
  }

  useEffect(function syncTtsProviderOnMount() {
    setTtsProvider("elevenlabs");
  }, []);

  useEffect(function handleScroll() {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, transcript, response, status]);

  useEffect(function cleanupSilenceTimer() {
    return function cleanup() {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (turnAbortControllerRef.current) {
        turnAbortControllerRef.current.abort();
      }
      stopAll();
      if (transcriptionControllerRef.current) {
        void transcriptionControllerRef.current.stop();
      }
    };
  }, []);

  useEffect(function setupKeyboardShortcut() {
    function handleKeyDown(e: KeyboardEvent) {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        if (e.key === "Escape" && showSettings) {
          setShowSettings(false);
        }
        return;
      }
      if (e.key === "Escape") {
        if (showSettings) {
          setShowSettings(false);
        }
        return;
      }
      if (e.code === "Space" && !e.repeat && activeView === "studio") {
        e.preventDefault();
        void handleToggle();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSettings, activeView]);

  async function handleNewSession() {
    turnActiveRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    isFallbackRef.current = false;
    setFallbackNotice("");
    setLatencyMs(null);

    if (turnAbortControllerRef.current) {
      turnAbortControllerRef.current.abort();
      turnAbortControllerRef.current = null;
    }

    stopAll();

    if (transcriptionControllerRef.current) {
      const controller = transcriptionControllerRef.current;
      transcriptionControllerRef.current = null;
      try {
        await controller.stop();
      } catch (_e) {
        // ignore
      }
    }

    try {
      await stopRecording();
    } catch (_e) {
      // ignore
    }

    messagesRef.current = [];
    setMessages([]);
    setTranscript("");
    latestTranscriptRef.current = "";
    setResponse("");
    setErrorMsg("");
    setTextInput("");
    setAudioVolume(0);
    updateStatus("idle");
  }

  async function triggerDeepgramOrWhisperFallback(
    reason: string,
    onTranscriptCb?: (text: string, isFinal: boolean) => void,
    onEndOfTurnCb?: () => void
  ): Promise<void> {
    console.warn("Browser STT issue, attempting Deepgram Nova-3 realtime fallback:", reason);
    setFallbackNotice(`Browser STT notice (${reason}) → Switched to Deepgram Nova-3.`);

    if (transcriptionControllerRef.current) {
      const prev = transcriptionControllerRef.current;
      transcriptionControllerRef.current = null;
      try {
        await prev.stop();
      } catch (_e) {
        // ignore
      }
    }

    try {
      const controller = await startRealtimeTranscription(
        onTranscriptCb || ((t, f) => {
          if (f) {
            finalizedTextRef.current += (finalizedTextRef.current ? " " : "") + t.trim();
            latestTranscriptRef.current = finalizedTextRef.current;
            setTranscript(finalizedTextRef.current);
          } else {
            const combined = (finalizedTextRef.current ? finalizedTextRef.current + " " : "") + t.trim();
            latestTranscriptRef.current = combined;
            setTranscript(combined);
          }
        }),
        async (dgErr) => {
          await triggerWhisperFallback(dgErr.message || "Deepgram socket failure");
        },
        onEndOfTurnCb || finishTurn,
        handleSpeechStarted
      );
      transcriptionControllerRef.current = controller;
    } catch (_dgErr: any) {
      await triggerWhisperFallback(reason);
    }
  }

  async function triggerWhisperFallback(reason: string): Promise<void> {
    console.warn("Realtime engine failed, activating Whisper fallback:", reason);
    setFallbackNotice(`Realtime engine switched (${reason}) → Whisper fallback activated.`);
    isFallbackRef.current = true;
    turnActiveRef.current = true;

    if (transcriptionControllerRef.current) {
      const controller = transcriptionControllerRef.current;
      transcriptionControllerRef.current = null;
      try {
        await controller.stop();
      } catch (_e) {
        // ignore
      }
    }

    try {
      await startRecording();
      turnActiveRef.current = true;
      updateStatus("recording");
    } catch (recErr: unknown) {
      turnActiveRef.current = false;
      isFallbackRef.current = false;
      const message = recErr instanceof Error ? recErr.message : "Microphone fallback error";
      updateStatus("error");
      setErrorMsg(message);
    }
  }

  async function finishTurn(): Promise<void> {
    // Guard against duplicate execution
    if (statusRef.current !== "recording" && !turnActiveRef.current) {
      return;
    }
    turnActiveRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setAudioVolume(0);

    // Capture t_speech_end timestamp
    if (speechEndTimestampRef.current === 0) {
      speechEndTimestampRef.current = performance.now();
    }
    const t_speech_end = speechEndTimestampRef.current;

    // Abort any prior in-flight turn
    if (turnAbortControllerRef.current) {
      turnAbortControllerRef.current.abort();
    }
    const turnAbortController = new AbortController();
    turnAbortControllerRef.current = turnAbortController;

    // Flush recording / socket
    if (isFallbackRef.current) {
      updateStatus("transcribing");
      try {
        const audioBlob = await stopRecording();
        const text = await transcribe(audioBlob);
        finalizedTextRef.current = text;
        latestTranscriptRef.current = text;
        setTranscript(text);
      } catch (sttErr: unknown) {
        const message = sttErr instanceof Error ? sttErr.message : "Whisper transcription failed";
        setErrorMsg(message);
        updateStatus("error");
        return;
      }
    } else {
      if (transcriptionControllerRef.current) {
        const controller = transcriptionControllerRef.current;
        transcriptionControllerRef.current = null;
        try {
          await controller.stop();
        } catch (_stopErr) {
          // ignore
        }
      }
    }

    let currentText = latestTranscriptRef.current.trim() || finalizedTextRef.current.trim();
    if (currentText) {
      finalizedTextRef.current = currentText;
      latestTranscriptRef.current = currentText;
      setTranscript(currentText);
    }

    if (!currentText) {
      setErrorMsg("No speech detected. Tap or hold Space to talk.");
      updateStatus("idle");
      return;
    }

    try {
      updateStatus("thinking");
      setResponse("");

      const userMsg: Message = { role: "user", content: currentText };
      const updated = [...messagesRef.current, userMsg];
      messagesRef.current = updated;
      setMessages(updated);

      let t_first_token: number | null = null;
      let t_first_audio: number | null = null;

      setOnFirstAudio(function handleFirstAudio() {
        t_first_audio = performance.now();
        const latencyToFirstAudio = t_first_audio - t_speech_end;
        setLatencyMs(Math.round(latencyToFirstAudio));
        console.log(`[Timing] First Audio Latency: ${latencyToFirstAudio.toFixed(1)}ms`);
        updateStatus("speaking");
      });

      const splitter = createSentenceSplitter(function handleSentence(sentence: string) {
        if (!turnAbortController.signal.aborted) {
          enqueueSentence(sentence, turnAbortController.signal);
        }
      });

      const recent = updated.slice(-8);
      const fullReply = await streamResponse(
        recent,
        function handleToken(token: string) {
          if (t_first_token === null) {
            t_first_token = performance.now();
            console.log(`[Timing] TTFT: ${(t_first_token - t_speech_end).toFixed(1)}ms`);
          }
          splitter.push(token);
          setResponse(function appendToken(prev) {
            return prev + token;
          });
        },
        turnAbortController.signal,
        llmProviderRef.current
      );

      splitter.flush();

      if (fullReply.trim()) {
        const withAssistant: Message[] = [
          ...messagesRef.current,
          { role: "assistant", content: fullReply.trim() },
        ];
        messagesRef.current = withAssistant;
        setMessages(withAssistant);
      }

      await waitForQueueDrain();
    } catch (err: unknown) {
      if (turnAbortController.signal.aborted) {
        console.log("[Turn] Aborted by barge-in or session reset");
        return;
      }
      const message = err instanceof Error ? err.message : "LLM error";
      setErrorMsg(message);
      updateStatus("error");
      return;
    }

    updateStatus("idle");

    // Continuous mode: reopen mic automatically after Echo finishes speaking
    if (continuousModeRef.current) {
      setTimeout(function triggerNextTurn() {
        if (continuousModeRef.current && statusRef.current === "idle") {
          void startTurn();
        }
      }, 250);
    }
  }

  // Barge-in: called when user starts speaking while assistant is thinking or speaking
  function handleSpeechStarted(): void {
    if (statusRef.current === "speaking" || statusRef.current === "thinking") {
      console.log("[Barge-in] SpeechStarted detected while assistant was active. Interrupting...");
      stopAll();

      if (turnAbortControllerRef.current) {
        turnAbortControllerRef.current.abort();
        turnAbortControllerRef.current = null;
      }

      finalizedTextRef.current = "";
      latestTranscriptRef.current = "";
      setTranscript("");
      setResponse("");
      turnActiveRef.current = true;
      speechEndTimestampRef.current = 0;
      updateStatus("recording");
    }
  }

  async function startTurn(): Promise<void> {
    try {
      await resumeAudioContext();

      setErrorMsg("");
      setTranscript("");
      setResponse("");
      setFallbackNotice("");
      finalizedTextRef.current = "";
      latestTranscriptRef.current = "";
      turnActiveRef.current = true;
      isFallbackRef.current = false;
      speechEndTimestampRef.current = 0;
      updateStatus("recording");

      finishTurnRef.current = finishTurn;

      function onTranscript(text: string, isFinal: boolean) {
        const trimmed = (text || "").trim();
        if (!trimmed) {
          return;
        }

        if (isFinal) {
          finalizedTextRef.current += (finalizedTextRef.current ? " " : "") + trimmed;
          latestTranscriptRef.current = finalizedTextRef.current;
          setTranscript(finalizedTextRef.current);
        } else {
          const combined = (finalizedTextRef.current ? finalizedTextRef.current + " " : "") + trimmed;
          latestTranscriptRef.current = combined;
          setTranscript(combined);
        }

        const activeText = latestTranscriptRef.current.trim();
        if (activeText) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = setTimeout(function finishAfterSilence() {
            const currentSpoken = finalizedTextRef.current.trim() || latestTranscriptRef.current.trim();
            if (turnActiveRef.current && currentSpoken) {
              speechEndTimestampRef.current = performance.now();
              void finishTurn();
            }
          }, 1400);
        }
      }

      async function onError(err: Error) {
        await triggerWhisperFallback(err.message || "stream error");
      }

      function onEndOfTurn() {
        const currentSpoken = finalizedTextRef.current.trim() || latestTranscriptRef.current.trim();
        if (turnActiveRef.current && currentSpoken) {
          speechEndTimestampRef.current = performance.now();
          void finishTurn();
        }
      }

      if (engine === "browser") {
        try {
          const controller = await startBrowserTranscription(
            onTranscript,
            async function handleBrowserSttErr(bErr) {
              await triggerDeepgramOrWhisperFallback(bErr.message, onTranscript, onEndOfTurn);
            },
            onEndOfTurn,
            handleSpeechStarted,
            {
              lang: sttLanguage,
              silenceThresholdMs: 1400,
              onAudioLevel: function handleLevel(level: number) {
                setAudioVolume(level);
              },
            }
          );
          transcriptionControllerRef.current = controller;
        } catch (initErr: unknown) {
          const message = initErr instanceof Error ? initErr.message : "Browser STT unavailable";
          await triggerDeepgramOrWhisperFallback(message, onTranscript, onEndOfTurn);
        }
      } else if (engine === "deepgram") {
        const controller = await startRealtimeTranscription(
          onTranscript,
          onError,
          onEndOfTurn,
          handleSpeechStarted
        );
        transcriptionControllerRef.current = controller;
      } else {
        const controller = await startSpeechmaticsTranscription(onTranscript, onError);
        transcriptionControllerRef.current = controller;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "realtime connection error";
      await triggerDeepgramOrWhisperFallback(message);
    }
  }

  async function handleToggle(): Promise<void> {
    const currentStatus = statusRef.current;

    if (currentStatus === "recording") {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      speechEndTimestampRef.current = performance.now();
      turnActiveRef.current = true;
      await finishTurn();
    } else if (currentStatus === "speaking" || currentStatus === "thinking") {
      stopAll();
      if (turnAbortControllerRef.current) {
        turnAbortControllerRef.current.abort();
        turnAbortControllerRef.current = null;
      }
      turnActiveRef.current = false;
      updateStatus("idle");
    } else {
      await startTurn();
    }
  }

  async function handleSendText(customText?: string): Promise<void> {
    const textToSend = (customText ?? textInput).trim();
    if (!textToSend) return;

    if (statusRef.current === "recording") {
      await finishTurn();
      return;
    }
    if (statusRef.current === "speaking" || statusRef.current === "thinking") {
      stopAll();
      if (turnAbortControllerRef.current) {
        turnAbortControllerRef.current.abort();
        turnAbortControllerRef.current = null;
      }
    }

    setTextInput("");
    setErrorMsg("");
    setTranscript("");
    setResponse("");
    setFallbackNotice("");
    finalizedTextRef.current = textToSend;
    latestTranscriptRef.current = textToSend;
    turnActiveRef.current = false;
    speechEndTimestampRef.current = performance.now();

    try {
      await resumeAudioContext();
    } catch (_e) {
      // ignore
    }

    if (turnAbortControllerRef.current) {
      turnAbortControllerRef.current.abort();
    }
    const turnAbortController = new AbortController();
    turnAbortControllerRef.current = turnAbortController;

    const t_speech_end = speechEndTimestampRef.current;

    try {
      updateStatus("thinking");
      setResponse("");

      const userMsg: Message = { role: "user", content: textToSend };
      const updated = [...messagesRef.current, userMsg];
      messagesRef.current = updated;
      setMessages(updated);

      setOnFirstAudio(function handleFirstAudio() {
        const t_first_audio = performance.now();
        const latencyToFirstAudio = t_first_audio - t_speech_end;
        setLatencyMs(Math.round(latencyToFirstAudio));
        updateStatus("speaking");
      });

      const splitter = createSentenceSplitter(function handleSentence(sentence: string) {
        if (!turnAbortController.signal.aborted) {
          enqueueSentence(sentence, turnAbortController.signal);
        }
      });

      const recent = updated.slice(-8);
      const fullReply = await streamResponse(
        recent,
        function handleToken(token: string) {
          splitter.push(token);
          setResponse(function appendToken(prev) {
            return prev + token;
          });
        },
        turnAbortController.signal,
        llmProviderRef.current
      );

      splitter.flush();

      if (fullReply.trim()) {
        const withAssistant: Message[] = [
          ...messagesRef.current,
          { role: "assistant", content: fullReply.trim() },
        ];
        messagesRef.current = withAssistant;
        setMessages(withAssistant);
      }

      await waitForQueueDrain();
    } catch (err: unknown) {
      if (turnAbortController.signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : "LLM error";
      setErrorMsg(message);
      updateStatus("error");
      return;
    }

    updateStatus("idle");
  }

  async function handleReplaySpeech(text: string, idx: number): Promise<void> {
    try {
      await resumeAudioContext();
      stopAll();
      setReplayingIdx(idx);
      updateStatus("speaking");
      const abortController = new AbortController();
      turnAbortControllerRef.current = abortController;
      enqueueSentence(text, abortController.signal);
      await waitForQueueDrain();
    } catch (_e) {
      // ignore
    } finally {
      setReplayingIdx(null);
      updateStatus("idle");
    }
  }

  function handleCopyMessage(text: string, idx: number): void {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }

  function handleContinuousChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const checked = e.target.checked;
    setContinuousMode(checked);
    continuousModeRef.current = checked;
  }

  function handleEngineChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    setEngine(e.target.value as Engine);
  }

  function handleLlmProviderChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const chosen = e.target.value as LlmProvider;
    setLlmProvider(chosen);
    llmProviderRef.current = chosen;
  }

  function handleTtsProviderChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const chosen = e.target.value as TtsProvider;
    setTtsProviderState(chosen);
    setTtsProvider(chosen);
  }


  return (
    <div className="container">
      {/* Top Header Bar */}
      <header className="header-bar">
        <div className="brand-group">
          <div className="brand-tag-wrapper">
            <span className="brand-beacon"></span>
            <span className="brand-tag">ECHO VOICE AI</span>
            <span className="brand-version">v1.0</span>
          </div>
          <h1 className="main-title">ECHO <span className="title-accent">STUDIO</span></h1>
          <p className="subtitle">Real-time sub-second voice AI with streaming pipeline</p>
        </div>

        {/* View Switcher in Header */}
        <div className="nav-segmented" role="navigation" aria-label="Main Navigation">
          {onNavigate && (
            <button
              type="button"
              className="nav-seg-btn"
              onClick={() => onNavigate("landing")}
              aria-label="Back to SaaS Landing Page"
            >
              <span className="nav-seg-icon">🏠</span>
              <span>Overview</span>
            </button>
          )}
          <button
            type="button"
            className={`nav-seg-btn ${activeView === "studio" ? "active" : ""}`}
            onClick={() => setActiveView("studio")}
            aria-label="Switch to Voice Studio"
          >
            <span className="nav-seg-icon">🎙️</span>
            <span>Studio</span>
          </button>
        </div>

        <div className="header-actions">
          {/* Theme Toggle Button */}
          <button
            type="button"
            className="btn-header-theme"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* User Account / Status Pill */}
          {isAuthenticated && user ? (
            <div className="header-user-pill" title={`Logged in as ${user.email}`}>
              <span className="header-user-avatar">
                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
              </span>
              <span className="header-user-name">{user.name}</span>
            </div>
          ) : (
            <button
              type="button"
              className="btn-header-signin"
              onClick={() => onNavigate?.("login")}
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            className={`btn-settings-toggle ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings((prev) => !prev)}
            aria-label="Toggle pipeline settings"
            title="Configure STT, TTS, and LLM providers"
          >
            <span className="icon">⚙️</span>
            <span className="label">Pipeline</span>
            <span className="settings-preview">
              {engine === "browser"
                ? "Browser STT"
                : engine === "speechmatics"
                ? "Speechmatics"
                : "Deepgram"} · {llmProvider === "gemini" ? "Gemini" : "OpenAI"}
            </span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-header-action"
            onClick={handleNewSession}
            disabled={status === "recording" || status === "thinking"}
            aria-label="Start new session"
            title="Clear conversation history"
          >
            <span className="icon">↺</span>
            <span>Clear</span>
          </button>
        </div>
      </header>

      {/* Settings Modal Drawer */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Pipeline configuration settings"
          >
            <div className="settings-header">
              <div className="settings-title-group">
                <span className="settings-title">Modular Pipeline Configuration</span>
                <span className="settings-hint">Configure sub-second STT, LLM reasoning, and neural TTS providers</span>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div className="settings-cards-grid">
              {/* STT Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <span className="card-icon">🎙️</span>
                  <div>
                    <label htmlFor="stt-select" className="settings-card-label">Speech-to-Text (STT)</label>
                    <span className="card-sub">Audio transcription layer</span>
                  </div>
                </div>
                <select
                  id="stt-select"
                  className="engine-select"
                  value={engine}
                  onChange={handleEngineChange}
                  disabled={status !== "idle" && status !== "error"}
                >
                  <option value="browser" disabled={!isNativeSttSupported}>
                    {isNativeSttSupported
                      ? "Browser Native (Instant & Free · Recommended)"
                      : "Browser Native (Unsupported in this browser)"}
                  </option>
                  <option value="deepgram">Deepgram Nova-3 (Realtime WebSocket)</option>
                  <option value="speechmatics">Speechmatics Flow (Realtime WebSocket)</option>
                </select>

                {engine === "browser" && (
                  <div className="nested-select-group">
                    <label htmlFor="lang-select" className="nested-label">Recognition Language</label>
                    <select
                      id="lang-select"
                      className="engine-select"
                      value={sttLanguage}
                      onChange={(e) => setSttLanguage(e.target.value)}
                      disabled={status !== "idle" && status !== "error"}
                    >
                      <option value="en-US">English (US)</option>
                      <option value="en-IN">English (India)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="es-ES">Spanish (ES)</option>
                      <option value="fr-FR">French (FR)</option>
                      <option value="de-DE">German (DE)</option>
                      <option value="hi-IN">Hindi (IN)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* LLM Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <span className="card-icon">🧠</span>
                  <div>
                    <label htmlFor="llm-select" className="settings-card-label">Reasoning Engine (LLM)</label>
                    <span className="card-sub">Token streaming server-sent events</span>
                  </div>
                </div>
                <select
                  id="llm-select"
                  className="engine-select"
                  value={llmProvider}
                  onChange={handleLlmProviderChange}
                  disabled={status !== "idle" && status !== "error"}
                >
                  <option value="gemini">Google Gemini Flash (Ultra-low TTFT ~200ms)</option>
                  <option value="openai">OpenAI GPT-4o-mini (SSE Stream)</option>
                </select>
              </div>

              {/* TTS Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <span className="card-icon">🔊</span>
                  <div>
                    <label htmlFor="tts-select" className="settings-card-label">Voice Synthesis (TTS)</label>
                    <span className="card-sub">Parallel fetch & FIFO Web Audio playback</span>
                  </div>
                </div>
                <select
                  id="tts-select"
                  className="engine-select"
                  value={ttsProvider}
                  onChange={handleTtsProviderChange}
                  disabled={status !== "idle" && status !== "error"}
                >
                  <option value="elevenlabs">ElevenLabs Flash v2.5 (High expressive neural voice)</option>
                  <option value="browser">Browser Web SpeechSynthesis (Watchdog Recovery)</option>
                  <option value="piper">Piper Neural Voice (Local Server ONNX)</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <span className="modal-note">⚡ Changes take effect on next turn. Zero restart needed.</span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowSettings(false)}
              >
                Apply &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Centerpiece: The Animated Voice Orb & Soundwave Spectrum */}
      <section className="voice-centerpiece">
        <div className={`voice-orb-wrapper ${status}`}>
          <div className="orb-backdrop-glow"></div>
          <button
            type="button"
            className={`voice-orb ${status}`}
            onClick={handleToggle}
            disabled={status === "transcribing" || status === "thinking"}
            aria-label={
              status === "recording"
                ? "Stop recording"
                : status === "speaking"
                ? "Stop assistant speaking"
                : "Start speaking"
            }
          >
            <div className="orb-inner-sphere">
              {status === "recording" ? (
                <span className="orb-icon">⏹</span>
              ) : status === "speaking" ? (
                <span className="orb-icon">⏹</span>
              ) : status === "thinking" ? (
                <span className="orb-icon spin">✨</span>
              ) : (
                <span className="orb-icon">🎙️</span>
              )}
            </div>
            <div className="orb-ripple ripple-1"></div>
            <div className="orb-ripple ripple-2"></div>
            <div className="orb-ripple ripple-3"></div>
          </button>

          {/* Dynamic Audio Equalizer Spectrum driven by real microphone input */}
          <div
            className={`soundwave-bars ${
              status === "recording" || status === "speaking" ? "active" : ""
            }`}
            aria-hidden="true"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((barIdx) => {
              const dynamicHeight =
                status === "recording" && audioVolume > 0
                  ? `${Math.min(100, Math.max(16, Math.round(audioVolume * (0.8 + (barIdx % 4) * 0.25))))}%`
                  : undefined;
              return (
                <span
                  key={barIdx}
                  className={`bar bar-${barIdx}`}
                  style={dynamicHeight ? { height: dynamicHeight } : undefined}
                />
              );
            })}
          </div>

          <div className="orb-caption">
            <div className="orb-status-text">
              {status === "recording" ? (
                <span className="status-live-badge">
                  {audioVolume > 5
                    ? `🎙️ Voice detected (${audioVolume}%) — Listening...`
                    : "● Listening... Speak clearly into your microphone"}
                </span>
              ) : status === "thinking" ? (
                <span className="status-thinking-badge">✨ Generating reasoning tokens...</span>
              ) : status === "speaking" ? (
                <span className="status-speaking-badge">🔊 Echo is speaking (tap orb to interrupt)</span>
              ) : status === "transcribing" ? (
                <span className="status-transcribing-badge">⚡ Transcribing speech...</span>
              ) : status === "error" ? (
                <span className="status-error-badge">⚠️ Notice encountered — tap orb to retry</span>
              ) : (
                <span>Tap orb <span className="orb-desktop-shortcut">or press <kbd className="orb-kbd">Space</kbd></span> to converse</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Pipeline Telemetry HUD */}
        <div className="pipeline-telemetry-hud" role="region" aria-label="Pipeline Telemetry">
          <div className="hud-pill">
            <span className="hud-lbl">STT:</span>
            <span className="hud-val">
              {engine === "browser" ? "Browser Web Speech" : engine === "deepgram" ? "Deepgram Nova-3" : "Speechmatics"}
            </span>
          </div>
          <div className="hud-pill">
            <span className="hud-lbl">LLM:</span>
            <span className="hud-val">{llmProvider === "gemini" ? "Gemini Flash" : "OpenAI 4o-mini"}</span>
          </div>
          <div className="hud-pill">
            <span className="hud-lbl">TTS:</span>
            <span className="hud-val">
              {ttsProvider === "elevenlabs" ? "ElevenLabs" : ttsProvider === "browser" ? "Browser Voice" : "Piper"}
            </span>
          </div>

          {latencyMs !== null && (
            <div className="hud-pill latency-pill" title="Time from end of speech to first synthesized audio playback">
              <span className="hud-icon">⚡</span>
              <span className="hud-latency-val">{latencyMs}ms</span>
              <span className="hud-latency-tag">
                {latencyMs < 600 ? "Ultra-fast" : latencyMs < 1000 ? "Fast" : "Normal"}
              </span>
            </div>
          )}

          <label className="continuous-switch-label" title="Automatically reopen microphone after Echo finishes speaking">
            <input
              type="checkbox"
              className="continuous-checkbox"
              checked={continuousMode}
              onChange={handleContinuousChange}
            />
            <span className="switch-slider"></span>
            <span className="switch-text">Hands-Free</span>
          </label>
        </div>
      </section>

      {/* Fallback Notice Alert */}
      {fallbackNotice && (
        <div className="fallback-notice" role="alert">
          <span className="notice-icon">⚠️</span>
          <span>{fallbackNotice}</span>
          <button
            type="button"
            className="notice-dismiss"
            onClick={() => setFallbackNotice("")}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Alert */}
      {status === "error" && errorMsg && (
        <div className="error-alert" role="alert">
          <span className="notice-icon">⛔</span>
          <span>{errorMsg}</span>
          <button
            type="button"
            className="notice-dismiss"
            onClick={() => setErrorMsg("")}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Conversation History Stream */}
      <main className="blocks" ref={logRef} aria-label="Conversation history">
        {messages.length === 0 && !transcript && !response && (
          <div className="empty-notice">
            <div className="empty-icon-orb">🎙️</div>
            <h2 className="empty-title">Voice Conversation Ready</h2>
            <p className="empty-desc">
              Speak naturally into your microphone or tap any suggestion below to test the streaming pipeline.
            </p>

            {/* Interactive Prompt Suggestion Chips */}
            <div className="suggestion-chips-grid">
              <button
                type="button"
                className="prompt-chip"
                onClick={() => void handleSendText("How do you achieve sub-500ms voice response times?")}
              >
                <span className="chip-icon">⚡</span>
                <div className="chip-text">
                  <strong>How does Echo achieve sub-second voice latency?</strong>
                  <span>Sentence chunking & parallel synthesis</span>
                </div>
              </button>

              <button
                type="button"
                className="prompt-chip"
                onClick={() => void handleSendText("What happens if ElevenLabs or Deepgram encounters network failure?")}
              >
                <span className="chip-icon">🛡️</span>
                <div className="chip-text">
                  <strong>What is the multi-tier fallback strategy?</strong>
                  <span>Zero-downtime automated recovery</span>
                </div>
              </button>

              <button
                type="button"
                className="prompt-chip"
                onClick={() => void handleSendText("How does user interruption barge-in work in Echo?")}
              >
                <span className="chip-icon">🛑</span>
                <div className="chip-text">
                  <strong>How does instant barge-in work?</strong>
                  <span>Web Audio abort & queue flush</span>
                </div>
              </button>

              <button
                type="button"
                className="prompt-chip"
                onClick={() => void handleSendText("Tell me a quick, clever tech joke.")}
              >
                <span className="chip-icon">✨</span>
                <div className="chip-text">
                  <strong>Tell me a quick tech joke</strong>
                  <span>Test speech synthesis & delivery</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Existing Messages */}
        {messages.map(function renderMessage(m, idx) {
          return (
            <div
              key={idx}
              className={`block ${m.role === "user" ? "block-user" : "block-assistant"}`}
            >
              <div className="block-meta">
                <div className="meta-left">
                  {m.role === "user" ? (
                    <span className="avatar-pill user">YOU</span>
                  ) : (
                    <span className="avatar-pill assistant">ECHO AI</span>
                  )}
                </div>

                {m.role === "assistant" && (
                  <div className="message-actions">
                    <button
                      type="button"
                      className="btn-msg-action"
                      onClick={() => handleCopyMessage(m.content, idx)}
                      title="Copy response to clipboard"
                    >
                      {copiedIndex === idx ? "✓ Copied" : "📋 Copy"}
                    </button>
                    <button
                      type="button"
                      className={`btn-msg-action ${replayingIdx === idx ? "replaying" : ""}`}
                      onClick={() => void handleReplaySpeech(m.content, idx)}
                      title="Listen to this response again"
                    >
                      {replayingIdx === idx ? "🔊 Playing..." : "🔊 Replay"}
                    </button>
                  </div>
                )}
              </div>
              <div className="text-box">{m.content}</div>
            </div>
          );
        })}

        {/* Live Interim Transcript (when user is speaking) */}
        {status === "recording" && transcript && (
          <div className="block block-user live-block">
            <div className="block-meta">
              <span className="avatar-pill user live">
                <span className="live-dot"></span>
                <span>YOU (SPEAKING...)</span>
              </span>
            </div>
            <div className="text-box">{transcript}</div>
          </div>
        )}

        {/* Streaming Assistant Response (when LLM is streaming tokens) */}
        {(status === "thinking" || status === "speaking") && response && (
          <div className="block block-assistant streaming-block">
            <div className="block-meta">
              <span className="avatar-pill assistant streaming">
                <span className="streaming-dot"></span>
                <span>ECHO {status === "speaking" ? "(SPEAKING...)" : "(STREAMING...)"}</span>
              </span>
            </div>
            <div className="text-box">
              {response}
              <span className="streaming-cursor"></span>
            </div>
          </div>
        )}

        {/* Thinking Indicator */}
        {status === "thinking" && !response && (
          <div className="block block-assistant thinking-block">
            <div className="block-meta">
              <span className="avatar-pill assistant">ECHO AI</span>
            </div>
            <div className="text-box thinking-text">
              <span className="thinking-dots">
                <span className="dot dot-1"></span>
                <span className="dot dot-2"></span>
                <span className="dot dot-3"></span>
              </span>
              <span className="thinking-label">Reasoning with {llmProvider === "gemini" ? "Gemini Flash" : "OpenAI"}...</span>
            </div>
          </div>
        )}
      </main>

      {/* Dual Modality Text & Quick Action Input Bar */}
      <form
        className="chat-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSendText();
        }}
      >
        <div className="input-group">
          <input
            type="text"
            className="chat-text-input"
            placeholder="Type a message or tap the orb above to converse..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={status === "recording" || status === "thinking"}
            aria-label="Text prompt for voice assistant"
          />
          <button
            type="submit"
            className="btn-send"
            disabled={!textInput.trim() || status === "recording" || status === "thinking"}
            aria-label="Send message"
            title="Send text prompt"
          >
            ➔
          </button>
        </div>
      </form>

      {/* Understated Minimal Studio Footer */}
      <footer className="studio-minimal-footer" role="contentinfo">
        <div className="studio-footer-content">
          <span>© {new Date().getFullYear()} Echo Studio</span>
          <span>•</span>
          <span>Sub-second streaming conversational voice pipeline</span>
          <span>•</span>
          <span>Tap orb <span className="orb-desktop-shortcut">or press <kbd className="orb-kbd">Space</kbd></span> to talk</span>
        </div>
      </footer>
    </div>
  );
}
