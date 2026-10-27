const express = require("express");
const multer = require("multer");
const localWhisper = require("../services/localWhisper");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const KNOWN_HALLUCINATIONS = new Set([
  "thank you",
  "thanks",
  "thank you for watching",
  "thanks for watching",
  "thank you very much",
  "bye",
  "goodbye",
  "subtitles by",
  "subscribed",
  "like and subscribe",
  "you",
]);

function normalizePhrase(str) {
  if (typeof str !== "string") return "";
  return str.toLowerCase().replace(/[.,!?;:\"'-]/g, "").trim();
}

function isWhisperHallucination(text, duration, avgNoSpeechProb) {
  if (!text || typeof text !== "string") {
    return false;
  }

  const isShortClip = typeof duration === "number" && duration < 1.5;
  const isHighNoSpeech = typeof avgNoSpeechProb === "number" && avgNoSpeechProb > 0.45;

  // Only apply when the clip is under ~1.5s or avg no_speech_prob is high
  if (!isShortClip && !isHighNoSpeech) {
    return false;
  }

  const normalized = normalizePhrase(text);
  return KNOWN_HALLUCINATIONS.has(normalized);
}

// 1. Status endpoint for STT capabilities
router.get("/status", function handleSttStatus(req, res) {
  const localStatus = localWhisper.getStatus();
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);

  res.json({
    localWhisper: localStatus,
    cloudWhisper: {
      groq: hasGroq,
      openai: hasOpenAi,
    },
    preferredEngine: localStatus.available ? "whisper.cpp" : (hasGroq || hasOpenAi ? "cloud" : "browser"),
  });
});

// Self-test diagnostic endpoint for STT verification
router.get("/self-test", async function handleSttSelfTest(req, res) {
  const localStatus = localWhisper.getStatus();
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);

  // 1. Synthesize 1s of 16kHz mono linear PCM WAV
  const sampleRate = 16000;
  const durationSeconds = 1;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2;
  const testWav = Buffer.alloc(44 + dataSize);

  testWav.write("RIFF", 0);
  testWav.writeUInt32LE(36 + dataSize, 4);
  testWav.write("WAVE", 8);
  testWav.write("fmt ", 12);
  testWav.writeUInt32LE(16, 16);
  testWav.writeUInt16LE(1, 20); // PCM
  testWav.writeUInt16LE(1, 22); // mono
  testWav.writeUInt32LE(sampleRate, 24);
  testWav.writeUInt32LE(sampleRate * 2, 28);
  testWav.writeUInt16LE(2, 32);
  testWav.writeUInt16LE(16, 34);
  testWav.write("data", 36);
  testWav.writeUInt32LE(dataSize, 40);

  // 2. Validate header format
  const isRiffValid = testWav.toString("utf8", 0, 4) === "RIFF";
  const isWaveValid = testWav.toString("utf8", 8, 12) === "WAVE";
  const readSampleRate = testWav.readUInt32LE(24);

  // 3. Test local whisper if available
  let localExecution = null;
  if (localStatus.available) {
    try {
      const startTime = Date.now();
      const localRes = await localWhisper.transcribeWav(testWav);
      localExecution = {
        success: true,
        durationMs: localRes.durationMs || (Date.now() - startTime),
        transcript: localRes.transcript,
      };
    } catch (testErr) {
      localExecution = {
        success: false,
        error: testErr.message,
      };
    }
  }

  // 4. Hallucination filter tests
  const testPhraseNorm = normalizePhrase("  Thanks.  ") === "thanks";
  const testHallucination = isWhisperHallucination("Thank you.", 1.2, 0.1) === true;
  const testNonHallucination = isWhisperHallucination("What is your name?", 1.5, 0.05) === false;

  res.json({
    status: "ok",
    wavFormat: {
      validRiff: isRiffValid && isWaveValid,
      sampleRate: readSampleRate,
      byteLength: testWav.length,
    },
    filters: {
      passed: testPhraseNorm && testHallucination && testNonHallucination,
    },
    localWhisper: {
      ...localStatus,
      execution: localExecution,
    },
    cloudWhisper: {
      groq: hasGroq,
      openai: hasOpenAi,
    },
    activePipelineMode: localStatus.available
      ? "Dual-Path Hybrid: Browser Interim + Local whisper.cpp"
      : (hasGroq || hasOpenAi ? "Dual-Path Hybrid: Browser Interim + Cloud Whisper" : "Dual-Path Hybrid: Browser Interim + Web Speech Fallback"),
  });
});

// Setup trigger endpoint for whisper.cpp model and binary
let isSetupRunning = false;
let setupProgress = { status: "idle", step: "", error: null };

router.all("/setup-whisper", function handleSetupWhisper(req, res) {
  if (isSetupRunning) {
    return res.json({ message: "Whisper setup is already in progress.", progress: setupProgress });
  }

  isSetupRunning = true;
  setupProgress = { status: "running", step: "Starting download of model and binary...", error: null };

  delete require.cache[require.resolve("../scripts/setup-whisper")];
  const { runSetup } = require("../scripts/setup-whisper");
  runSetup()
    .then((result) => {
      isSetupRunning = false;
      setupProgress = { status: "completed", result, localWhisper: localWhisper.getStatus() };
      console.log("[Whisper Setup] Completed successfully:", result);
    })
    .catch((err) => {
      isSetupRunning = false;
      setupProgress = { status: "failed", error: err.message };
      console.error("[Whisper Setup] Failed:", err.message);
    });

  res.json({
    message: "Whisper setup started in background.",
    progress: setupProgress,
  });
});

router.get("/setup-whisper/status", function handleSetupStatus(req, res) {
  res.json({
    isSetupRunning,
    progress: setupProgress,
    localWhisper: localWhisper.getStatus(),
  });
});

// 2. Transcription handler with auto-routing & cascade fallback
router.post("/", upload.single("audio"), async function handleTranscribe(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  const requestedEngine = req.body && req.body.engine ? req.body.engine : "auto";
  const fileSize = req.file.size;
  console.log(`[Transcribe] Received audio (${fileSize} bytes, mime: ${req.file.mimetype}, engine: ${requestedEngine})`);

  // An empty audio file with just a header is ~44-800 bytes.
  if (fileSize < 1200) {
    console.log("[Transcribe] Audio file too small (header only). Skipping STT to avoid hallucinations.");
    return res.json({ transcript: "", engine: "skipped_empty" });
  }

  const hasCloudKey = Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
  const isLocalAvailable = localWhisper.isAvailable();

  // Route 1: Local whisper.cpp (if explicitly requested OR if available on auto)
  if (requestedEngine === "local" || (requestedEngine === "auto" && isLocalAvailable)) {
    if (isLocalAvailable) {
      try {
        const result = await localWhisper.transcribeWav(req.file.buffer);
        console.log(`[Transcribe] local whisper.cpp resolved in ${result.durationMs}ms: "${result.transcript}"`);
        return res.json({
          transcript: result.transcript,
          engine: "whisper.cpp",
          durationMs: result.durationMs,
        });
      } catch (localErr) {
        console.warn("[Transcribe] Local whisper.cpp failed:", localErr.message);
        if (requestedEngine === "local" && !hasCloudKey) {
          return res.json({ transcript: "", engine: "browser_fallback", error: localErr.message });
        }
      }
    } else if (requestedEngine === "local") {
      console.warn("[Transcribe] Local whisper requested but binary/model not installed.");
      if (!hasCloudKey) {
        return res.status(503).json({
          error: "Local whisper.cpp binary or model not installed. Call POST /api/transcribe/setup-whisper or run 'npm run setup:whisper'.",
          engine: "whisper.cpp",
        });
      }
    }
  }

  // Route 2: Cloud Whisper (Groq / OpenAI)
  if (hasCloudKey) {
    try {
      const isGroq = Boolean(process.env.GROQ_API_KEY);
      const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/wav" });

      const endpoint = isGroq
        ? "https://api.groq.com/openai/v1/audio/transcriptions"
        : "https://api.openai.com/v1/audio/transcriptions";
      const model = isGroq ? "whisper-large-v3-turbo" : "whisper-1";

      const ext = req.file.originalname?.endsWith(".wav") ? "wav" : "webm";
      formData.append("file", blob, `audio.${ext}`);
      formData.append("model", model);
      formData.append("response_format", "verbose_json");
      formData.append("temperature", "0");

      const startTime = Date.now();
      const apiResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (apiResponse.ok) {
        const data = await apiResponse.json();
        const durationMs = Date.now() - startTime;

        let text = "";
        let totalNoSpeech = 0;
        let segmentCount = 0;

        if (data && Array.isArray(data.segments) && data.segments.length > 0) {
          const validParts = [];
          for (let i = 0; i < data.segments.length; i += 1) {
            const seg = data.segments[i];
            if (!seg) continue;
            if (typeof seg.no_speech_prob === "number") {
              totalNoSpeech += seg.no_speech_prob;
              segmentCount += 1;
            }
            if (typeof seg.no_speech_prob === "number" && seg.no_speech_prob > 0.6) {
              continue;
            }
            if (typeof seg.text === "string" && seg.text.trim()) {
              validParts.push(seg.text.trim());
            }
          }
          text = validParts.join(" ").trim();
        } else if (data && typeof data.text === "string") {
          text = data.text.trim();
        }

        const duration = typeof data.duration === "number"
          ? data.duration
          : (data.segments && data.segments.length > 0 ? data.segments[data.segments.length - 1].end : null);
        const avgNoSpeechProb = segmentCount > 0 ? totalNoSpeech / segmentCount : null;

        if (isWhisperHallucination(text, duration, avgNoSpeechProb)) {
          text = "";
        }

        return res.json({
          transcript: text,
          engine: isGroq ? "groq" : "openai",
          durationMs,
        });
      } else {
        const errText = await apiResponse.text();
        console.warn(`[Transcribe] Cloud API HTTP ${apiResponse.status}: ${errText.slice(0, 200)}`);
      }
    } catch (cloudErr) {
      console.warn("[Transcribe] Cloud STT error:", cloudErr.message);
    }
  }

  // Route 3: Cascade to local whisper if cloud failed
  if (isLocalAvailable) {
    try {
      const result = await localWhisper.transcribeWav(req.file.buffer);
      console.log(`[Transcribe] Cascade to whisper.cpp succeeded in ${result.durationMs}ms: "${result.transcript}"`);
      return res.json({
        transcript: result.transcript,
        engine: "whisper.cpp",
        durationMs: result.durationMs,
      });
    } catch (localErr) {
      console.warn("[Transcribe] Local cascade also failed:", localErr.message);
    }
  }

  // Graceful browser fallback: client will use accumulated browser text
  return res.json({
    transcript: "",
    engine: "browser_fallback",
  });
});

module.exports = router;
module.exports.normalizePhrase = normalizePhrase;
module.exports.isWhisperHallucination = isWhisperHallucination;
module.exports.KNOWN_HALLUCINATIONS = KNOWN_HALLUCINATIONS;
