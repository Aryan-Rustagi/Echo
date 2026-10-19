import React from "react";
import SaaSLandingPage from "./SaaSLandingPage";
import type { AppView } from "./Navbar";

interface LoginPageProps {
  onNavigate: (view: AppView) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  return <SaaSLandingPage onNavigate={onNavigate} initialAuthMode="signin" />;
};

export default LoginPage;
