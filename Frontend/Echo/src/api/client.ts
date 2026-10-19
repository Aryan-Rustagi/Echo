import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { API_BASE } from "../config";

const TOKEN_STORAGE_KEY = "echo_jwt_token";
const USER_STORAGE_KEY = "echo_jwt_user";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface SessionMeta {
  expiresIn: string;
  days: number;
  totalSeconds: number;
  expiresAt: string;
  remainingDays?: number;
  remainingSeconds?: number;
  isSevenDaysConfigured?: boolean;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
  session: SessionMeta;
}

export interface VerifyResponse {
  valid: boolean;
  user: User;
  session: SessionMeta;
}

// Create configured Axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Request interceptor: attach Authorization Bearer token
apiClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401s and token expiration gracefully
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const errCode = error.response.data?.code;
      if (errCode === "TOKEN_EXPIRED" || errCode === "TOKEN_INVALID") {
        console.warn("Echo Auth: 7-day session token expired or invalid, clearing local session.");
        clearStoredSession();
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Read stored JWT token
 */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * Read stored user data
 */
export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Persist JWT token and user profile
 */
export function setStoredSession(token: string, user: User): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error("Failed to write session to localStorage:", e);
  }
}

/**
 * Clear stored credentials
 */
export function clearStoredSession(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Safely parse JWT payload client-side to verify expiration without network round-trip
 */
export function parseJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonString = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonString);
  } catch (e) {
    return null;
  }
}

/**
 * Inspect 7-day session remaining days and check if expired
 */
export function inspectTokenLifespan(token: string): {
  isExpired: boolean;
  remainingDays: number;
  totalDays: number;
  expiresAt: Date | null;
} {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) {
    return { isExpired: true, remainingDays: 0, totalDays: 0, expiresAt: null };
  }

  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= payload.exp;
  const remainingSeconds = Math.max(0, payload.exp - now);
  const remainingDays = Math.round((remainingSeconds / 86400) * 10) / 10;
  const totalDays = payload.iat ? Math.round(((payload.exp - payload.iat) / 86400) * 10) / 10 : 7;
  const expiresAt = new Date(payload.exp * 1000);

  return { isExpired, remainingDays, totalDays, expiresAt };
}

/**
 * Auth API service using Axios
 */
export const authApi = {
  /**
   * Log in user
   */
  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/auth/login", credentials);
    if (res.data && res.data.token && res.data.user) {
      setStoredSession(res.data.token, res.data.user);
    }
    return res.data;
  },

  /**
   * Sign up new user
   */
  async signup(data: { name: string; email: string; password: string }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/auth/signup", data);
    if (res.data && res.data.token && res.data.user) {
      setStoredSession(res.data.token, res.data.user);
    }
    return res.data;
  },

  /**
   * Fetch current user profile & 7-day session meta
   */
  async getMe(): Promise<{ user: User; session: SessionMeta }> {
    const res = await apiClient.get<{ user: User; session: SessionMeta }>("/api/auth/me");
    return res.data;
  },

  /**
   * Verify session token validity
   */
  async verifySession(): Promise<VerifyResponse> {
    const res = await apiClient.get<VerifyResponse>("/api/auth/verify");
    return res.data;
  },

  /**
   * Log out
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post("/api/auth/logout");
    } catch (e) {
      // Ignore network errors on logout
    } finally {
      clearStoredSession();
    }
  },

  /**
   * Fetch pre-configured demo credentials
   */
  async getDemoCredentials(): Promise<{ email: string; password: string; name: string }> {
    const res = await apiClient.get<{ email: string; password: string; name: string }>(
      "/api/auth/demo-credentials"
    );
    return res.data;
  },
};
