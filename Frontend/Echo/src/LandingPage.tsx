import { useState, useRef, useEffect } from "react";
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

type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";
type Engine = "deepgram" | "speechmatics";

interface FinishTurnFn {
  (): Promise<void>;
}

export default function LandingPage() {
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>("idle");
  const [engine, setEngine] = useState<Engine>("speechmatics");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("gemini");
  const [ttsProvider, setTtsProviderState] = useState<TtsProvider>("browser");
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [fallbackNotice, setFallbackNotice] = useState("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const statusRef = useRef<Status>("idle");
  const messagesRef = useRef<Message[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const finalizedTextRef = useRef("");
  const turnActiveRef = useRef<boolean>(false);
  const isFallbackRef = useRef<boolean>(false);
  const continuousModeRef = useRef<boolean>(false);
  const llmProviderRef = useRef<LlmProvider>("gemini");
  const transcriptionControllerRef = useRef<TranscriptionController | null>(null);
  const finishTurnRef = useRef<FinishTurnFn | null>(null);
  const turnAbortControllerRef = useRef<AbortController | null>(null);
  const speechEndTimestampRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateStatus(newStatus: Status): void {
    statusRef.current = newStatus;
    setStatus(newStatus);
  }

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
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        void handleToggle();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
    setResponse("");
    setErrorMsg("");
    updateStatus("idle");
  }

  async function triggerWhisperFallback(reason: string): Promise<void> {
    console.warn("Realtime engine failed, activating Whisper fallback:", reason);
    setFallbackNotice(`Realtime engine failed (${reason}). Switched to Whisper fallback.`);
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

    let currentText = finalizedTextRef.current.trim();
    if (!currentText && transcript.trim()) {
      currentText = transcript.trim();
      finalizedTextRef.current = currentText;
    }

    if (!currentText) {
      setErrorMsg("No speech detected. Try again.");
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
      turnActiveRef.current = true;
      isFallbackRef.current = false;
      speechEndTimestampRef.current = 0;
      updateStatus("recording");

      finishTurnRef.current = finishTurn;

      function onTranscript(text: string, isFinal: boolean) {
        if (isFinal) {
          finalizedTextRef.current += (finalizedTextRef.current ? " " : "") + text;
          setTranscript(finalizedTextRef.current);
        } else {
          setTranscript(finalizedTextRef.current + (finalizedTextRef.current ? " " : "") + text);
        }

        if (finalizedTextRef.current.trim()) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = setTimeout(function finishAfterSilence() {
            if (turnActiveRef.current && finalizedTextRef.current.trim()) {
              speechEndTimestampRef.current = performance.now();
              void finishTurn();
            }
          }, 1200);
        }
      }

      async function onError(err: Error) {
        await triggerWhisperFallback(err.message || "stream error");
      }

      function onEndOfTurn() {
        if (turnActiveRef.current && finalizedTextRef.current.trim()) {
          speechEndTimestampRef.current = performance.now();
          void finishTurn();
        }
      }

      if (engine === "deepgram") {
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
      await triggerWhisperFallback(message);
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
      <header className="header-bar">
        <div className="brand-group">
          <div className="brand-tag-wrapper">
            <span className="brand-tag">VOICE AI</span>
            <span className="brand-version">v1.0</span>
          </div>
          <h1 className="main-title">ECHO</h1>
          <p className="subtitle">Real-time modular conversational assistant</p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className={`btn-settings-toggle ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings((prev) => !prev)}
            aria-label="Toggle pipeline settings"
            title="Configure STT, TTS, and LLM providers"
          >
            <span className="icon">⚙️</span>
            <span className="label">Settings</span>
            <span className="settings-preview">
              {engine === "speechmatics" ? "Speechmatics" : "Deepgram"} · {llmProvider === "gemini" ? "Gemini" : "OpenAI"}
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
            <span>New Session</span>
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="settings-panel" aria-label="Pipeline configuration">
          <div className="settings-header">
            <span className="settings-title">Modular Pipeline Configuration</span>
            <span className="settings-hint">Select provider models for STT, TTS, and LLM reasoning</span>
          </div>
          <div className="actions-selectors">
            <div className="select-group">
              <label htmlFor="stt-select" className="select-label">STT</label>
              <select
                id="stt-select"
                className="engine-select"
                value={engine}
                onChange={handleEngineChange}
                disabled={status !== "idle" && status !== "error"}
                aria-label="Select STT engine"
                title="Speech-to-Text Engine"
              >
                <option value="speechmatics">Speechmatics (Realtime)</option>
                <option value="deepgram">Deepgram (Realtime)</option>
              </select>
            </div>

            <div className="select-group">
              <label htmlFor="tts-select" className="select-label">TTS</label>
              <select
                id="tts-select"
                className="engine-select"
                value={ttsProvider}
                onChange={handleTtsProviderChange}
                disabled={status !== "idle" && status !== "error"}
                aria-label="Select text to speech provider"
                title="Text to Speech Provider"
              >
                <option value="elevenlabs">ElevenLabs Flash</option>
                <option value="browser">Browser Voice</option>
                <option value="piper">Piper (Local)</option>
              </select>
            </div>

            <div className="select-group">
              <label htmlFor="llm-select" className="select-label">LLM</label>
              <select
                id="llm-select"
                className="engine-select"
                value={llmProvider}
                onChange={handleLlmProviderChange}
                disabled={status !== "idle" && status !== "error"}
                aria-label="Select LLM model"
                title="LLM Model"
              >
                <option value="gemini">Gemini Flash</option>
                <option value="openai">OpenAI (GPT-4o-mini)</option>
              </select>
            </div>
          </div>
        </section>
      )}

      <div className="voice-card">
        <div className="voice-main-row">
          <button
            className={`btn btn-toggle ${
              status === "recording"
                ? "btn-recording"
                : status === "speaking"
                ? "btn-speaking"
                : "btn-start"
            }`}
            type="button"
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
            {status === "recording" ? (
              <>
                <span className="btn-icon">⏹</span>
                <span>Stop Recording</span>
              </>
            ) : status === "speaking" ? (
              <>
                <span className="btn-icon">⏹</span>
                <span>Stop Speaking</span>
              </>
            ) : (
              <>
                <span className="btn-icon">🎙️</span>
                <span>Start Speaking</span>
                <span className="btn-kbd">Space</span>
              </>
            )}
          </button>

          <label className="toggle-label" title="Automatically re-open mic when Echo finishes speaking">
            <input
              className="toggle-checkbox"
              type="checkbox"
              checked={continuousMode}
              onChange={handleContinuousChange}
            />
            <span>Continuous mode</span>
          </label>

          <div className="status-container">
            <span className={`status-pill status-${status}`} aria-live="polite">
              <span className="status-dot"></span>
              {status}
            </span>
          </div>
        </div>

        {(status === "recording" || latencyMs !== null) && (
          <div className="voice-status-bar">
            {status === "recording" && (
              <span className="mic-live-indicator" aria-live="polite">
                <span className="live-dot"></span>
                <span>Listening for speech...</span>
              </span>
            )}

            {latencyMs !== null && (
              <span className="latency-readout" aria-live="polite" title="Time from speech end to first audio playback">
                ⚡ {latencyMs}ms latency
              </span>
            )}
          </div>
        )}
      </div>

      {fallbackNotice && (
        <div className="fallback-notice" role="alert">
          <span className="notice-icon">⚠️</span>
          <span>{fallbackNotice}</span>
        </div>
      )}

      {status === "error" && (
        <div className="error-alert" role="alert">
          <span className="notice-icon">⛔</span>
          <span>{errorMsg}</span>
        </div>
      )}

      <main className="blocks" ref={logRef} aria-label="Conversation history">
        {messages.length === 0 && !transcript && !response && (
          <div className="empty-notice">
            <div className="empty-icon-orb">🎙️</div>
            <h2 className="empty-title">Ready to converse</h2>
            <p className="empty-desc">
              Click <strong>Start Speaking</strong> or press the <kbd className="empty-kbd">Space</kbd> key to talk.
              Echo will transcribe in real-time, stream reasoning tokens, and reply out loud.
            </p>
          </div>
        )}

        {messages.map(function renderMessage(m, idx) {
          return (
            <div
              key={idx}
              className={`block ${m.role === "user" ? "block-user" : "block-assistant"}`}
            >
              <div className="block-meta">
                <span className="label">
                  {m.role === "user" ? "YOU" : "ECHO"}
                </span>
              </div>
              <div className="text-box">
                {m.content}
              </div>
            </div>
          );
        })}

        {status === "recording" && transcript && (
          <div className="block block-user live-block">
            <div className="block-meta">
              <span className="label">
                YOU (SPEAKING...)
              </span>
            </div>
            <div className="text-box">
              {transcript}
            </div>
          </div>
        )}

        {(status === "thinking" || status === "speaking") && response && (
          <div className="block block-assistant streaming-block">
            <div className="block-meta">
              <span className="label">
                ECHO {status === "speaking" ? "(SPEAKING...)" : "(STREAMING...)"}
              </span>
            </div>
            <div className="text-box">
              {response}
            </div>
          </div>
        )}

        {status === "thinking" && !response && (
          <div className="block block-assistant thinking-block">
            <div className="block-meta">
              <span className="label">
                ECHO
              </span>
            </div>
            <div className="text-box thinking-text">
              <span className="thinking-dots">Thinking...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
