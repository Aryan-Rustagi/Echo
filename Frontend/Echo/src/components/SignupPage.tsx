import React from "react";
import { AuthCard } from "./landing/AuthCard";
import type { AppView } from "./Navbar";

interface SignupPageProps {
  onNavigate: (view: AppView) => void;
}

export function SignupPage({ onNavigate }: SignupPageProps) {
  function handleSuccess() {
    onNavigate("studio");
  }

  return (
    <div className="echo-auth-view landing-root" style={{ minHeight: "calc(100vh - 64px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      <AuthCard initialTab="signup" onSuccess={handleSuccess} />
    </div>
  );
}

export default SignupPage;
