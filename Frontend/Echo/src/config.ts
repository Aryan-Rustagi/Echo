const envApiBase = import.meta.env.VITE_API_BASE as string | undefined;

export const API_BASE: string =
  typeof envApiBase === "string" && envApiBase.trim().length > 0
    ? envApiBase.trim()
    : (typeof window !== "undefined" && window.location.port === "5173"
        ? "http://localhost:3000"
        : "");

