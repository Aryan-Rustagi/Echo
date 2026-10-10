const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const router = express.Router();
const modelPath = path.resolve(__dirname, "../voices/en_US-lessac-medium.onnx");

function synthesizeWithPiper(text) {
  return new Promise(function (resolve, reject) {
    if (!fs.existsSync(modelPath)) {
      return reject(new Error("Piper voice model file not found"));
    }

    const tempWav = path.join(
      os.tmpdir(),
      `piper_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
    );

    const piper = spawn("piper", [
      "--model",
      modelPath,
      "--output_file",
      tempWav,
    ]);

    let settled = false;

    const timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        piper.kill();
        if (fs.existsSync(tempWav)) {
          try {
            fs.unlinkSync(tempWav);
          } catch (_e) {}
        }
        reject(new Error("Piper synthesis timed out"));
      }
    }, 15000);

    piper.on("error", function (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (fs.existsSync(tempWav)) {
          try {
            fs.unlinkSync(tempWav);
          } catch (_e) {}
        }
        reject(err);
      }
    });

    piper.on("close", function (code) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          try {
            const buffer = fs.readFileSync(tempWav);
            fs.unlinkSync(tempWav);
            resolve(buffer);
          } catch (readErr) {
            reject(readErr);
          }
        } else {
          if (fs.existsSync(tempWav)) {
            try {
              fs.unlinkSync(tempWav);
            } catch (_e) {}
          }
          reject(new Error(`Piper exited with code ${code}`));
        }
      }
    });

    piper.stdin.write(text);
    piper.stdin.end();
  });
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
  }, 8000);

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

router.post("/", async function (req, res) {
  const text = req.body && req.body.text;
  if (!text || typeof text !== "string" || text.trim() === "") {
    return res.status(400).json({ error: "No text provided" });
  }

  const provider = req.body && req.body.provider;

  if (provider === "elevenlabs") {
    try {
      const buffer = await synthesizeWithElevenLabs(text);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-TTS-Provider", "elevenlabs");
      return res.send(buffer);
    } catch (elevenErr) {
      console.error("[TTS] ElevenLabs failed:", elevenErr.message);
      return res.status(500).json({ error: "Speech synthesis failed" });
    }
  }

  try {
    const buffer = await synthesizeWithPiper(text);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("X-TTS-Provider", "piper");
    return res.send(buffer);
  } catch (piperErr) {
    try {
      const buffer = await synthesizeWithElevenLabs(text);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-TTS-Provider", "elevenlabs");
      return res.send(buffer);
    } catch (elevenErr) {
      console.error("[TTS] Piper and ElevenLabs both failed:", elevenErr.message);
      return res.status(500).json({ error: "Speech synthesis failed" });
    }
  }
});

module.exports = router;
