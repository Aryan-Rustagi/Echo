import React from "react";
import "./landing.css";

export interface LandingShellProps {
  left: React.ReactNode;
  right: React.ReactNode;
  topbar: React.ReactNode;
}

export default function LandingShell({ left, right, topbar }: LandingShellProps) {
  return (
    <div className="landing-root">
      {topbar}
      <main className="landing-main">
        <div className="landing-grid">
          <div className="landing-left-slot">{left}</div>
          <div className="landing-right-slot" id="auth">{right}</div>
        </div>
      </main>
    </div>
  );
}
