import React, { useRef, useEffect } from "react";
import type { VoiceStatus } from "../../pipeline/useVoiceSession";

export interface WaveformProps {
  volume: number;
  status: VoiceStatus;
}

export function Waveform({ volume, status }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<number>(0);
  const volumeRef = useRef<number>(volume);
  volumeRef.current = volume;
  const statusRef = useRef<VoiceStatus>(status);
  statusRef.current = status;

  useEffect(function initWaveformAnimation() {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function render() {
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const currentStatus = statusRef.current;
      const currentVolume = volumeRef.current;

      const centerY = height / 2;
      const isActive = currentStatus === "listening" || currentStatus === "speaking";
      const isThinking = currentStatus === "thinking";

      // Draw subtle centerline grid track
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(16, centerY);
      ctx.lineTo(width - 16, centerY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!prefersReducedMotion) {
        phaseRef.current += isActive ? 0.08 : isThinking ? 0.03 : 0.01;
      }

      // Calculate wave amplitude from real volume
      const baseAmp = isActive
        ? Math.max(6, currentVolume * (height * 0.42))
        : isThinking
        ? 4 * (1 + 0.5 * Math.sin(phaseRef.current))
        : 1.5;

      // Color scheme based on state
      let strokeColor = "rgba(255, 255, 255, 0.25)";
      if (currentStatus === "listening") {
        strokeColor = "#FF6B00"; // Amber active signal
      } else if (currentStatus === "speaking") {
        strokeColor = "#FFA500"; // Light amber playback
      } else if (currentStatus === "thinking") {
        strokeColor = "rgba(255, 107, 0, 0.65)";
      } else if (currentStatus === "error") {
        strokeColor = "#F87171";
      }

      // Draw real sine wave signal
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      const points = 120;
      const step = (width - 32) / points;

      for (let i = 0; i <= points; i += 1) {
        const x = 16 + i * step;
        // Envelope: tapered at ends
        const progress = i / points;
        const envelope = Math.sin(progress * Math.PI);

        // Harmonic oscillation
        const wave1 = Math.sin(progress * 10 + phaseRef.current);
        const wave2 = Math.sin(progress * 20 - phaseRef.current * 0.7) * 0.35;
        const y = centerY + (wave1 + wave2) * baseAmp * envelope;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // If active, draw center amplitude pip
      if (isActive) {
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(width / 2, centerY, 3 + currentVolume * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      animationId = requestAnimationFrame(render);
    }

    animationId = requestAnimationFrame(render);
    return function cleanupAnimation() {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="echo-waveform-container" aria-hidden="true">
      <canvas ref={canvasRef} className="echo-waveform-canvas" />
    </div>
  );
}

export default Waveform;
