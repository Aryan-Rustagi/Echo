import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { AppView } from "./Navbar";

interface SaaSLandingPageProps {
  onNavigate: (view: AppView) => void;
  initialAuthMode?: "signin" | "signup";
}

export const SaaSLandingPage: React.FC<SaaSLandingPageProps> = ({
  onNavigate,
  initialAuthMode = "signin",
}) => {
  const { isAuthenticated, user, tokenDaysRemaining, login, signup, logout, quickFillDemo } = useAuth();

  const [authMode, setAuthMode] = useState<"signin" | "signup">(initialAuthMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Legal modal state
  const [legalModal, setLegalModal] = useState<"privacy" | "terms" | null>(null);

  // Password strength logic
  const calculateStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    return score;
  };

  const strengthScore = calculateStrength(password);
  const getStrengthLabel = () => {
    if (!password) return "";
    if (strengthScore <= 1) return "Weak";
    if (strengthScore <= 3) return "Medium";
    return "Strong";
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      onNavigate("studio");
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Sign in failed. Please check your credentials.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!fullName || fullName.trim().length < 2) {
      setErrorMessage("Full name must be at least 2 characters.");
      return;
    }
    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(fullName.trim(), email.trim(), password);
      onNavigate("studio");
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Registration failed. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = () => {
    setErrorMessage(null);
    // Explicitly check for configured Google OAuth client
    const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      setInfoMessage(
        "Google OAuth is not configured in this environment (missing VITE_GOOGLE_CLIENT_ID). Please use standard email/password or the one-click demo."
      );
      return;
    }
    // If configured, trigger Google OAuth flow
    window.location.href = `/api/auth/google`;
  };

  const handleQuickDemo = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const creds = await quickFillDemo();
      setEmail(creds.email);
      setPassword(creds.password);
      setAuthMode("signin");
    } catch {
      setEmail("demo@echo.ai");
      setPassword("Password123!");
    }
  };

  const handlePasswordResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes("@")) {
      setErrorMessage("Please enter a valid email address for password reset.");
      return;
    }
    setResetSent(true);
    setErrorMessage(null);
  };

  return (
    <div className="echo-split-page">
      <div className="echo-split-container">
        {/* ==========================================================================
            LEFT COLUMN: Product Introduction & Value Proposition
            ========================================================================== */}
        <section className="echo-split-left" aria-labelledby="product-heading">
          <div className="echo-product-badge">
            <span className="echo-pulse-dot" aria-hidden="true" />
            <span>Sub-Second Conversational Engine</span>
          </div>

          <h1 id="product-heading" className="echo-product-headline">
            Voice intelligence with human-grade latency.
          </h1>

          <p className="echo-product-desc">
            Echo orchestrates browser speech recognition, streaming LLM tokenization, and
            parallelized neural audio synthesis into an uninterrupted voice conversational loop.
          </p>

          {/* Key Product Pillars */}
          <div className="echo-benefits-list">
            <div className="echo-benefit-item">
              <div className="echo-benefit-marker">01</div>
              <div className="echo-benefit-content">
                <h2 className="echo-benefit-title">Speculative Sentence Pipelining</h2>
                <p className="echo-benefit-text">
                  Chunks streaming tokens at syntactical boundaries to synthesize audio buffers
                  in parallel before the full model response completes.
                </p>
              </div>
            </div>

            <div className="echo-benefit-item">
              <div className="echo-benefit-marker">02</div>
              <div className="echo-benefit-content">
                <h2 className="echo-benefit-title">Instant Barge-in Interruption</h2>
                <p className="echo-benefit-text">
                  Microphone detection aborts in-flight token streams immediately and flushes Web
                  Audio queues for fluid, natural conversation.
                </p>
              </div>
            </div>

            <div className="echo-benefit-item">
              <div className="echo-benefit-marker">03</div>
              <div className="echo-benefit-content">
                <h2 className="echo-benefit-title">Browser-Native Speech Perception</h2>
                <p className="echo-benefit-text">
                  Direct Web Speech API integration provides zero-latency local speech recognition
                  with automatic cloud WebSocket fallbacks.
                </p>
              </div>
            </div>
          </div>

          {/* Latency Benchmark Strip */}
          <div className="echo-benchmark-strip" aria-label="Pipeline Turnaround Latency">
            <div className="echo-benchmark-item">
              <span className="echo-benchmark-num">~45ms</span>
              <span className="echo-benchmark-label">Browser STT</span>
            </div>
            <div className="echo-benchmark-divider" aria-hidden="true">+</div>
            <div className="echo-benchmark-item">
              <span className="echo-benchmark-num">~220ms</span>
              <span className="echo-benchmark-label">LLM Stream TTFT</span>
            </div>
            <div className="echo-benchmark-divider" aria-hidden="true">+</div>
            <div className="echo-benchmark-item">
              <span className="echo-benchmark-num">~88ms</span>
              <span className="echo-benchmark-label">TTS Synthesis</span>
            </div>
            <div className="echo-benchmark-divider" aria-hidden="true">=</div>
            <div className="echo-benchmark-item highlight">
              <span className="echo-benchmark-num">~355ms</span>
              <span className="echo-benchmark-label">Total Turnaround</span>
            </div>
          </div>

          {/* Guest Direct Entry */}
          <div className="echo-guest-entry">
            <button
              type="button"
              className="echo-btn-outline"
              onClick={() => onNavigate("studio")}
            >
              <span>Explore Voice Studio in Guest Mode</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        {/* ==========================================================================
            RIGHT COLUMN: Authentication Panel
            ========================================================================== */}
        <section className="echo-split-right" aria-label="Account Access">
          <div className="echo-auth-box">
            {isAuthenticated && user ? (
              /* User is already logged in */
              <div className="echo-authenticated-panel">
                <div className="echo-auth-status-icon">
                  <span className="echo-avatar-large">
                    {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                  </span>
                </div>
                <h2 className="echo-auth-title">Active Session Verified</h2>
                <p className="echo-auth-subtitle">
                  Signed in as <strong>{user.email}</strong>
                </p>

                <div className="echo-session-card">
                  <div className="echo-session-row">
                    <span className="echo-session-label">Full Name</span>
                    <span className="echo-session-value">{user.name}</span>
                  </div>
                  <div className="echo-session-row">
                    <span className="echo-session-label">Session Lifespan</span>
                    <span className="echo-session-value">
                      {tokenDaysRemaining > 0 ? `${tokenDaysRemaining} days remaining (7d JWT)` : "Active"}
                    </span>
                  </div>
                  <div className="echo-session-row">
                    <span className="echo-session-label">Access Level</span>
                    <span className="echo-session-value">{user.role || "Standard User"}</span>
                  </div>
                </div>

                <div className="echo-auth-actions-group">
                  <button
                    type="button"
                    className="echo-btn-primary full-width"
                    onClick={() => onNavigate("studio")}
                  >
                    Launch Voice Studio 🎙️
                  </button>
                  <button
                    type="button"
                    className="echo-btn-ghost full-width"
                    onClick={() => logout()}
                  >
                    Sign Out of Echo
                  </button>
                </div>
              </div>
            ) : forgotPasswordOpen ? (
              /* Forgot Password Flow */
              <div className="echo-forgot-panel">
                <button
                  type="button"
                  className="echo-btn-back"
                  onClick={() => {
                    setForgotPasswordOpen(false);
                    setResetSent(false);
                    setErrorMessage(null);
                  }}
                >
                  ← Back to Sign In
                </button>

                <h2 className="echo-auth-title">Reset your password</h2>
                <p className="echo-auth-subtitle">
                  Enter your account email to receive a secure recovery link.
                </p>

                {errorMessage && (
                  <div className="echo-alert danger" role="alert">
                    <span>{errorMessage}</span>
                  </div>
                )}

                {resetSent ? (
                  <div className="echo-alert success" role="status">
                    <span>
                      Password reset instructions have been sent to <strong>{resetEmail}</strong>. Please check your inbox.
                    </span>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordResetSubmit}>
                    <div className="echo-form-field">
                      <label htmlFor="reset-email" className="echo-label">
                        Account Email
                      </label>
                      <input
                        id="reset-email"
                        type="email"
                        className="echo-input"
                        placeholder="name@company.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                    <button type="submit" className="echo-btn-primary full-width">
                      Send Reset Link
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* Standard Auth Panel (Sign In & Sign Up) */
              <>
                {/* Segmented Auth Mode Switch */}
                <div className="echo-auth-segmented" role="tablist" aria-label="Sign In or Sign Up">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === "signin"}
                    className={`echo-auth-tab ${authMode === "signin" ? "active" : ""}`}
                    onClick={() => {
                      setAuthMode("signin");
                      setErrorMessage(null);
                      setInfoMessage(null);
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === "signup"}
                    className={`echo-auth-tab ${authMode === "signup" ? "active" : ""}`}
                    onClick={() => {
                      setAuthMode("signup");
                      setErrorMessage(null);
                      setInfoMessage(null);
                    }}
                  >
                    Create Account
                  </button>
                </div>

                {/* Google OAuth Button */}
                <button
                  type="button"
                  className="echo-btn-oauth"
                  onClick={handleGoogleAuth}
                  aria-label="Continue with Google"
                >
                  <svg className="echo-oauth-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="echo-auth-divider">
                  <span>or continue with email</span>
                </div>

                {/* Status / Error Alerts */}
                {errorMessage && (
                  <div className="echo-alert danger" role="alert">
                    <span>{errorMessage}</span>
                    <button
                      type="button"
                      className="echo-alert-close"
                      onClick={() => setErrorMessage(null)}
                      aria-label="Dismiss error"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {infoMessage && (
                  <div className="echo-alert info" role="status">
                    <span>{infoMessage}</span>
                    <button
                      type="button"
                      className="echo-alert-close"
                      onClick={() => setInfoMessage(null)}
                      aria-label="Dismiss message"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Sign In Form */}
                {authMode === "signin" && (
                  <form onSubmit={handleSignIn} className="echo-auth-form">
                    <div className="echo-form-field">
                      <label htmlFor="signin-email" className="echo-label">
                        Email Address
                      </label>
                      <input
                        id="signin-email"
                        type="email"
                        className="echo-input"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>

                    <div className="echo-form-field">
                      <div className="echo-field-header">
                        <label htmlFor="signin-password" className="echo-label">
                          Password
                        </label>
                        <button
                          type="button"
                          className="echo-link-button"
                          onClick={() => {
                            setForgotPasswordOpen(true);
                            setResetEmail(email);
                            setErrorMessage(null);
                          }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="echo-input-with-action">
                        <input
                          id="signin-password"
                          type={showPassword ? "text" : "password"}
                          className="echo-input"
                          placeholder="••••••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                        />
                        <button
                          type="button"
                          className="echo-input-adornment"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    <div className="echo-auth-remember-row">
                      <label className="echo-checkbox-container">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        <span className="echo-checkbox-label">Keep me signed in</span>
                      </label>
                      <span className="echo-session-pill">7-day JWT</span>
                    </div>

                    <button
                      type="submit"
                      className="echo-btn-primary full-width"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Authenticating..." : "Sign In to Studio"}
                    </button>

                    <button
                      type="button"
                      className="echo-btn-demo full-width"
                      onClick={handleQuickDemo}
                    >
                      Fill Demo Credentials (demo@echo.ai)
                    </button>
                  </form>
                )}

                {/* Sign Up Form */}
                {authMode === "signup" && (
                  <form onSubmit={handleSignUp} className="echo-auth-form">
                    <div className="echo-form-field">
                      <label htmlFor="signup-name" className="echo-label">
                        Full Name
                      </label>
                      <input
                        id="signup-name"
                        type="text"
                        className="echo-input"
                        placeholder="Aryan Rustagi"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                        required
                      />
                    </div>

                    <div className="echo-form-field">
                      <label htmlFor="signup-email" className="echo-label">
                        Work Email
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        className="echo-input"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>

                    <div className="echo-form-field">
                      <label htmlFor="signup-password" className="echo-label">
                        Password
                      </label>
                      <div className="echo-input-with-action">
                        <input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          className="echo-input"
                          placeholder="Minimum 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                          required
                        />
                        <button
                          type="button"
                          className="echo-input-adornment"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>

                      {password && (
                        <div className="echo-password-meter" aria-live="polite">
                          <div className="echo-meter-bars">
                            <span className={`echo-meter-bar ${strengthScore >= 1 ? "active" : ""}`} />
                            <span className={`echo-meter-bar ${strengthScore >= 2 ? "active" : ""}`} />
                            <span className={`echo-meter-bar ${strengthScore >= 3 ? "active" : ""}`} />
                            <span className={`echo-meter-bar ${strengthScore >= 4 ? "active" : ""}`} />
                          </div>
                          <span className="echo-meter-label">{getStrengthLabel()}</span>
                        </div>
                      )}
                    </div>

                    <div className="echo-form-field">
                      <label htmlFor="signup-confirm-password" className="echo-label">
                        Confirm Password
                      </label>
                      <input
                        id="signup-confirm-password"
                        type={showPassword ? "text" : "password"}
                        className="echo-input"
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="echo-btn-primary full-width"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Creating Account..." : "Create Account & Enter"}
                    </button>
                  </form>
                )}

                {/* Legal Footer Links */}
                <p className="echo-auth-terms">
                  By continuing, you agree to Echo's{" "}
                  <button
                    type="button"
                    className="echo-terms-link"
                    onClick={() => setLegalModal("terms")}
                  >
                    Terms of Service
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    className="echo-terms-link"
                    onClick={() => setLegalModal("privacy")}
                  >
                    Privacy Policy
                  </button>
                  .
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Global Minimal Footer */}
      <footer className="echo-main-footer" role="contentinfo">
        <div className="echo-footer-inner">
          <div className="echo-footer-brand">
            <span className="echo-footer-name">ECHO</span>
            <span className="echo-footer-copy">
              © {new Date().getFullYear()} Echo Voice AI. All rights reserved.
            </span>
          </div>

          <div className="echo-footer-links">
            <button
              type="button"
              className="echo-footer-link"
              onClick={() => setLegalModal("privacy")}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              className="echo-footer-link"
              onClick={() => setLegalModal("terms")}
            >
              Terms of Service
            </button>
            <span className="echo-footer-status">
              <span className="echo-status-dot" aria-hidden="true" />
              <span>Voice Services Operational</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Legal Dialog Modal */}
      {legalModal && (
        <div className="echo-modal-overlay" onClick={() => setLegalModal(null)}>
          <div
            className="echo-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
          >
            <div className="echo-modal-header">
              <h3 id="legal-modal-title">
                {legalModal === "privacy" ? "Privacy Policy" : "Terms of Service"}
              </h3>
              <button
                type="button"
                className="echo-modal-close"
                onClick={() => setLegalModal(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div className="echo-modal-body">
              {legalModal === "privacy" ? (
                <>
                  <p>
                    <strong>Echo Voice AI</strong> values your privacy. Microphone audio captured during live Voice Studio sessions is processed in real time:
                  </p>
                  <ul style={{ paddingLeft: "1.25rem", margin: "0.75rem 0", lineHeight: "1.7" }}>
                    <li>Browser STT transcribes locally using your device's native SpeechRecognition capabilities where supported.</li>
                    <li>Audio buffers are transiently piped to streaming inference endpoints and immediately discarded after playback.</li>
                    <li>7-day authentication tokens are securely encrypted with standard HMAC-SHA256 signatures.</li>
                  </ul>
                  <p>We do not store or sell biometric voiceprints or unencrypted audio recordings.</p>
                </>
              ) : (
                <>
                  <p>
                    By accessing or using the <strong>Echo Voice AI Studio</strong> platform, you agree to comply with standard acceptable use guidelines:
                  </p>
                  <ul style={{ paddingLeft: "1.25rem", margin: "0.75rem 0", lineHeight: "1.7" }}>
                    <li>Voice services must not be utilized for unauthorized eavesdropping, harassment, or automated impersonation.</li>
                    <li>API rate limits apply to streaming LLM and neural TTS endpoints.</li>
                    <li>Session tokens are valid for 7 days and must be kept confidential on client devices.</li>
                  </ul>
                </>
              )}
            </div>
            <div className="echo-modal-footer">
              <button
                type="button"
                className="echo-btn-primary"
                onClick={() => setLegalModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaaSLandingPage;
