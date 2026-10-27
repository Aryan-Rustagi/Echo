import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export interface SignalLineProps {
  progress?: number; // 0 to 1, follows active pipeline stage
}

export function SignalLine({ progress = 0 }: SignalLineProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const animProxyRef = useRef<{ phase: number; amplitude: number }>({
    phase: 0,
    amplitude: 2,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    function handleMediaChange(e: MediaQueryListEvent | MediaQueryList) {
      setReducedMotion("matches" in e ? e.matches : false);
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaChange);
      return () => mediaQuery.removeEventListener("change", handleMediaChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleMediaChange);
      return () => mediaQuery.removeListener(handleMediaChange);
    }
  }, []);

  // Update amplitude when progress changes
  useEffect(() => {
    if (reducedMotion) return;

    const targetAmp = 2 + progress * 22;
    gsap.to(animProxyRef.current, {
      amplitude: targetAmp,
      duration: 0.5,
      ease: "power2.out",
    });
  }, [progress, reducedMotion]);

  // GSAP continuous slow sine wave breathing loop
  useEffect(() => {
    if (reducedMotion) {
      if (pathRef.current) {
        pathRef.current.setAttribute("d", "M 0 48 L 600 48");
      }
      return;
    }

    const proxy = animProxyRef.current;
    const tween = gsap.to(proxy, {
      phase: Math.PI * 2,
      duration: 8,
      repeat: -1,
      ease: "none",
      onUpdate: () => {
        if (!pathRef.current) return;
        const width = 600;
        const height = 96;
        const midY = height / 2;
        const segments = 48;
        const coords: string[] = [];

        for (let i = 0; i <= segments; i += 1) {
          const ratio = i / segments;
          const x = ratio * width;
          // Smooth bell envelope so the wave is anchored at the left and right borders
          const envelope = Math.sin(ratio * Math.PI);
          const y =
            midY +
            Math.sin(ratio * Math.PI * 4 + proxy.phase) * proxy.amplitude * envelope;
          coords.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
        }

        pathRef.current.setAttribute("d", coords.join(" "));
      },
    });

    return () => {
      tween.kill();
    };
  }, [reducedMotion]);

  const isIdle = progress === 0;
  const strokeColor = isIdle ? "rgba(245, 245, 240, 0.3)" : "#FF6B00";

  return (
    <div
      className="signal-line-wrapper"
      role="presentation"
      aria-hidden="true"
    >
      <svg
        className="signal-line-svg"
        viewBox="0 0 600 96"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          ref={pathRef}
          d="M 0 48 L 600 48"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default SignalLine;
