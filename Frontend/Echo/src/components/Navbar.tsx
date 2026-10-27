import React from "react";
import { useAuth } from "../context/AuthContext";

export type AppView = "landing" | "login" | "signup" | "studio";

interface NavbarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, isAuthenticated, tokenDaysRemaining, logout } = useAuth();

  return (
    <header className="echo-navbar" role="banner">
      <div className="echo-navbar-inner">
        {/* Brand Identity */}
        <div
          className="echo-nav-brand"
          onClick={() => onNavigate("landing")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onNavigate("landing");
            }
          }}
          aria-label="Echo Home"
        >
          <div className="echo-brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5v14M7 5v14M2 9v6M22 9v6" />
            </svg>
          </div>
          <span className="echo-brand-name">ECHO</span>
          <span className="echo-brand-sub">STUDIO</span>
        </div>

        {/* View Links */}
        <nav className="echo-nav-links" aria-label="Primary Navigation">
          <button
            type="button"
            className={`echo-nav-link ${currentView === "landing" ? "active" : ""}`}
            onClick={() => onNavigate("landing")}
          >
            Overview
          </button>
          <button
            type="button"
            className={`echo-nav-link ${currentView === "studio" ? "active" : ""}`}
            onClick={() => onNavigate("studio")}
          >
            Voice Studio
          </button>
        </nav>

        {/* Right Section: Theme Toggle & Authentication Status */}
        <div className="echo-nav-actions">

          {isAuthenticated && user ? (
            <div className="echo-user-menu">
              <div className="echo-user-pill" title={`Logged in as ${user.email}`}>
                <span className="echo-user-avatar">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </span>
                <span className="echo-user-name">{user.name}</span>
                <span className="echo-token-badge">
                  {tokenDaysRemaining > 0 ? `${tokenDaysRemaining}d` : "Active"}
                </span>
              </div>

              {currentView !== "studio" && (
                <button
                  type="button"
                  className="echo-btn-primary"
                  onClick={() => onNavigate("studio")}
                >
                  Enter Studio
                </button>
              )}

              <button
                type="button"
                className="echo-btn-ghost"
                onClick={() => logout()}
                title="Sign out of your session"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="echo-guest-actions">
              <button
                type="button"
                className={`echo-btn-ghost ${currentView === "login" ? "active" : ""}`}
                onClick={() => onNavigate("login")}
              >
                Sign In
              </button>
              <button
                type="button"
                className="echo-btn-primary"
                onClick={() => onNavigate("signup")}
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
