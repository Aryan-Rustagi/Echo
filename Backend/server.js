// Echo Hybrid STT & Voice Pipeline v2.5
require("dotenv").config();
const cors = require("cors");
const express = require("express");

const transcribeRoute = require("./routes/transcribe");
const chatRoute = require("./routes/chat");
const ttsRoute = require("./routes/tts");
const sttKeysRoute = require("./routes/stt-keys");
const authRoute = require("./routes/auth");
const { authenticateToken, optionalAuth } = require("./middleware/auth");
const localWhisper = require("./services/localWhisper");
let rateLimitModule;
try {
  rateLimitModule = require("express-rate-limit");
} catch (_e) {
  rateLimitModule = null;
}

function createLimiter(options) {
  if (rateLimitModule) {
    return rateLimitModule(options);
  }

  // Resilient in-memory fallback rate limiter when express-rate-limit package is not installed
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.limit || options.max || 30;
  const message = options.message || { error: "Too many requests, please try again later." };
  const requests = new Map();

  const cleanupTimer = setInterval(function cleanup() {
    const now = Date.now();
    for (const [ip, data] of requests.entries()) {
      if (now - data.startTime > windowMs) {
        requests.delete(ip);
      }
    }
  }, windowMs);
  if (cleanupTimer.unref) cleanupTimer.unref();

  return function fallbackLimiter(req, res, next) {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const now = Date.now();
    const entry = requests.get(ip);

    if (!entry || now - entry.startTime > windowMs) {
      requests.set(ip, { count: 1, startTime: now });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json(message);
    }
    return next();
  };
}

const neon = require("./db/neon");
const userStore = require("./data/userStore");

const app = express();
const PORT = process.env.PORT || 3000;

// Restrict CORS to allowlist (including http://localhost:5173 and http://127.0.0.1:5173)
const path = require("path");
const fs = require("fs");

const defaultOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(function trimOrigin(origin) {
      return origin.trim();
    })
  : [];
const allowedOrigins = Array.from(new Set(defaultOrigins.concat(envOrigins)));

const corsOptions = {
  origin: function validateOrigin(origin, callback) {
    if (
      !origin ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      allowedOrigins.indexOf(origin) !== -1 ||
      allowedOrigins.indexOf("*") !== -1 ||
      origin.endsWith(".up.railway.app") ||
      origin.endsWith(".railway.app")
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

// 1. CORS registered first before express-rate-limit, body parsing, and all routes
app.use(cors(corsOptions));

// 2. Body parser with 50kb payload limit
app.use(express.json({ limit: "50kb" }));

// Rate limit: 30 requests per minute per IP (general API)
const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  max: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Rate limit: 10 requests per minute for auth endpoints (brute-force protection)
const authLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  max: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

// Rate limit: 150 requests per minute for TTS to support rapid sentence-by-sentence streaming
const ttsLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 150,
  max: 150,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many speech synthesis requests, please slow down." },
});

// Health check endpoint for Railway, Docker, and uptime monitoring
app.get("/api/health", function handleHealth(req, res) {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    configured: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
      deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
      speechmatics: Boolean(process.env.SPEECHMATICS_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      localWhisper: localWhisper.isAvailable(),
      neonPostgres: neon.isAvailable(),
      jwtAuth: true,
      sessionTokenDuration: "7d",
    },
  });
});

// Database connectivity check endpoint
app.get("/api/db/status", async function handleDbStatus(req, res) {
  if (!neon.isAvailable()) {
    return res.status(200).json({
      connected: false,
      configured: false,
      message: "DATABASE_URL not configured. Operating in local JSON cache mode.",
    });
  }

  const status = await neon.testConnection();
  return res.status(status.connected ? 200 : 503).json(status);
});

// API Routes
app.use("/api/auth", authLimiter, authRoute);
app.use("/api/transcribe", apiLimiter, optionalAuth, transcribeRoute);
app.use("/api/chat", apiLimiter, optionalAuth, chatRoute);
app.use("/api/tts", ttsLimiter, optionalAuth, ttsRoute);
app.use("/api/stt-keys", apiLimiter, optionalAuth, sttKeysRoute);

// Dedicated 404 handler for unmatched API routes
app.use("/api", function handleApiNotFound(req, res) {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Serve frontend static assets and handle SPA routing in production
const publicBuildDir = path.resolve(__dirname, "public");
const frontendDistDir = path.resolve(__dirname, "../Frontend/Echo/dist");
const staticDir = fs.existsSync(publicBuildDir)
  ? publicBuildDir
  : (fs.existsSync(frontendDistDir) ? frontendDistDir : null);

if (staticDir) {
  app.use(express.static(staticDir));
  app.use(function handleSpaFallback(req, res, next) {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  app.get("/", function handleRoot(req, res) {
    res.send("Server is running");
  });
}

function logStartupConfig() {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const deepgramConfigured = Boolean(process.env.DEEPGRAM_API_KEY);
  const speechmaticsConfigured = Boolean(process.env.SPEECHMATICS_API_KEY);
  const elevenlabsConfigured = Boolean(process.env.ELEVENLABS_API_KEY);
  const localWhisperConfigured = localWhisper.isAvailable();
  const neonConfigured = neon.isAvailable();

  console.log("------------------------------------------");
  console.log("Echo Voice Pipeline — Configured Providers:");
  console.log(`  - Local Whisper (STT): ${localWhisperConfigured ? "CONFIGURED (whisper.cpp AVX2)" : "NOT CONFIGURED (Run npm run setup:whisper)"}`);
  console.log(`  - Neon (PostgreSQL):  ${neonConfigured ? "CONFIGURED (Neon Cloud Serverless)" : "NOT CONFIGURED (JSON fallback)"}`);
  console.log(`  - Gemini (LLM):       ${geminiConfigured ? "CONFIGURED (" + (process.env.GEMINI_MODEL || "gemini-flash-latest") + ")" : "NOT CONFIGURED"}`);
  console.log(`  - Groq (LLM/Whisper): ${groqConfigured ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`  - OpenAI (LLM):       ${openaiConfigured ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`  - Deepgram (STT):     ${deepgramConfigured ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`  - Speechmatics (STT): ${speechmaticsConfigured ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`  - ElevenLabs (TTS):   ${elevenlabsConfigured ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log("------------------------------------------");
}

app.listen(PORT, async function handleListen() {
  console.log("Server is running on Port:", PORT);
  logStartupConfig();

  if (neon.isAvailable()) {
    const initialized = await neon.initDb();
    if (initialized) {
      await userStore.syncWithNeon();
    }
  }
});
