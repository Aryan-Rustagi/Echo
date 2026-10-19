const { verifyToken, getTokenValidityMeta, SEVEN_DAYS_SECONDS } = require("../utils/jwt");
const userStore = require("../data/userStore");

/**
 * Middleware: Authenticate JWT Token
 * Verifies Bearer token, checks 7-day policy, and attaches req.user
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["x-access-token"];
  
  if (!authHeader) {
    return res.status(401).json({
      error: "Authentication required. Missing Authorization header.",
      code: "TOKEN_MISSING",
    });
  }

  // Extract Bearer token
  let token = authHeader;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    return res.status(401).json({
      error: "Malformed Authorization header. Format: Bearer <token>.",
      code: "TOKEN_MALFORMED",
    });
  }

  try {
    const decoded = verifyToken(token);
    const validityMeta = getTokenValidityMeta(decoded);

    // Verify user exists in system
    const user = userStore.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        error: "User associated with this token no longer exists.",
        code: "USER_NOT_FOUND",
      });
    }

    // Attach user and session token metadata
    req.user = userStore.sanitizeUser(user);
    req.tokenPayload = decoded;
    req.tokenMeta = validityMeta;

    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Your 7-day session has expired. Please log in again to continue.",
        code: "TOKEN_EXPIRED",
        expiredAt: err.expiredAt,
      });
    }

    return res.status(401).json({
      error: "Invalid authentication token: " + (err.message || "signature verification failed"),
      code: "TOKEN_INVALID",
    });
  }
}

/**
 * Middleware: Verify that session token follows 7-day validity duration
 */
function verifySevenDaySession(req, res, next) {
  if (!req.tokenPayload || !req.tokenMeta) {
    return res.status(401).json({
      error: "Authentication token metadata unavailable.",
      code: "NO_TOKEN_METADATA",
    });
  }

  const { totalDurationSeconds, isSevenDaysConfigured } = req.tokenMeta;

  // Verify that the token was minted with the 7-day duration rule (604,800 seconds ± tolerance)
  if (!isSevenDaysConfigured && totalDurationSeconds < SEVEN_DAYS_SECONDS - 300) {
    return res.status(403).json({
      error: `Token validity (${Math.round(totalDurationSeconds / 86400)} days) does not meet the 7-day session policy.`,
      code: "INVALID_SESSION_POLICY",
    });
  }

  return next();
}

/**
 * Middleware: Role-based Authorization
 * Usage: authorizeRoles("admin", "developer")
 */
function authorizeRoles(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required before checking permissions.",
        code: "UNAUTHENTICATED",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: role '${req.user.role}' is not authorized to access this resource. Required: ${allowedRoles.join(", ")}`,
        code: "FORBIDDEN",
      });
    }

    return next();
  };
}

/**
 * Middleware: Optional Authentication
 * Attaches req.user if valid token provided; does not reject unauthenticated users
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["x-access-token"];
  if (!authHeader) {
    req.user = null;
    return next();
  }

  let token = authHeader;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyToken(token);
    const user = userStore.findById(decoded.id);
    if (user) {
      req.user = userStore.sanitizeUser(user);
      req.tokenPayload = decoded;
      req.tokenMeta = getTokenValidityMeta(decoded);
    } else {
      req.user = null;
    }
  } catch (err) {
    // Gracefully ignore invalid token for optional auth
    req.user = null;
  }

  return next();
}

module.exports = {
  authenticateToken,
  verifySevenDaySession,
  authorizeRoles,
  optionalAuth,
};
