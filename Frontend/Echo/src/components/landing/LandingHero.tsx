import React from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface LandingHeroProps {
  onStartTalking?: () => void;
}

const POINTS = [
  {
    index: "01",
    title: "Streams by sentence",
    detail: "Each sentence starts speaking as soon as its punctuation arrives.",
  },
  {
    index: "02",
    title: "Interrupt anytime",
    detail: "Speaking over Echo cancels audio playback and the in-flight LLM request.",
  },
  {
    index: "03",
    title: "Free by default",
    detail: "Browser speech recognition needs no API key.",
  },
];

export function LandingHero({ onStartTalking }: LandingHeroProps) {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.7,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  };

  function handleHowItWorks() {
    const el = document.getElementById("pipeline");
    if (el) {
      el.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth" });
    }
  }

  return (
    <motion.section
      className="landing-hero"
      aria-label="Overview"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Eyebrow */}
      <motion.div className="landing-eyebrow" variants={itemVariants}>
        Browser-native voice pipeline
      </motion.div>

      {/* Two-Line Headline */}
      <motion.h1 className="landing-headline" variants={itemVariants}>
        <span>Speak. Hear the answer</span>
        <br />
        <span className="landing-headline-sub">while it&apos;s still forming.</span>
      </motion.h1>

      {/* Paragraph (max 52ch, color #C5C4BB, 18px/1.6) */}
      <motion.p className="landing-lead" variants={itemVariants}>
        Echo listens with your browser&apos;s speech engine, streams the reply from Gemini Flash, and speaks each sentence as soon as it&apos;s complete. No all-in-one voice SDK.
      </motion.p>

      {/* Three points as a plain list with 1px dividers, NOT cards */}
      <motion.ul className="landing-points-list" variants={itemVariants}>
        {POINTS.map((point) => (
          <li key={point.index} className="landing-point-row">
            <span className="point-index">{point.index}</span>
            <div className="point-content">
              <span className="point-title">{point.title}</span>
              <span className="point-dash">—</span>
              <span className="point-detail">{point.detail}</span>
            </div>
          </li>
        ))}
      </motion.ul>

      {/* CTAs */}
      <motion.div className="landing-cta-row" variants={itemVariants}>
        <motion.button
          type="button"
          className="btn-start-talking"
          onClick={onStartTalking}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
        >
          <span>Start talking</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </motion.button>

        <button
          type="button"
          className="btn-how-it-works"
          onClick={handleHowItWorks}
        >
          How it works
        </button>
      </motion.div>
    </motion.section>
  );
}

export default LandingHero;
