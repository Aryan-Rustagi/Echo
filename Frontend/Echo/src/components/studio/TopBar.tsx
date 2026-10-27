import React, { useState, useEffect, useRef } from "react";
import type { VoiceStatus } from "../../pipeline/useVoiceSession";
import type { Message } from "../../pipeline/llm";
import { getPersonaById, type PersonaId } from "../../config/personas";

export interface TopBarProps {
  status: VoiceStatus;
  personaId: PersonaId;
  messages: Message[];
  onNewSession: () => void;
  onToggleSidebar?: () => void;
}

export function TopBar({
  status,
  personaId,
  messages,
  onNewSession,
  onToggleSidebar,
}: TopBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Real session timer starting at 0:00
  useEffect(function startRealTimer() {
    timerRef.current = setInterval(function tick() {
      setElapsed(function inc(prev) {
        return prev + 1;
      });
    }, 1000);

    return function cleanup() {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function handleReset() {
    setElapsed(0);
    onNewSession();
  }

  function formatTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function handleExport() {
    if (messages.length === 0) return;
    const content = messages
      .map(function formatMsg(m) {
        return `[${m.role.toUpperCase()}]: ${m.content}`;
      })
      .join("\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo-session-${new Date().toISOString().slice(0, 19)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const persona = getPersonaById(personaId);
  const isLive = status === "listening" || status === "speaking";

  return (
    <header className="echo-studio-topbar" role="banner">
      <div className="topbar-left">
        {onToggleSidebar && (
          <button
            type="button"
            className="topbar-mobile-menu-btn"
            onClick={onToggleSidebar}
            aria-label="Open sidebar settings"
            title="Open settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <div className="topbar-status-indicator">
          <span className={`topbar-dot ${isLive ? "live" : "idle"}`} aria-hidden="true" />
          <span className="topbar-status-name">
            {status === "listening"
              ? "Capturing Mic"
              : status === "speaking"
              ? "Synthesizing Speech"
              : status === "thinking"
              ? "LLM Streaming"
              : "Studio Online"}
          </span>
        </div>

        <span className="topbar-sep" aria-hidden="true">/</span>

        <span className="topbar-persona-label">
          {persona.name}
        </span>

        <span className="topbar-timer mono" title="Session duration">
          {formatTime(elapsed)}
        </span>
      </div>

      <div className="topbar-right">
        {messages.length > 0 && (
          <button
            type="button"
            className="topbar-btn ghost"
            onClick={handleExport}
            title="Export conversation history"
            aria-label="Export conversation history"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export</span>
          </button>
        )}

        <button
          type="button"
          className="topbar-btn primary"
          onClick={handleReset}
          title="Reset timer and clear current session"
          aria-label="Reset timer and clear current session"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>New Session</span>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
