import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  authApi,
  getStoredToken,
  getStoredUser,
  setStoredSession,
  clearStoredSession,
  inspectTokenLifespan,
  type User,
  type SessionMeta,
} from "../api/client";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionMeta: SessionMeta | null;
  tokenDaysRemaining: number;
  sessionNotice: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  dismissNotice: () => void;
  quickFillDemo: () => Promise<{ email: string; password: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [tokenDaysRemaining, setTokenDaysRemaining] = useState<number>(7);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Validate session on mount
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      const storedToken = getStoredToken();
      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      // 1. Client-side fast check of 7-day token expiration
      const lifespan = inspectTokenLifespan(storedToken);
      if (lifespan.isExpired) {
        clearStoredSession();
        if (isMounted) {
          setUser(null);
          setToken(null);
          setSessionNotice("Your 7-day session token has expired. Please sign in again.");
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setTokenDaysRemaining(lifespan.remainingDays);
      }

      // 2. Validate with backend /api/auth/me using Axios
      try {
        const { user: backendUser, session } = await authApi.getMe();
        if (isMounted) {
          setUser(backendUser);
          setToken(storedToken);
          setSessionMeta(session);
          if (session && typeof session.remainingDays === "number") {
            setTokenDaysRemaining(session.remainingDays);
          }
        }
      } catch (err: any) {
        console.warn("Failed to verify existing session with backend:", err.message);
        // If 401, session was rejected by backend
        if (err.response?.status === 401) {
          clearStoredSession();
          if (isMounted) {
            setUser(null);
            setToken(null);
            setSessionNotice("Session expired or invalid on server. Please sign in.");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await authApi.login({ email, password });
      setUser(data.user);
      setToken(data.token);
      setSessionMeta(data.session);
      setTokenDaysRemaining(data.session?.days || 7);
      setSessionNotice(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await authApi.signup({ name, email, password });
      setUser(data.user);
      setToken(data.token);
      setSessionMeta(data.session);
      setTokenDaysRemaining(data.session?.days || 7);
      setSessionNotice(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setToken(null);
      setSessionMeta(null);
      setTokenDaysRemaining(0);
      setIsLoading(false);
    }
  }, []);

  const dismissNotice = useCallback(() => {
    setSessionNotice(null);
  }, []);

  const quickFillDemo = useCallback(async () => {
    try {
      const creds = await authApi.getDemoCredentials();
      return { email: creds.email, password: creds.password };
    } catch (e) {
      return { email: "demo@echo.ai", password: "Password123!" };
    }
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    isLoading,
    sessionMeta,
    tokenDaysRemaining,
    sessionNotice,
    login,
    signup,
    logout,
    dismissNotice,
    quickFillDemo,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
