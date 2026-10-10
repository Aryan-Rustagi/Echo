import { useState, useEffect } from "react";
import "./App.css";
import LandingPage from "./LandingPage";
import Cover from "./Cover";

function getNormalizedPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  // Support both hash routes (e.g. #/app, #/) and pathname routes (e.g. /app, /)
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "/app" || hash === "app") {
    return "/app";
  }

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  return pathname;
}

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => getNormalizedPath());

  useEffect(() => {
    function handleLocationChange() {
      setCurrentPath(getNormalizedPath());
    }

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, []);

  function navigate(to: string) {
    if (window.location.pathname !== to && window.location.hash !== `#${to}`) {
      window.history.pushState({}, "", to);
      setCurrentPath(to);
      window.scrollTo(0, 0);
    }
  }

  if (currentPath === "/app") {
    return <LandingPage onNavigateToCover={() => navigate("/")} />;
  }

  return <Cover onStart={() => navigate("/app")} />;
}
