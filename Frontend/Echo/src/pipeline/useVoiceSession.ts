import { useState, useRef, useEffect, useCallback } from "react";
import {
  startHybridTranscription,
  startBrowserTranscription,
  startRealtimeTranscription,
  startSpeechmaticsTranscription,
  startRecording,
  stopRecording,
  transcribeAudio,
  isBrowserSttSupported,
  type TranscriptionController,
  type SttEngine,
} from "./stt/index";
import {
  streamResponse,
  createSentenceSplitter,
  type Message,
  type LlmProvider,
} from "./llm/index";
import {
  enqueueSentence,
  stopAll,
  resumeAudioContext,
  setOnFirstAudio,
  waitForQueueDrain,
  setTtsProvider as setPipelineTtsProvider,
  getOutputAudioLevel,
  startNewTurnAudio,
  setOnFallbackNotice,
  getAudioContext,
  type TtsProvider,
} from "./tts/index";
import {
  recordSttFinal,
  recordLlmFirstToken,
  recordFirstAudio,
  subscribeLatency,
  resetLatencyTracker,
  getLatencyState,
  type LatencyTrackerState,
} from "./latencyTracker";
import {
  getPersonaById,
  getActiveSystemPrompt,
  DEFAULT_PERSONA_ID,
  type PersonaId,
} from "../config/personas";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

export type { SttEngine };

export interface VoiceSessionState {
  status: VoiceStatus;
  messages: Message[];
  interimTranscript: string;
  finalTranscript: string;
  assistantStreamingText: string;
  errorMsg: string | null;
  fallbackNotice: string | null;
  continuousMode: boolean;
  sttEngine: SttEngine;
  llmProvider: LlmProvider;
  ttsProvider: TtsProvider;
  personaId: PersonaId;
  customSystemPrompt: string;
  audioVolume: number;
  latencyState: LatencyTrackerState;
  isBrowserSttAvailable: boolean;
}

export function useVoiceSession() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantStreamingText, setAssistantStreamingText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [continuousMode, setContinuousModeState] = useState<boolean>(false);
  const [sttEngine, setSttEngineState] = useState<SttEngine>(function initStt() {
    const saved = localStorage.getItem("echo_stt_engine");
    return (saved as SttEngine) || "hybrid";
  });
  const [llmProvider, setLlmProviderState] = useState<LlmProvider>("gemini");
  const [ttsProvider, setTtsProviderState] = useState<TtsProvider>("elevenlabs");
  const [personaId, setPersonaIdState] = useState<PersonaId>(function initPersona() {
    const saved = localStorage.getItem("echo_active_persona");
    return (saved as PersonaId) || DEFAULT_PERSONA_ID;
  });
  const [customSystemPrompt, setCustomPromptState] = useState<string>(function initPrompt() {
    return localStorage.getItem("echo_custom_system_prompt") || "";
  });
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const [latencyState, setLatencyState] = useState<LatencyTrackerState>(getLatencyState());

  const statusRef = useRef<VoiceStatus>("idle");
  const messagesRef = useRef<Message[]>([]);
  const turnActiveRef = useRef<boolean>(false);
  const continuousModeRef = useRef<boolean>(false);
  const isFallbackToWhisperRef = useRef<boolean>(false);
  const transcriptionControllerRef = useRef<TranscriptionController | null>(null);
  const turnAbortControllerRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef<{ final: string; interim: string }>({ final: "", interim: "" });
  const personaIdRef = useRef<PersonaId>(personaId);
  const customSystemPromptRef = useRef<string>(customSystemPrompt);
  const llmProviderRef = useRef<LlmProvider>(llmProvider);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastVolumeUpdateRef = useRef<number>(0);

  const isBrowserSttAvailable = isBrowserSttSupported();

  function updateStatus(newStatus: VoiceStatus): void {
    statusRef.current = newStatus;
    setStatus(newStatus);
  }

  // Subscribe to latency updates
  useEffect(function initLatencySubscription() {
    const unsubscribe = subscribeLatency(function onLatencyChange(state) {
      setLatencyState(state);
    });
    return unsubscribe;
  }, []);

  // Listen for TTS fallback notice
  useEffect(function initTtsFallbackListener() {
    setOnFallbackNotice(function onTtsNotice(notice) {
      setFallbackNotice(notice);
    });
  }, []);

  // Setup AnalyserNode volume meter animation loop (throttled to ~25fps to prevent React render thrashing)
  useEffect(function initVolumeMeterLoop() {
    function updateMeter() {
      let level = 0;
      if (statusRef.current === "listening" && micAnalyserRef.current) {
        const data = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        micAnalyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          sum += data[i];
        }
        level = Math.min(1, (sum / (data.length * 255)) * 2.2);
      } else if (statusRef.current === "speaking") {
        level = Math.min(1, getOutputAudioLevel() * 2.0);
      }

      const now = performance.now();
      if (now - lastVolumeUpdateRef.current >= 40) {
        lastVolumeUpdateRef.current = now;
        setAudioVolume(level);
      }
      animFrameRef.current = requestAnimationFrame(updateMeter);
    }

    animFrameRef.current = requestAnimationFrame(updateMeter);
    return function cleanupMeter() {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Clean up mic and turn on unmount
  useEffect(function initCleanup() {
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
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(function stopTrack(t) {
          t.stop();
        });
      }
    };
  }, []);

  async function acquireMicAnalyser(): Promise<AnalyserNode | null> {
    try {
      if (micAnalyserRef.current && micStreamRef.current?.active) {
        return micAnalyserRef.current;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
      return analyser;
    } catch (err) {
      console.warn("Could not acquire microphone for AnalyserNode:", err);
      return null;
    }
  }

  function releaseMicStream(): void {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(function stopTrack(t) {
        t.stop();
      });
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
  }

  // Barge-in: interrupt speaking or thinking when user starts talking
  function handleSpeechStarted(): void {
    if (statusRef.current === "speaking" || statusRef.current === "thinking") {
      console.log("[Barge-in] Speech detected while Echo active. Interrupting playback.");
      stopAll();
      if (turnAbortControllerRef.current) {
        turnAbortControllerRef.current.abort();
        turnAbortControllerRef.current = null;
      }
      setInterimTranscript("");
      setFinalTranscript("");
      setAssistantStreamingText("");
      turnActiveRef.current = true;
      updateStatus("listening");
    }
  }

  async function triggerWhisperFallback(reason: string): Promise<void> {
    console.warn("Realtime engine failed, activating Whisper fallback:", reason);
    setFallbackNotice(`STT switched (${reason}) → Whisper fallback activated.`);
    isFallbackToWhisperRef.current = true;
    turnActiveRef.current = true;

    if (transcriptionControllerRef.current) {
      const controller = transcriptionControllerRef.current;
      transcriptionControllerRef.current = null;
      try {
        await controller.stop();
      } catch (_e) {}
    }

    try {
      await startRecording();
      updateStatus("listening");
    } catch (recErr: unknown) {
      turnActiveRef.current = false;
      isFallbackToWhisperRef.current = false;
      const msg = recErr instanceof Error ? recErr.message : "Microphone error";
      setErrorMsg(msg);
      updateStatus("error");
    }
  }

  async function finishTurn(): Promise<void> {
    if (statusRef.current !== "listening" && !turnActiveRef.current) {
      return;
    }

    turnActiveRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Abort previous in-flight turn if any
    if (turnAbortControllerRef.current) {
      turnAbortControllerRef.current.abort();
    }
    const turnAbortController = new AbortController();
    turnAbortControllerRef.current = turnAbortController;

    if (isFallbackToWhisperRef.current) {
      updateStatus("transcribing");
      try {
        const audioBlob = await stopRecording();
        const res = await transcribeAudio(audioBlob, { engine: "auto" });
        const recognized = (res.transcript || "").trim();
        transcriptRef.current.final = recognized;
        transcriptRef.current.interim = "";
        setFinalTranscript(recognized);
        setInterimTranscript("");
      } catch (sttErr: unknown) {
        const msg = sttErr instanceof Error ? sttErr.message : "Whisper transcription failed";
        setErrorMsg(msg);
        updateStatus("error");
        return;
      }
    } else {
      if (transcriptionControllerRef.current) {
        const controller = transcriptionControllerRef.current;
        transcriptionControllerRef.current = null;
        try {
          await controller.stop();
        } catch (_stopErr) {}
      }
    }

    // Measure STT Final timestamp once canonical transcription is completed
    recordSttFinal();

    const currentFinal = transcriptRef.current.final.trim() || finalTranscript.trim();
    const currentInterim = transcriptRef.current.interim.trim() || interimTranscript.trim();
    const recognizedText = currentFinal || currentInterim;

    if (!recognizedText) {
      setErrorMsg("No speech detected. Tap or hold Space to talk.");
      updateStatus("idle");
      return;
    }

    // Reset transcript buffer for this turn
    transcriptRef.current = { final: "", interim: "" };

    try {
      updateStatus("thinking");
      setAssistantStreamingText("");

      const userMsg: Message = { role: "user", content: recognizedText };
      const updatedMessages = [...messagesRef.current, userMsg];
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);

      startNewTurnAudio();

      setOnFirstAudio(function handleFirstAudio() {
        recordFirstAudio();
        updateStatus("speaking");
      });

      const splitter = createSentenceSplitter(function handleSentence(sentence: string) {
        if (!turnAbortController.signal.aborted) {
          enqueueSentence(sentence, turnAbortController.signal);
        }
      });

      const activePrompt = getActiveSystemPrompt(
        personaIdRef.current,
        customSystemPromptRef.current
      );

      const fullReply = await streamResponse(
        updatedMessages,
        function handleToken(token: string) {
          recordLlmFirstToken();
          splitter.push(token);
          setAssistantStreamingText(function append(prev) {
            return prev + token;
          });
        },
        turnAbortController.signal,
        llmProviderRef.current,
        activePrompt
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

    if (continuousModeRef.current) {
      setTimeout(function triggerNextTurn() {
        if (continuousModeRef.current && statusRef.current === "idle") {
          void startListening();
        }
      }, 250);
    }
  }

  async function startListening(): Promise<void> {
    try {
      await resumeAudioContext();
      await acquireMicAnalyser();

      setErrorMsg(null);
      transcriptRef.current = { final: "", interim: "" };
      setInterimTranscript("");
      setFinalTranscript("");
      setAssistantStreamingText("");
      turnActiveRef.current = true;
      isFallbackToWhisperRef.current = false;
      updateStatus("listening");

      function onTranscript(text: string, isFinal: boolean) {
        const trimmed = (text || "").trim();
        if (!trimmed) return;

        if (isFinal) {
          if (sttEngine === "hybrid" || sttEngine === "local_whisper") {
            transcriptRef.current.final = trimmed;
          } else {
            transcriptRef.current.final = transcriptRef.current.final
              ? `${transcriptRef.current.final} ${trimmed}`
              : trimmed;
          }
          transcriptRef.current.interim = "";
          setFinalTranscript(transcriptRef.current.final);
          setInterimTranscript("");
        } else {
          transcriptRef.current.interim = trimmed;
          setInterimTranscript(trimmed);
        }

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = setTimeout(function finishAfterSilence() {
          if (turnActiveRef.current) {
            void finishTurn();
          }
        }, 1300);
      }

      function onError(err: Error) {
        void triggerWhisperFallback(err.message || "STT error");
      }

      function onEndOfTurn() {
        if (turnActiveRef.current) {
          void finishTurn();
        }
      }

      if (sttEngine === "hybrid") {
        const controller = await startHybridTranscription(
          onTranscript,
          onError,
          onEndOfTurn,
          handleSpeechStarted,
          {
            enginePreference: "auto",
            onProcessing: () => updateStatus("transcribing"),
          }
        );
        transcriptionControllerRef.current = controller;
      } else if (sttEngine === "local_whisper") {
        const controller = await startHybridTranscription(
          onTranscript,
          onError,
          onEndOfTurn,
          handleSpeechStarted,
          {
            enginePreference: "local",
            onProcessing: () => updateStatus("transcribing"),
          }
        );
        transcriptionControllerRef.current = controller;
      } else if (sttEngine === "browser" && isBrowserSttAvailable) {
        const controller = startBrowserTranscription(
          onTranscript,
          onError,
          onEndOfTurn,
          handleSpeechStarted
        );
        transcriptionControllerRef.current = controller;
      } else if (sttEngine === "speechmatics") {
        const controller = await startSpeechmaticsTranscription(
          onTranscript,
          onError,
          onEndOfTurn,
          handleSpeechStarted
        );
        transcriptionControllerRef.current = controller;
      } else {
        const controller = await startRealtimeTranscription(
          onTranscript,
          onError,
          onEndOfTurn,
          handleSpeechStarted
        );
        transcriptionControllerRef.current = controller;
      }
    } catch (err: unknown) {
      console.warn("Realtime STT launch failed, activating Whisper:", err);
      const msg = err instanceof Error ? err.message : "Microphone launch failed";
      await triggerWhisperFallback(msg);
    }
  }

  function stopListening(): void {
    if (statusRef.current === "listening") {
      void finishTurn();
    }
  }

  function toggleListening(): void {
    if (status === "listening") {
      stopListening();
    } else if (status === "speaking" || status === "thinking") {
      handleSpeechStarted();
    } else {
      void startListening();
    }
  }

  function cancel(): void {
    turnActiveRef.current = false;
    transcriptRef.current = { final: "", interim: "" };
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (turnAbortControllerRef.current) {
      turnAbortControllerRef.current.abort();
      turnAbortControllerRef.current = null;
    }
    stopAll();
    if (transcriptionControllerRef.current) {
      void transcriptionControllerRef.current.stop();
      transcriptionControllerRef.current = null;
    }
    releaseMicStream();
    setInterimTranscript("");
    setAssistantStreamingText("");
    updateStatus("idle");
  }

  function clearSession(): void {
    cancel();
    transcriptRef.current = { final: "", interim: "" };
    messagesRef.current = [];
    setMessages([]);
    setFinalTranscript("");
    setErrorMsg(null);
    setFallbackNotice(null);
    resetLatencyTracker();
  }

  function setContinuousMode(enabled: boolean): void {
    setContinuousModeState(enabled);
    continuousModeRef.current = enabled;
  }

  function setSttEngine(engine: SttEngine): void {
    setSttEngineState(engine);
    localStorage.setItem("echo_stt_engine", engine);
  }

  function setLlmProvider(provider: LlmProvider): void {
    setLlmProviderState(provider);
    llmProviderRef.current = provider;
  }

  function setTtsProvider(provider: TtsProvider): void {
    setTtsProviderState(provider);
    setPipelineTtsProvider(provider);
  }

  function setPersonaId(id: PersonaId): void {
    setPersonaIdState(id);
    personaIdRef.current = id;
    localStorage.setItem("echo_active_persona", id);
  }

  function setCustomSystemPrompt(prompt: string): void {
    setCustomPromptState(prompt);
    customSystemPromptRef.current = prompt;
    localStorage.setItem("echo_custom_system_prompt", prompt);
  }

  return {
    status,
    messages,
    interimTranscript,
    finalTranscript,
    assistantStreamingText,
    errorMsg,
    fallbackNotice,
    continuousMode,
    sttEngine,
    llmProvider,
    ttsProvider,
    personaId,
    customSystemPrompt,
    audioVolume,
    latencyState,
    isBrowserSttAvailable,
    startListening,
    stopListening,
    toggleListening,
    cancel,
    clearSession,
    setContinuousMode,
    setSttEngine,
    setLlmProvider,
    setTtsProvider,
    setPersonaId,
    setCustomSystemPrompt,
  };
}
