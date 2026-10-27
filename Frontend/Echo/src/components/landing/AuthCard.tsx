import React, { useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";

export interface AuthCardProps {
  initialTab?: "signin" | "signup";
  onSuccess?: () => void;
}

export function AuthCard({ initialTab = "signin", onSuccess }: AuthCardProps) {
  const { login, signup } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const [tab, setTab] = useState<"signin" | "signup">(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  const signinTabRef = useRef<HTMLButtonElement>(null);
  const signupTabRef = useRef<HTMLButtonElement>(null);

  // Google client ID check
  const googleClientId = (
    import.meta as unknown as { env?: { VITE_GOOGLE_CLIENT_ID?: string } }
  ).env?.VITE_GOOGLE_CLIENT_ID;

  function validateEmail(val: string): boolean {
    const atPos = val.indexOf("@");
    if (atPos <= 0) return false;
    const dotPos = val.indexOf(".", atPos + 1);
    return dotPos > atPos + 1 && dotPos < val.length - 1;
  }

  function handleEmailBlur() {
    setEmailTouched(true);
    if (!email) {
      setEmailError("Email address is required.");
    } else if (!validateEmail(email.trim())) {
      setEmailError("Email must contain '@' and a dot after it.");
    } else {
      setEmailError(null);
    }
  }

  function handlePasswordBlur() {
    setPasswordTouched(true);
    if (!password) {
      setPasswordError("Password is required.");
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
    } else {
      setPasswordError(null);
    }
  }

  function handleTabChange(nextTab: "signin" | "signup") {
    setTab(nextTab);
    setErrorMessage(null);
    setInlineNotice(null);
    setEmailError(null);
    setPasswordError(null);
    setEmailTouched(false);
    setPasswordTouched(false);
  }

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      if (tab === "signin") {
        handleTabChange("signup");
        signupTabRef.current?.focus();
      } else {
        handleTabChange("signin");
        signinTabRef.current?.focus();
      }
    }
  }

  function handleGoogleClick() {
    setInlineNotice("Google sign-in is not configured yet.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setInlineNotice(null);

    const isEmailValid = validateEmail(email.trim());
    const isPasswordValid = password.length >= 6;

    setEmailTouched(true);
    setPasswordTouched(true);

    if (!isEmailValid) {
      setEmailError("Email must contain '@' and a dot after it.");
    }
    if (!isPasswordValid) {
      setPasswordError("Password must be at least 6 characters.");
    }

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    setIsLoading(true);

    try {
      if (tab === "signin") {
        await login(email.trim(), password);
      } else {
        await signup(fullName.trim() || "Developer", email.trim(), password);
      }

      // Success animation state
      setIsSuccess(true);
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
      }, 600);
    } catch (err: unknown) {
      const maybeAxios = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };

      let msg =
        maybeAxios.response?.data?.error ||
        maybeAxios.message ||
        "Authentication failed. Please check credentials.";

      if (
        maybeAxios.message === "Network Error" ||
        maybeAxios.message?.includes("fetch") ||
        maybeAxios.message?.includes("Failed to fetch") ||
        !maybeAxios.response
      ) {
        msg = "Can't reach the Echo server. Check your connection and try again.";
      }

      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <motion.div
      className="vp-auth-card-wrap"
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0.01 : 0.6,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div
        className="vp-auth-card"
        id="auth-panel"
        role="region"
        aria-label="Account Authentication"
      >
        {/* 1. Segmented Control */}
        <div
          className="vp-auth-tabs"
          role="tablist"
          aria-label="Authentication mode"
          onKeyDown={handleTabKeyDown}
        >
          <button
            ref={signinTabRef}
            type="button"
            role="tab"
            id="tab-signin"
            aria-selected={tab === "signin"}
            aria-controls="auth-panel"
            tabIndex={tab === "signin" ? 0 : -1}
            onClick={() => handleTabChange("signin")}
            className={`vp-auth-tab ${tab === "signin" ? "active" : ""}`}
          >
            {tab === "signin" && (
              <motion.div
                layoutId="auth-tab-indicator"
                className="vp-tab-indicator"
                transition={{
                  type: "spring",
                  bounce: 0.15,
                  duration: shouldReduceMotion ? 0.01 : 0.4,
                }}
              />
            )}
            <span className="vp-tab-label">Sign in</span>
          </button>

          <button
            ref={signupTabRef}
            type="button"
            role="tab"
            id="tab-signup"
            aria-selected={tab === "signup"}
            aria-controls="auth-panel"
            tabIndex={tab === "signup" ? 0 : -1}
            onClick={() => handleTabChange("signup")}
            className={`vp-auth-tab ${tab === "signup" ? "active" : ""}`}
          >
            {tab === "signup" && (
              <motion.div
                layoutId="auth-tab-indicator"
                className="vp-tab-indicator"
                transition={{
                  type: "spring",
                  bounce: 0.15,
                  duration: shouldReduceMotion ? 0.01 : 0.4,
                }}
              />
            )}
            <span className="vp-tab-label">Create account</span>
          </button>
        </div>

        {/* 2. Heading & Sub-line */}
        <div className="vp-auth-header-block">
          <h2 className="vp-auth-heading">
            {tab === "signin" ? "Sign in to Echo" : "Create your account"}
          </h2>
          <p className="vp-auth-subline">Sessions last 7 days on this device.</p>
        </div>

        {/* 3. Conditional Google Sign-in */}
        {Boolean(googleClientId) && (
          <div className="vp-google-auth-section">
            <button
              type="button"
              onClick={handleGoogleClick}
              className="vp-google-btn"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="vp-google-icon"
              >
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.1 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.8 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.1-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
            <div className="vp-auth-divider" aria-hidden="true">
              <div className="vp-divider-line" />
              <span className="vp-divider-text">OR</span>
              <div className="vp-divider-line" />
            </div>
          </div>
        )}

        {/* 4. Inline Notices & Alerts */}
        {inlineNotice && (
          <div className="vp-auth-alert info" role="status" aria-live="polite">
            <span className="vp-alert-text">{inlineNotice}</span>
          </div>
        )}

        {errorMessage && (
          <div
            className="vp-auth-alert error"
            role="alert"
            aria-live="assertive"
          >
            <span className="vp-alert-text">{errorMessage}</span>
          </div>
        )}

        {/* 5. Input Form */}
        <form onSubmit={handleSubmit} className="vp-auth-form" noValidate>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              className="vp-auth-fields-group"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
            >
              {/* Full Name (Create Account Only) */}
              {tab === "signup" && (
                <div className="vp-form-group">
                  <label htmlFor="auth-fullname" className="vp-form-label">
                    Full name
                  </label>
                  <input
                    id="auth-fullname"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="vp-input"
                  />
                </div>
              )}

              {/* Email */}
              <div className="vp-form-group">
                <label htmlFor="auth-email" className="vp-form-label">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  onBlur={handleEmailBlur}
                  placeholder="you@company.com"
                  className={`vp-input ${emailTouched && emailError ? "input-error" : ""}`}
                  aria-invalid={emailTouched && Boolean(emailError)}
                  aria-describedby={emailError ? "email-error-msg" : undefined}
                />
                {emailTouched && emailError && (
                  <span id="email-error-msg" className="vp-field-error-text">
                    {emailError}
                  </span>
                )}
              </div>

              {/* Password with Show/Hide Toggle */}
              <div className="vp-form-group">
                <label htmlFor="auth-password" className="vp-form-label">
                  Password
                </label>
                <div className="vp-password-wrapper">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      tab === "signin" ? "current-password" : "new-password"
                    }
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    onBlur={handlePasswordBlur}
                    placeholder="••••••••••••"
                    className={`vp-input vp-mono-input ${
                      passwordTouched && passwordError ? "input-error" : ""
                    }`}
                    aria-invalid={passwordTouched && Boolean(passwordError)}
                    aria-describedby={
                      passwordError ? "password-error-msg" : undefined
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="vp-password-toggle-btn"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {passwordTouched && passwordError && (
                  <span id="password-error-msg" className="vp-field-error-text">
                    {passwordError}
                  </span>
                )}
              </div>

              {/* Sign-in only: Remember this device & Demo autofill */}
              {tab === "signin" && (
                <div className="vp-remember-block">
                  <div className="vp-remember-row">
                    <label
                      htmlFor="auth-remember"
                      className="vp-checkbox-label"
                    >
                      <input
                        id="auth-remember"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="vp-checkbox"
                      />
                      <span>Remember this device</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setEmail("demo@echo.ai");
                        setPassword("Password123!");
                        setEmailError(null);
                        setPasswordError(null);
                      }}
                      className="vp-demo-fill-btn"
                    >
                      Fill demo
                    </button>
                  </div>
                  <span className="vp-remember-subtext">7-day session token</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* 6. Primary Submit Button */}
          <motion.button
            type="submit"
            disabled={isLoading || isSuccess}
            className={`vp-btn-submit ${isSuccess ? "success" : ""}`}
            whileTap={shouldReduceMotion || isLoading || isSuccess ? undefined : { scale: 0.99 }}
          >
            {isSuccess ? (
              <span className="vp-submit-success">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M5 13l4 4L19 7"
                    stroke="#FF6B00"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: shouldReduceMotion ? 0.01 : 0.45,
                      ease: "easeOut",
                    }}
                  />
                </svg>
                <span>Authenticated</span>
              </span>
            ) : isLoading ? (
              <span className="vp-submit-loading">
                <svg
                  className="vp-spinner"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" />
                </svg>
                <span>Verifying...</span>
              </span>
            ) : (
              <span className="vp-submit-content">
                <span>
                  {tab === "signin" ? "Continue to studio" : "Create account"}
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </span>
            )}
          </motion.button>
        </form>

        {/* 7. Switch Footer */}
        <div className="vp-auth-switch-footer">
          <span className="vp-switch-text">
            {tab === "signin" ? "New here?" : "Already have an account?"}
          </span>
          <button
            type="button"
            onClick={() =>
              handleTabChange(tab === "signin" ? "signup" : "signin")
            }
            className="vp-switch-link"
          >
            {tab === "signin" ? "Create an account" : "Sign in"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default AuthCard;
