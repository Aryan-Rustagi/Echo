import React, { useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

// Register ScrollTrigger once per requirements
gsap.registerPlugin(ScrollTrigger);

export interface PipelineTimelineProps {
  onProgressChange?: (progress: number) => void;
}

interface StageItem {
  number: string;
  name: string;
  tech: string;
  description: string;
}

const STAGES: StageItem[] = [
  {
    number: "01",
    name: "Capture",
    tech: "Browser Web Speech API",
    description: "Mic audio becomes interim and final text in the browser.",
  },
  {
    number: "02",
    name: "Understand",
    tech: "Gemini Flash over SSE",
    description: "The final transcript streams to the model; tokens arrive as they are generated.",
  },
  {
    number: "03",
    name: "Segment",
    tech: "Sentence splitter",
    description: "Tokens are cut at . ! ? once a sentence is at least 15 characters.",
  },
  {
    number: "04",
    name: "Speak",
    tech: "ElevenLabs Flash v2.5 / SpeechSynthesis",
    description: "Each sentence is synthesized in parallel and played in strict order through Web Audio.",
  },
  {
    number: "05",
    name: "Interrupt",
    tech: "AbortController + Web Audio",
    description: "Barge-in stops playback and cancels the active request.",
  },
];

export function PipelineTimeline({ onProgressChange }: PipelineTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isInteractive, setIsInteractive] = useState<boolean>(false);

  useEffect(() => {
    function checkInteractive() {
      const isDesktop = window.innerWidth >= 900;
      const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setIsInteractive(isDesktop && !isReduced);
      if (!isDesktop || isReduced) {
        setActiveIndex(-1);
        onProgressChange?.(0);
      }
    }

    checkInteractive();
    window.addEventListener("resize", checkInteractive);
    return () => window.removeEventListener("resize", checkInteractive);
  }, [onProgressChange]);

  useGSAP(
    () => {
      const isDesktop = window.innerWidth >= 900;
      const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!isDesktop || isReduced || !containerRef.current) {
        return;
      }

      const trigger = ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top center-=80",
        end: "+=950",
        pin: true,
        scrub: 0.6,
        onUpdate: (self) => {
          const p = self.progress;
          const idx = Math.min(STAGES.length - 1, Math.floor(p * STAGES.length));
          setActiveIndex(idx);
          onProgressChange?.(p);

          if (railFillRef.current) {
            railFillRef.current.style.height = `${(p * 100).toFixed(1)}%`;
          }
        },
      });

      return () => {
        trigger.kill();
      };
    },
    { scope: containerRef, dependencies: [isInteractive] }
  );

  return (
    <section
      id="pipeline"
      ref={containerRef}
      className="pipeline-timeline-section"
      aria-label="Pipeline Architecture"
    >
      <div className="pipeline-header">
        <span className="pipeline-eyebrow">PIPELINE EXECUTION ARCHITECTURE</span>
        <h2 className="pipeline-heading">The Deterministic Signal Path</h2>
      </div>

      <div className="pipeline-body">
        {/* Desktop Vertical Rail */}
        <div className="pipeline-rail" aria-hidden="true">
          <div className="pipeline-rail-base" />
          <div ref={railFillRef} className="pipeline-rail-fill" />
        </div>

        {/* Stages List */}
        <div className="pipeline-stages-list" role="list">
          {STAGES.map((stage, idx) => {
            const isActive = isInteractive && idx === activeIndex;
            return (
              <div
                key={stage.number}
                className={`pipeline-stage-row ${isActive ? "active" : ""}`}
                role="listitem"
              >
                <div className="stage-num-col">
                  <span className="stage-num">{stage.number}</span>
                </div>
                <div className="stage-info-col">
                  <div className="stage-title-wrap">
                    <span className="stage-name">{stage.name}</span>
                    <span className="stage-tech-tag">{stage.tech}</span>
                  </div>
                  <p className="stage-desc">{stage.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PipelineTimeline;
