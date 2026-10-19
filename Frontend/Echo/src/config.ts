const envApiBase = import.meta.env.VITE_API_BASE as string | undefined;

export const API_BASE: string =
  typeof envApiBase === "string" && envApiBase.trim().length > 0
    ? envApiBase.trim()
    : typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1") &&
      window.location.port !== "3000"
    ? `http://${window.location.hostname}:3000`
    : "";

