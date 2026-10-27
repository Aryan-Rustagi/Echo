import React from "react";
import type { LatencyTrackerState } from "../../pipeline/latencyTracker";
import type { SttEngine } from "../../pipeline/useVoiceSession";
import type { LlmProvider } from "../../pipeline/llm";
import type { TtsProvider } from "../../pipeline/tts";

export interface TelemetryPanelProps {
  latencyState: LatencyTrackerState;
  sttEngine: SttEngine;
  llmProvider: LlmProvider;
  ttsProvider: TtsProvider;
}

export function TelemetryPanel({
  latencyState,
  sttEngine,
  llmProvider,
  ttsProvider,
}: TelemetryPanelProps) {
  const { currentTurn, history, averageFirstAudioMs, averageFirstTokenMs } = latencyState;

  const sttEngineLabels: Record<SttEngine, string> = {
    hybrid: "Hybrid STT (Dual-Path)",
    local_whisper: "Local Open-Source (whisper.cpp)",
    browser: "Browser Web Speech",
    deepgram: "Deepgram Nova-3",
    speechmatics: "Speechmatics RT",
  };

  const llmProviderLabels: Record<LlmProvider, string> = {
    gemini: "Google Gemini Flash",
    openai: "OpenAI GPT-4o-mini",
  };

  const ttsProviderLabels: Record<TtsProvider, string> = {
    elevenlabs: "ElevenLabs Flash v2.5",
    browser: "Browser SpeechSynthesis",
  };

  return (
    <aside className="echo-telemetry-sidebar" aria-label="Pipeline Performance Telemetry">
      <div className="echo-telemetry-header">
        <div className="telemetry-title-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="telemetry-title">Session Telemetry</span>
        </div>
        <span className="telemetry-badge">LIVE</span>
      </div>

      {/* Latency Metrics Grid */}
      <div className="echo-telemetry-metrics">
        <div className="telemetry-card">
          <span className="telemetry-label">First Audio (TTFA)</span>
          <span className="telemetry-value highlight">
            {currentTurn?.sttToFirstAudioMs !== null && currentTurn?.sttToFirstAudioMs !== undefined
              ? `${currentTurn.sttToFirstAudioMs}ms`
              : averageFirstAudioMs !== null
              ? `~${averageFirstAudioMs}ms avg`
              : "—"}
          </span>
          <span className="telemetry-subtext">STT final → Web Audio playback</span>
        </div>

        <div className="telemetry-card">
          <span className="telemetry-label">First Token (TTFT)</span>
          <span className="telemetry-value">
            {currentTurn?.sttToFirstTokenMs !== null && currentTurn?.sttToFirstTokenMs !== undefined
              ? `${currentTurn.sttToFirstTokenMs}ms`
              : averageFirstTokenMs !== null
              ? `~${averageFirstTokenMs}ms avg`
              : "—"}
          </span>
          <span className="telemetry-subtext">STT final → First LLM token</span>
        </div>

        <div className="telemetry-card">
          <span className="telemetry-label">TTS Synthesis</span>
          <span className="telemetry-value">
            {currentTurn?.tokenToAudioMs !== null && currentTurn?.tokenToAudioMs !== undefined
              ? `${currentTurn.tokenToAudioMs}ms`
              : "—"}
          </span>
          <span className="telemetry-subtext">First token → Audio ready</span>
        </div>

        <div className="telemetry-card">
          <span className="telemetry-label">Session Turns</span>
          <span className="telemetry-value">
            {history.length}
          </span>
          <span className="telemetry-subtext">Recorded conversational turns</span>
        </div>
      </div>

      {/* Active Pipeline Components */}
      <div className="echo-telemetry-section">
        <span className="telemetry-section-title">Active Signal Path</span>
        <ul className="telemetry-engine-list">
          <li className="telemetry-engine-row">
            <span className="engine-label">STT Engine</span>
            <span className="engine-value">{sttEngineLabels[sttEngine]}</span>
          </li>
          <li className="telemetry-engine-row">
            <span className="engine-label">LLM Provider</span>
            <span className="engine-value">{llmProviderLabels[llmProvider]}</span>
          </li>
          <li className="telemetry-engine-row">
            <span className="engine-label">TTS Output</span>
            <span className="engine-value">{ttsProviderLabels[ttsProvider]}</span>
          </li>
        </ul>
      </div>

      {/* Turn History Table */}
      <div className="echo-telemetry-section history-section">
        <span className="telemetry-section-title">Measured Turns Log</span>
        {history.length === 0 ? (
          <p className="telemetry-history-empty">
            No turns completed yet. Speak a sentence to record live latency measurements.
          </p>
        ) : (
          <div className="telemetry-history-table-wrap">
            <table className="telemetry-history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>TTFT</th>
                  <th>TTFA</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 8).map(function renderTurnRow(turn) {
                  return (
                    <tr key={`turn-${turn.turnId}`}>
                      <td>{turn.timestamp}</td>
                      <td>{turn.sttToFirstTokenMs ? `${turn.sttToFirstTokenMs}ms` : "—"}</td>
                      <td className="audio-cell">{turn.sttToFirstAudioMs ? `${turn.sttToFirstAudioMs}ms` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
}

export default TelemetryPanel;
