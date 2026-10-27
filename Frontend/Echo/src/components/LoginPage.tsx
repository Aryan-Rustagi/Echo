import React from "react";
import { AuthCard } from "./landing/AuthCard";
import type { AppView } from "./Navbar";

interface LoginPageProps {
  onNavigate: (view: AppView) => void;
}

export function LoginPage({ onNavigate }: LoginPageProps) {
  function handleSuccess() {
    onNavigate("studio");
  }

  return (
    <div className="echo-auth-view landing-root" style={{ minHeight: "calc(100vh - 64px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      <AuthCard initialTab="signin" onSuccess={handleSuccess} />
    </div>
  );
}

export default LoginPage;
