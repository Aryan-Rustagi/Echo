import React, { useState } from "react";
import { useVoiceSession } from "../../pipeline/useVoiceSession";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { VoiceCanvas } from "./VoiceCanvas";
import { TelemetryPanel } from "./TelemetryPanel";
import "./studio.css";

export interface StudioLayoutProps {
  onNavigate?: (view: "landing" | "login" | "signup" | "studio") => void;
}

export function StudioLayout({ onNavigate }: StudioLayoutProps) {
  const session = useVoiceSession();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="echo-studio-root">
      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="echo-sidebar-backdrop"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Navigation and Controls */}
      <Sidebar
        activePersonaId={session.personaId}
        onSelectPersona={(id) => {
          session.setPersonaId(id);
          setIsMobileSidebarOpen(false);
        }}
        customSystemPrompt={session.customSystemPrompt}
        onChangeCustomPrompt={session.setCustomSystemPrompt}
        sttEngine={session.sttEngine}
        onChangeSttEngine={session.setSttEngine}
        llmProvider={session.llmProvider}
        onChangeLlmProvider={session.setLlmProvider}
        ttsProvider={session.ttsProvider}
        onChangeTtsProvider={session.setTtsProvider}
        isBrowserSttAvailable={session.isBrowserSttAvailable}
        onNavigate={onNavigate}
        isOpenOnMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Conversational Workspace */}
      <div className="echo-studio-center">
        <TopBar
          status={session.status}
          personaId={session.personaId}
          messages={session.messages}
          onNewSession={session.clearSession}
          onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />
        <VoiceCanvas
          session={session}
          onToggleListening={session.toggleListening}
          onCancel={session.cancel}
          onClearSession={session.clearSession}
          onToggleContinuous={function toggleCont() {
            session.setContinuousMode(!session.continuousMode);
          }}
          onRetry={session.startListening}
        />
      </div>

      {/* Real Performance Telemetry Panel */}
      <TelemetryPanel
        latencyState={session.latencyState}
        sttEngine={session.sttEngine}
        llmProvider={session.llmProvider}
        ttsProvider={session.ttsProvider}
      />
    </div>
  );
}

export default StudioLayout;
