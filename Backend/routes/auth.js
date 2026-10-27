const express = require("express");
const router = express.Router();
const userStore = require("../data/userStore");
const { signToken, getTokenValidityMeta, SEVEN_DAYS_SECONDS } = require("../utils/jwt");
const { authenticateToken, verifySevenDaySession, authorizeRoles } = require("../middleware/auth");

/**
 * Validate email format
 */
function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * POST /api/auth/signup
 * Register a new user and issue a 7-day JWT session token
 */
router.post("/signup", function handleSignup(req, res) {
  try {
    const { name, email, password } = req.body || {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({
        error: "Full name is required and must be at least 2 characters.",
      });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        error: "A valid email address is required.",
      });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        error: "Password is required and must be at least 6 characters.",
      });
    }

    const existingUser = userStore.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email address already exists. Please sign in instead.",
      });
    }

    const user = userStore.createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: "user",
    });

    // Generate 7-day session token (SEVEN_DAYS_SECONDS = 604,800)
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const safeUser = userStore.sanitizeUser(user);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((now + SEVEN_DAYS_SECONDS) * 1000).toISOString();

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: safeUser,
      session: {
        expiresIn: "7d",
        days: 7,
        totalSeconds: SEVEN_DAYS_SECONDS,
        expiresAt,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({
      error: "Internal server error during registration: " + err.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and issue a 7-day JWT session token
 */
router.post("/login", function handleLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        error: "A valid email address is required.",
      });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({
        error: "Password is required.",
      });
    }

    const user = userStore.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const isMatch = userStore.verifyPassword(user, password);
    if (!isMatch) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    userStore.recordLogin(user.id);

    // Issue 7-day session token
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const safeUser = userStore.sanitizeUser(user);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((now + SEVEN_DAYS_SECONDS) * 1000).toISOString();

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: safeUser,
      session: {
        expiresIn: "7d",
        days: 7,
        totalSeconds: SEVEN_DAYS_SECONDS,
        expiresAt,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      error: "Internal server error during login: " + err.message,
    });
  }
});

/**
 * GET /api/auth/me
 * Protected route: Returns current user profile and session validity information
 */
router.get("/me", authenticateToken, verifySevenDaySession, function handleGetMe(req, res) {
  return res.status(200).json({
    user: req.user,
    session: req.tokenMeta,
  });
});

/**
 * GET /api/auth/verify
 * Protected route: Verifies token validity and remaining 7-day session time
 */
router.get("/verify", authenticateToken, function handleVerify(req, res) {
  return res.status(200).json({
    valid: true,
    user: req.user,
    session: req.tokenMeta,
  });
});

/**
 * POST /api/auth/logout
 * Invalidate client session
 */
router.post("/logout", authenticateToken, function handleLogout(req, res) {
  return res.status(200).json({
    message: "Logged out successfully.",
  });
});

module.exports = router;
