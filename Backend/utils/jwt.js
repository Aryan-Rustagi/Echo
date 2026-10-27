require("dotenv").config();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "echo_voice_ai_jwt_secret_token_7days_secure_key_2026";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    "FATAL: JWT_SECRET is missing or shorter than 32 characters. " +
    "Set a strong JWT_SECRET in your .env file."
  );
  process.exit(1);
}

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60; // 604800 seconds

/**
 * Sign a payload with JWT HS256
 * @param {Object} payload 
 * @param {Object} [options]
 * @param {string} [options.expiresIn=7d]
 * @returns {string} JWT Token
 */
function signToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: options.expiresIn || "7d",
    algorithm: "HS256",
  });
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

  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
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
};
