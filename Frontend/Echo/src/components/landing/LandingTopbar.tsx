import React from "react";

export interface LandingTopbarProps {
  onNavigate?: (view: "landing" | "login" | "signup" | "studio") => void;
}

export function LandingTopbar({ onNavigate }: LandingTopbarProps) {
  function handleSignInClick(e: React.MouseEvent) {
    e.preventDefault();
    if (typeof window !== "undefined" && window.innerWidth < 900) {
      const authElement = document.getElementById("auth");
      if (authElement) {
        authElement.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    if (onNavigate) {
      onNavigate("login");
    }
  }

  return (
    <header className="landing-topbar-wrapper" role="banner">
      <div className="landing-topbar">
        {/* Left: 4-bar signal mark, ECHO wordmark, PIPELINE V2.5 tag */}
        <div className="topbar-left">
          <div className="topbar-signal-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              {/* Outer bars #F5F5F0, middle two #FF6B00 */}
              <rect x="2" y="5" width="2.5" height="10" rx="1.25" fill="#F5F5F0" />
              <rect x="6.5" y="2" width="2.5" height="16" rx="1.25" fill="#FF6B00" />
              <rect x="11" y="2" width="2.5" height="16" rx="1.25" fill="#FF6B00" />
              <rect x="15.5" y="5" width="2.5" height="10" rx="1.25" fill="#F5F5F0" />
            </svg>
          </div>
          <span className="topbar-wordmark">ECHO</span>
          <span className="topbar-tag">PIPELINE V2.5</span>
        </div>

        {/* Right: text link Sign in only */}
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-signin-link"
            onClick={handleSignInClick}
          >
            Sign in
          </button>
        </div>
      </div>
    </header>
  );
}

export default LandingTopbar;
