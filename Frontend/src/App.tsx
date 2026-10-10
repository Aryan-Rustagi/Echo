import { useState, useRef, useEffect } from "react";
import { startRecording, stopRecording } from "./pipeline/recorder";
import { transcribe } from "./pipeline/stt";
import { getResponse, Message } from "./pipeline/llm";
import { speak } from "./pipeline/tts";
import Cover from "./Cover";
import "./App.css";

const HISTORY_LIMIT = 8;

function getNormalizedPath(): string {
  if (typeof window === "undefined") return "/";
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "/app" || hash === "app") return "/app";
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => getNormalizedPath());

  useEffect(() => {
    function handleLocation() {
      setCurrentPath(getNormalizedPath());
    }
    window.addEventListener("popstate", handleLocation);
    window.addEventListener("hashchange", handleLocation);
    return () => {
      window.removeEventListener("popstate", handleLocation);
      window.removeEventListener("hashchange", handleLocation);
    };
  }, []);

  function navigate(to: string) {
    if (window.location.pathname !== to && window.location.hash !== `#${to}`) {
      window.history.pushState({}, "", to);
      setCurrentPath(to);
      window.scrollTo(0, 0);
    }
  }

  if (currentPath !== "/app") {
    return <Cover onStart={() => navigate("/app")} />;
  }

  const [state, setState] = useState<"idle" | "recording" | "transcribing" | "thinking" | "speaking">("idle");
  const [ttsProvider, setTtsProvider] = useState<"piper" | "elevenlabs">("piper");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>("");

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const newSession = () => {
    setMessages([]);
    setState("idle");
    setError("");
  };

  const handleClick = async () => {
    if (state === "idle") {
      try {
        setError("");
        await startRecording();
        setState("recording");
      } catch (err: any) {
        setError(err.message || "Failed to start recording");
        setState("idle");
      }
    } else if (state === "recording") {
      try {
        setState("transcribing");
        const blob = await stopRecording();
        const text = await transcribe(blob);

        if (!text.trim()) {
          setState("idle");
          return;
        }

        const userMsg: Message = { role: "user", content: text };
        const updated = [...messages, userMsg];
        setMessages(updated);
        setState("thinking");

        const recent = updated.slice(-HISTORY_LIMIT);
        const reply = await getResponse(recent);
        setMessages([...updated, { role: "assistant", content: reply }]);
        setState("speaking");
        await speak(reply, ttsProvider);
        setState("idle");
      } catch (err: any) {
        setError(err.message || "An error occurred");
        setState("idle");
      }
    }
  };

  return (
    <div className="page">
      <h1>Echo</h1>
      <p className="subtitle">Voice AI Assistant</p>

      <div className="status">{state}</div>

      <div>
        <select
          value={ttsProvider}
          onChange={(e) => setTtsProvider(e.target.value as "piper" | "elevenlabs")}
          disabled={state !== "idle"}
        >
          <option value="piper">Piper (Local)</option>
          <option value="elevenlabs">ElevenLabs</option>
        </select>
        <button
          className="mic-button"
          onClick={handleClick}
          disabled={state !== "idle" && state !== "recording"}
        >
          {state === "recording" ? "Stop recording" : "Start recording"}
        </button>
        <button className="new-session" onClick={newSession}>
          New session
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="empty">No messages yet.</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`turn turn-${m.role}`}>
              <div className="turn-label">{m.role === "user" ? "You" : "Echo"}</div>
              <div className="turn-content">{m.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
