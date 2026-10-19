import React from "react";
import SaaSLandingPage from "./SaaSLandingPage";
import type { AppView } from "./Navbar";

interface SignupPageProps {
  onNavigate: (view: AppView) => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onNavigate }) => {
  return <SaaSLandingPage onNavigate={onNavigate} initialAuthMode="signup" />;
};

export default SignupPage;
