import React, { useState } from "react";
import LandingShell from "./LandingShell";
import LandingTopbar from "./LandingTopbar";
import LandingHero from "./LandingHero";
import SignalLine from "./SignalLine";
import PipelineTimeline from "./PipelineTimeline";
import TrustStrip from "./TrustStrip";
import AuthCard from "./AuthCard";

export interface VoicePipelineLandingProps {
  onNavigateToStudio?: () => void;
  onNavigate?: (view: "landing" | "login" | "signup" | "studio") => void;
}

export function VoicePipelineLanding({
  onNavigateToStudio,
  onNavigate,
}: VoicePipelineLandingProps) {
  const [pipelineProgress, setPipelineProgress] = useState<number>(0);

  function handleStartTalking() {
    if (onNavigateToStudio) {
      onNavigateToStudio();
    } else if (onNavigate) {
      onNavigate("studio");
    }
  }

  return (
    <LandingShell
      topbar={<LandingTopbar onNavigate={onNavigate} />}
      left={
        <>
          <LandingHero onStartTalking={handleStartTalking} />
          <SignalLine progress={pipelineProgress} />
          <PipelineTimeline onProgressChange={setPipelineProgress} />
          <TrustStrip />
        </>
      }
      right={<AuthCard initialTab="signin" onSuccess={handleStartTalking} />}
    />
  );
}

export default VoicePipelineLanding;
