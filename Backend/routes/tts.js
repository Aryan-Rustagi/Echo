const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

/**
 * Split text at a natural sentence boundary before maxChars
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
function splitAtSentenceBoundary(text, maxChars = 500) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  // Look for sentence terminators (. ! ?) followed by whitespace or end within maxChars
  const sub = trimmed.slice(0, maxChars);
  let lastBoundary = -1;
  for (let i = sub.length - 1; i >= 0; i -= 1) {
    const c = sub[i];
    if (c === "." || c === "!" || c === "?") {
      if (i === sub.length - 1 || /\s/.test(sub[i + 1])) {
        lastBoundary = i + 1;
        break;
      }
    }
  }

  if (lastBoundary > 0) {
    return trimmed.slice(0, lastBoundary).trim();
  }

  // If no punctuation boundary found, check comma or semicolon
  for (let i = sub.length - 1; i >= 0; i -= 1) {
    const c = sub[i];
    if ((c === "," || c === ";") && (i === sub.length - 1 || /\s/.test(sub[i + 1]))) {
      lastBoundary = i + 1;
      break;
    }
  }

  if (lastBoundary > 0) {
    return trimmed.slice(0, lastBoundary).trim();
  }

  // Fallback to last whitespace before maxChars
  const lastSpace = sub.lastIndexOf(" ");
  if (lastSpace > 0) {
    return trimmed.slice(0, lastSpace).trim();
  }

  return sub;
}

async function synthesizeWithElevenLabs(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured in .env");
  }

  // Voice ID: JBFqnCBsd6RMkjVDRZzb (George) or 21m00Tcm4TlvDq8ikWAM (Rachel)
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const controller = new AbortController();
  const timeoutId = setTimeout(function handleTimeout() {
    controller.abort();
  }, 12000);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_flash_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[TTS] ElevenLabs API error:", response.status, errText);
      throw new Error(`ElevenLabs error: ${response.statusText || response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

router.post("/", async function handleTts(req, res) {
  const text = req.body && req.body.text;
  if (!text || typeof text !== "string" || text.trim() === "") {
    return res.status(400).json({ error: "No text provided" });
  }

  // Split long text at a sentence boundary instead of naive slice(0, 500)
  const sanitizedText = splitAtSentenceBoundary(text, 500);

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: "ELEVENLABS_API_KEY is not configured on server" });
  }

  try {
    const buffer = await synthesizeWithElevenLabs(sanitizedText);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-TTS-Provider", "elevenlabs");
    return res.send(buffer);
  } catch (elevenErr) {
    const errMsg = `[TTS] ElevenLabs failed: ${elevenErr.message}\n`;
    console.error(errMsg);
    try {
      fs.appendFileSync(path.resolve(__dirname, "../server_error.log"), `${new Date().toISOString()} ${errMsg}`);
    } catch (_e) {}
    return res.status(500).json({ error: elevenErr.message || "Speech synthesis failed" });
  }
});

module.exports = router;
module.exports.splitAtSentenceBoundary = splitAtSentenceBoundary;
