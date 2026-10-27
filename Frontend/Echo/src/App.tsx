import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Navbar, { type AppView } from "./components/Navbar";
import VoicePipelineLanding from "./components/landing/VoicePipelineLanding";
import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";
import StudioLayout from "./components/studio/StudioLayout";
import "./App.css";
import "./Auth.css";

function AppContent() {
  const [currentView, setCurrentView] = useState<AppView>("landing");
  const { sessionNotice, dismissNotice } = useAuth();

  return (
    <div className="echo-app-container">
      {/* Session Expired / Token Alert Banner */}
      {sessionNotice && (
        <aside className="echo-alert-banner warning" role="alert">
          <div className="echo-alert-banner-text">
            <span aria-hidden="true">⏳</span>
            <span>{sessionNotice}</span>
          </div>
          <button
            type="button"
            className="echo-alert-dismiss"
            onClick={dismissNotice}
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </aside>
      )}

      {/* Navigation header rendered on login/signup views */}
      {(currentView === "login" || currentView === "signup") && (
        <Navbar currentView={currentView} onNavigate={setCurrentView} />
      )}

      {/* Main View Router */}
      <main className="echo-app-main">
        {currentView === "landing" && (
          <VoicePipelineLanding
            onNavigate={setCurrentView}
            onNavigateToStudio={function handleGoToStudio() {
              setCurrentView("studio");
            }}
          />
        )}

        {currentView === "login" && (
          <LoginPage onNavigate={setCurrentView} />
        )}

        {currentView === "signup" && (
          <SignupPage onNavigate={setCurrentView} />
        )}

        {currentView === "studio" && (
          <StudioLayout onNavigate={setCurrentView} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
