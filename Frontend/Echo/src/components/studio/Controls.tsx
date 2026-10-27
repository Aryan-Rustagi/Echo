import React from "react";
import type { VoiceStatus } from "../../pipeline/useVoiceSession";

export interface ControlsProps {
  status: VoiceStatus;
  continuousMode: boolean;
  onToggleListening: () => void;
  onCancel: () => void;
  onClearSession: () => void;
  onToggleContinuous: () => void;
}

export function Controls({
  status,
  continuousMode,
  onToggleListening,
  onCancel,
  onClearSession,
  onToggleContinuous,
}: ControlsProps) {
  const isListening = status === "listening";
  const isSpeaking = status === "speaking";
  const isThinking = status === "thinking";
  const isActive = isListening || isSpeaking || isThinking;

  let micAriaLabel = "Start speaking";
  if (isListening) micAriaLabel = "Stop speaking";
  if (isSpeaking) micAriaLabel = "Interrupt Echo";
  if (isThinking) micAriaLabel = "Cancel response generation";

  return (
    <div className="echo-controls-root">
      <div className="echo-controls-cluster">
        {/* Cancel / Interrupt Action Button */}
        {isActive && (
          <button
            type="button"
            className="echo-secondary-btn echo-cancel-btn"
            onClick={onCancel}
            title="Interrupt or cancel turn"
            aria-label="Interrupt or cancel turn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            <span className="btn-label-desktop">Stop</span>
          </button>
        )}

        {/* Primary Mic Button (Large Tap Target) */}
        <button
          type="button"
          className={`echo-mic-primary-btn ${status}`}
          onClick={onToggleListening}
          aria-label={micAriaLabel}
          title={`${micAriaLabel} (Shortcut: Spacebar)`}
        >
          {isListening ? (
            <div className="mic-listening-indicator" aria-hidden="true">
              <span className="mic-stop-square" />
            </div>
          ) : isThinking ? (
            <div className="mic-thinking-spinner" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-icon">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
          ) : isSpeaking ? (
            <div className="mic-speaking-indicator" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </div>
          ) : (
            <div className="mic-idle-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </div>
          )}
        </button>

        {/* Clear Conversation History Button */}
        <button
          type="button"
          className="echo-secondary-btn"
          onClick={onClearSession}
          title="Clear conversation session"
          aria-label="Clear conversation session"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          <span className="btn-label-desktop">Clear</span>
        </button>
      </div>

      {/* Auxiliary Controls & Keyboard Hint */}
      <div className="echo-controls-footer">
        <label className="echo-continuous-toggle">
          <input
            type="checkbox"
            checked={continuousMode}
            onChange={onToggleContinuous}
            className="echo-checkbox"
          />
          <span className="echo-toggle-slider" aria-hidden="true" />
          <span className="echo-toggle-label">Continuous conversation</span>
        </label>

        <div className="echo-keyboard-hint">
          <span>Tap</span>
          <kbd className="echo-kbd">Space</kbd>
          <span>to {isSpeaking ? "interrupt" : isListening ? "finish" : "speak"}</span>
        </div>
      </div>
    </div>
  );
}

export default Controls;
