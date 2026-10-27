import React from "react";
import type { VoiceStatus } from "../../pipeline/useVoiceSession";

export interface StatusLineProps {
  status: VoiceStatus;
  errorMsg: string | null;
  fallbackNotice: string | null;
  onRetry?: () => void;
  onClearError?: () => void;
}

export function StatusLine({
  status,
  errorMsg,
  fallbackNotice,
  onRetry,
  onClearError,
}: StatusLineProps) {
  let label = "Ready · Tap microphone or press Spacebar";
  let statusClass = "status-idle";
  let showAction = false;
  let actionLabel = "";

  if (errorMsg) {
    statusClass = "status-error";
    label = errorMsg;
    showAction = true;
    actionLabel = "Retry";
  } else if (status === "listening") {
    statusClass = "status-listening";
    label = "Listening · Speak naturally (auto-finishes on silence)";
  } else if (status === "transcribing") {
    statusClass = "status-transcribing";
    label = "Transcribing speech via audio pipeline...";
  } else if (status === "thinking") {
    statusClass = "status-thinking";
    label = "Thinking · Generating streaming response...";
  } else if (status === "speaking") {
    statusClass = "status-speaking";
    label = "Speaking · Tap microphone or Spacebar to interrupt";
  }

  return (
    <div className="echo-status-container" role="status" aria-live="assertive">
      <div className={`echo-status-pill ${statusClass}`}>
        <span className="echo-status-dot" aria-hidden="true" />
        <span className="echo-status-text">{label}</span>
        {showAction && onRetry && (
          <button
            type="button"
            className="echo-status-action-btn"
            onClick={function handleAction() {
              if (onClearError) onClearError();
              onRetry();
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>

      {fallbackNotice && (
        <div className="echo-fallback-notice-banner" role="note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{fallbackNotice}</span>
        </div>
      )}
    </div>
  );
}

export default StatusLine;
