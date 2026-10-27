import React, { useState } from "react";
import { PRESET_PERSONAS, type PersonaId } from "../../config/personas";
import type { SttEngine } from "../../pipeline/useVoiceSession";
import type { LlmProvider } from "../../pipeline/llm";
import type { TtsProvider } from "../../pipeline/tts";

export interface SidebarProps {
  activePersonaId: PersonaId;
  onSelectPersona: (id: PersonaId) => void;
  customSystemPrompt: string;
  onChangeCustomPrompt: (prompt: string) => void;
  sttEngine: SttEngine;
  onChangeSttEngine: (engine: SttEngine) => void;
  llmProvider: LlmProvider;
  onChangeLlmProvider: (provider: LlmProvider) => void;
  ttsProvider: TtsProvider;
  onChangeTtsProvider: (provider: TtsProvider) => void;
  isBrowserSttAvailable: boolean;
  onNavigate?: (view: "landing" | "login" | "signup" | "studio") => void;
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  activePersonaId,
  onSelectPersona,
  customSystemPrompt,
  onChangeCustomPrompt,
  sttEngine,
  onChangeSttEngine,
  llmProvider,
  onChangeLlmProvider,
  ttsProvider,
  onChangeTtsProvider,
  isBrowserSttAvailable,
  onNavigate,
  isOpenOnMobile,
  onCloseMobile,
}: SidebarProps) {
  const [showCustomEditor, setShowCustomEditor] = useState<boolean>(activePersonaId === "custom");

  function handlePersonaClick(id: PersonaId) {
    onSelectPersona(id);
    if (id === "custom") {
      setShowCustomEditor(true);
    }
  }

  return (
    <nav className={`echo-studio-sidebar ${isOpenOnMobile ? "mobile-open" : ""}`} aria-label="Studio Navigation and Settings">
      {/* Brand & Exit to Landing */}
      <div className="echo-sidebar-brand-section">
        {onCloseMobile && (
          <button
            type="button"
            className="echo-sidebar-mobile-close"
            onClick={onCloseMobile}
            aria-label="Close settings drawer"
            title="Close settings"
          >
            ✕
          </button>
        )}
        <div
          className="echo-sidebar-brand"
          onClick={function handleBrandClick() {
            if (onNavigate) onNavigate("landing");
          }}
          role="button"
          tabIndex={0}
          onKeyDown={function handleKey(e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (onNavigate) onNavigate("landing");
            }
          }}
          aria-label="Back to Echo Overview"
        >
          <div className="echo-brand-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5v14M7 5v14M2 9v6M22 9v6" />
            </svg>
          </div>
          <div className="echo-brand-text">
            <span className="echo-brand-title">ECHO</span>
            <span className="echo-brand-tag">STUDIO</span>
          </div>
        </div>

        {onNavigate && (
          <button
            type="button"
            className="echo-sidebar-exit-btn"
            onClick={function handleExit() {
              onNavigate("landing");
            }}
            title="Return to Overview"
            aria-label="Return to Overview"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Overview</span>
          </button>
        )}
      </div>

      {/* Persona Selection */}
      <div className="echo-sidebar-section">
        <div className="echo-sidebar-section-header">
          <span className="section-title">Assistant Persona</span>
        </div>
        <div className="echo-persona-list" role="radiogroup" aria-label="Assistant Persona">
          {PRESET_PERSONAS.map(function renderPersona(p) {
            const isSelected = activePersonaId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`echo-persona-btn ${isSelected ? "selected" : ""}`}
                onClick={function handleClick() {
                  handlePersonaClick(p.id);
                }}
              >
                <div className="persona-info">
                  <span className="persona-name">{p.name}</span>
                  <span className="persona-badge">{p.badge}</span>
                </div>
                {isSelected && (
                  <span className="persona-selected-pip" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Custom Prompt Editor Modal / Expandable */}
        {activePersonaId === "custom" && showCustomEditor && (
          <div className="echo-custom-prompt-box">
            <div className="prompt-box-header">
              <label htmlFor="custom-system-prompt" className="prompt-box-label">
                Custom System Prompt
              </label>
              <button
                type="button"
                className="prompt-box-toggle"
                onClick={function toggle() {
                  setShowCustomEditor(!showCustomEditor);
                }}
              >
                Collapse
              </button>
            </div>
            <textarea
              id="custom-system-prompt"
              className="echo-custom-prompt-input"
              rows={4}
              value={customSystemPrompt}
              onChange={function handleChange(e) {
                onChangeCustomPrompt(e.target.value);
              }}
              placeholder="Provide system instructions for the LLM voice persona..."
            />
          </div>
        )}
      </div>

      {/* Hardware / Engine Settings */}
      <div className="echo-sidebar-section">
        <div className="echo-sidebar-section-header">
          <span className="section-title">Engine Configuration</span>
        </div>

        {/* STT Engine */}
        <div className="echo-setting-item">
          <label htmlFor="stt-engine-select" className="echo-setting-label">
            Speech-to-Text
          </label>
          <div className="echo-select-wrapper">
            <select
              id="stt-engine-select"
              className="echo-select-input"
              value={sttEngine}
              onChange={function handleChange(e) {
                onChangeSttEngine(e.target.value as SttEngine);
              }}
            >
              <option value="hybrid">
                Hybrid STT: Interim Browser + Canonical (Default)
              </option>
              <option value="local_whisper">
                Local Open-Source (whisper.cpp)
              </option>
              <option value="browser" disabled={!isBrowserSttAvailable}>
                Browser Web Speech Only {isBrowserSttAvailable ? "" : "(Unavailable)"}
              </option>
              <option value="deepgram">Deepgram Nova-3 (WebSocket)</option>
              <option value="speechmatics">Speechmatics Flow (WebSocket)</option>
            </select>
          </div>
        </div>

        {/* LLM Provider */}
        <div className="echo-setting-item">
          <label htmlFor="llm-provider-select" className="echo-setting-label">
            Reasoning LLM
          </label>
          <div className="echo-select-wrapper">
            <select
              id="llm-provider-select"
              className="echo-select-input"
              value={llmProvider}
              onChange={function handleChange(e) {
                onChangeLlmProvider(e.target.value as LlmProvider);
              }}
            >
              <option value="gemini">Google Gemini Flash (Primary)</option>
              <option value="openai">OpenAI GPT-4o-mini</option>
            </select>
          </div>
        </div>

        {/* TTS Provider */}
        <div className="echo-setting-item">
          <label htmlFor="tts-provider-select" className="echo-setting-label">
            Voice Synthesis (TTS)
          </label>
          <div className="echo-select-wrapper">
            <select
              id="tts-provider-select"
              className="echo-select-input"
              value={ttsProvider}
              onChange={function handleChange(e) {
                onChangeTtsProvider(e.target.value as TtsProvider);
              }}
            >
              <option value="elevenlabs">ElevenLabs Flash v2.5</option>
              <option value="browser">Browser SpeechSynthesis</option>
            </select>
          </div>
        </div>
      </div>


      {/* Sidebar Footer */}
      <div className="echo-sidebar-footer">
        <div className="echo-db-status-chip" title="Connected to Neon Serverless PostgreSQL">
          <span className="echo-db-dot" aria-hidden="true" />
          <span>Neon PostgreSQL</span>
        </div>
      </div>
    </nav>
  );
}

export default Sidebar;
