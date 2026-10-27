import React, { useEffect } from "react";
import type { VoiceSessionState } from "../../pipeline/useVoiceSession";
import { Waveform } from "./Waveform";
import { Transcript } from "./Transcript";
import { StatusLine } from "./StatusLine";
import { Controls } from "./Controls";

export interface VoiceCanvasProps {
  session: VoiceSessionState;
  onToggleListening: () => void;
  onCancel: () => void;
  onClearSession: () => void;
  onToggleContinuous: () => void;
  onRetry: () => void;
}

export function VoiceCanvas({
  session,
  onToggleListening,
  onCancel,
  onClearSession,
  onToggleContinuous,
  onRetry,
}: VoiceCanvasProps) {
  const {
    status,
    messages,
    interimTranscript,
    finalTranscript,
    assistantStreamingText,
    errorMsg,
    fallbackNotice,
    continuousMode,
    audioVolume,
  } = session;

  const onToggleListeningRef = React.useRef(onToggleListening);
  onToggleListeningRef.current = onToggleListening;
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;

  // Spacebar push-to-talk & interrupt keyboard shortcut
  useEffect(function initSpacebarShortcut() {
    function handleKeyDown(e: KeyboardEvent) {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        onToggleListeningRef.current();
      } else if (e.key === "Escape") {
        onCancelRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return function cleanup() {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="echo-voice-canvas-root">
      {/* Waveform Visualizer anchored to real volume */}
      <div className="echo-canvas-waveform-area">
        <Waveform volume={audioVolume} status={status} />
      </div>

      {/* Transcript of real conversation */}
      <div className="echo-canvas-transcript-area">
        <Transcript
          messages={messages}
          interimTranscript={interimTranscript}
          finalTranscript={finalTranscript}
          assistantStreamingText={assistantStreamingText}
          status={status}
        />
      </div>

      {/* Real-time Status feedback */}
      <div className="echo-canvas-status-area">
        <StatusLine
          status={status}
          errorMsg={errorMsg}
          fallbackNotice={fallbackNotice}
          onRetry={onRetry}
        />
      </div>

      {/* Primary Interaction Controls */}
      <div className="echo-canvas-controls-area">
        <Controls
          status={status}
          continuousMode={continuousMode}
          onToggleListening={onToggleListening}
          onCancel={onCancel}
          onClearSession={onClearSession}
          onToggleContinuous={onToggleContinuous}
        />
      </div>
    </div>
  );
}

export default VoiceCanvas;
