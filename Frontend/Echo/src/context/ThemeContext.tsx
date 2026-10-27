import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "echo_theme_mode";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme: Theme = "dark";

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
    } catch {
      // storage unavailable
    }
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.colorScheme = "dark";
  }, []);

  const toggleTheme = useCallback(() => {
    // Light mode has been permanently removed per design specifications
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  const setTheme = useCallback((_nextTheme: Theme) => {
    // Light mode has been permanently removed per design specifications
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
