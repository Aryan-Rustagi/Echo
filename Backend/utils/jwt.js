const crypto = require("crypto");

let jwtLib;
try {
  jwtLib = require("jsonwebtoken");
} catch (e) {
  jwtLib = null;
}

const JWT_SECRET = process.env.JWT_SECRET || "echo_super_secure_jwt_token_secret_key_2026_default";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60; // 604800 seconds

/**
 * Base64URL encode a buffer or string
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Base64URL decode to string
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Sign a payload with JWT HS256
 * @param {Object} payload 
 * @param {Object} [options]
 * @param {number|string} [options.expiresIn=7d]
 * @returns {string} JWT Token
 */
function signToken(payload, options = {}) {
  const expiresInSeconds = options.expiresInSeconds || SEVEN_DAYS_SECONDS;

  if (jwtLib && typeof jwtLib.sign === "function") {
    return jwtLib.sign(payload, JWT_SECRET, {
      expiresIn: options.expiresIn || "7d",
      algorithm: "HS256",
    });
  }

  // RFC 7519 HS256 Native Node.js Implementation
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signatureInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signatureInput}.${signature}`;
}

/**
 * Verify and decode an HS256 JWT token
 * Validates expiration and returns payload or throws an Error
 * @param {string} token 
 * @returns {Object} decoded payload
 */
function verifyToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Token missing or not a string");
  }

  if (jwtLib && typeof jwtLib.verify === "function") {
    return jwtLib.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signatureInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid token signature");
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (err) {
    throw new Error("Malformed token payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now > payload.exp) {
    const expiredError = new Error("Token expired");
    expiredError.name = "TokenExpiredError";
    expiredError.expiredAt = new Date(payload.exp * 1000).toISOString();
    throw expiredError;
  }

  return payload;
}

/**
 * Get remaining validity for a token in seconds and days
 * @param {Object} payload 
 * @returns {{ remainingSeconds: number, remainingDays: number, isSevenDaysConfigured: boolean }}
 */
function getTokenValidityMeta(payload) {
  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = Math.max(0, (payload.exp || now) - now);
  const remainingDays = Math.round((remainingSeconds / 86400) * 10) / 10;
  
  // Total lifespan assigned when created
  const totalDurationSeconds = (payload.exp && payload.iat) ? (payload.exp - payload.iat) : SEVEN_DAYS_SECONDS;
  const isSevenDaysConfigured = Math.abs(totalDurationSeconds - SEVEN_DAYS_SECONDS) < 60; // within 1 minute

  return {
    remainingSeconds,
    remainingDays,
    totalDurationSeconds,
    isSevenDaysConfigured,
    expiresAt: new Date((payload.exp || now) * 1000).toISOString(),
    issuedAt: new Date((payload.iat || now) * 1000).toISOString(),
  };
}

module.exports = {
  signToken,
  verifyToken,
  getTokenValidityMeta,
  SEVEN_DAYS_SECONDS,
  JWT_SECRET,
};
