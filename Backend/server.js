require("dotenv").config();
const cors = require("cors");
const express = require("express");

const transcribeRoute = require("./routes/transcribe");
const chatRoute = require("./routes/chat");
const ttsRoute = require("./routes/tts");
const sttKeysRoute = require("./routes/stt-keys");

let rateLimit;
try {
  rateLimit = require("express-rate-limit");
} catch (err) {
  rateLimit = function createFallbackLimiter(options) {
    const windowMs = (options && options.windowMs) || 60000;
    const max = (options && options.limit) || (options && options.max) || 30;
    const hits = new Map();
    return function fallbackRateLimitMiddleware(req, res, next) {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const record = hits.get(ip) || { count: 0, resetAt: now + windowMs };
      if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + windowMs;
      }
      record.count += 1;
      hits.set(ip, record);
      if (record.count > max) {
        return res.status(429).json({ error: "Too many requests, please try again later." });
      }
      return next();
    };
  };
}

const app = express();
const PORT = process.env.PORT || 3000;

// Restrict CORS to allowlist (including http://localhost:5173 and http://127.0.0.1:5173)
const defaultOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(function trimOrigin(origin) {
      return origin.trim();
    })
  : [];
const allowedOrigins = Array.from(new Set(defaultOrigins.concat(envOrigins)));

const corsOptions = {
  origin: function validateOrigin(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
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

// Rate limit: 30 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  max: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

app.get("/", function handleRoot(req, res) {
  res.send("Server is running");
});

app.use("/api/transcribe", transcribeRoute);
app.use("/api/chat", apiLimiter, chatRoute);
app.use("/api/tts", apiLimiter, ttsRoute);
app.use("/api/stt-keys", apiLimiter, sttKeysRoute);

app.listen(PORT, function handleListen() {
  console.log("Server is running on Port:", PORT);
});
