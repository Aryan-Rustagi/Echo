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
    // Guard against double finishTurn
    if (!turnActiveRef.current) {
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

    const currentText = finalizedTextRef.current.trim();
    if (!currentText) {
      setErrorMsg("No speech detected. Try again.");
      updateStatus("error");
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
    if (status === "idle" || status === "error") {
      await startTurn();
    } else if (status === "recording") {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      speechEndTimestampRef.current = performance.now();
      if (finishTurnRef.current) {
        await finishTurnRef.current();
      }
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
      <h1>ECHO</h1>
      <p className="subtitle">A simple voice assistant</p>

      <div className="actions">
        <select
          className="engine-select"
          value={engine}
          onChange={handleEngineChange}
          disabled={status !== "idle" && status !== "error"}
          aria-label="Select STT engine"
          title="Speech-to-Text Engine"
        >
          <option value="speechmatics">Speechmatics</option>
          <option value="deepgram">Deepgram</option>
        </select>

        <select
          className="engine-select"
          value={ttsProvider}
          onChange={handleTtsProviderChange}
          disabled={status !== "idle" && status !== "error"}
          aria-label="Select text to speech provider"
          title="Text to Speech Provider"
        >
          <option value="browser">Browser voice</option>
          <option value="elevenlabs">ElevenLabs</option>
          <option value="piper">Piper (local)</option>
        </select>

        <select
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

        <button
          className="btn"
          type="button"
          onClick={handleToggle}
          disabled={status === "transcribing" || status === "thinking"}
        >
          {status === "recording" ? "Stop" : "Start"}
        </button>

        <button
          className="btn"
          type="button"
          onClick={handleNewSession}
          disabled={status === "recording" || status === "thinking"}
        >
          New session
        </button>

        <label className="toggle-label">
          <input
            className="toggle-checkbox"
            type="checkbox"
            checked={continuousMode}
            onChange={handleContinuousChange}
          />
          Continuous mode
        </label>

        <span className="status-badge" aria-live="polite">
          Status: {status}
        </span>
      </div>

      <div className="status-bar">
        {status === "recording" && (
          <span className="mic-live-indicator" aria-live="polite">
            ● Mic is live (listening...)
          </span>
        )}

        {latencyMs !== null && (
          <span className="latency-readout" aria-live="polite">
            ⚡ {latencyMs}ms to first audio
          </span>
        )}
      </div>

      {fallbackNotice && (
        <div className="fallback-notice" role="alert">
          {fallbackNotice}
        </div>
      )}

      {status === "error" && (
        <div className="error-alert" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="blocks" ref={logRef}>
        {messages.length === 0 && !transcript && !response && (
          <div className="empty-notice">
            No messages yet. Click Start to speak.
          </div>
        )}

        {messages.map(function renderMessage(m, idx) {
          return (
            <div
              key={idx}
              className={`block ${m.role === "user" ? "block-user" : "block-assistant"}`}
            >
              <div className="label">
                {m.role === "user" ? "You said" : "Echo said"}
              </div>
              <div className="text-box">
                {m.content}
              </div>
            </div>
          );
        })}

        {status === "recording" && transcript && (
          <div className="block block-user live-block">
            <div className="label">
              You said (speaking...)
            </div>
            <div className="text-box">
              {transcript}
            </div>
          </div>
        )}

        {(status === "thinking" || status === "speaking") && response && (
          <div className="block block-assistant streaming-block">
            <div className="label">
              Echo said {status === "speaking" ? "(speaking...)" : "(generating...)"}
            </div>
            <div className="text-box">
              {response}
            </div>
          </div>
        )}

        {status === "thinking" && !response && (
          <div className="block block-assistant thinking-block">
            <div className="label">
              Echo said
            </div>
            <div className="text-box thinking-text">
              Thinking...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
