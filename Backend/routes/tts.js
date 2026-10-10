import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { ElevenLabsClient } from "elevenlabs";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelPath = path.resolve(__dirname, "../voices/en_US-lessac-medium.onnx");

function synthesizeWithPiper(text) {
  return new Promise(function (resolve, reject) {
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
  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });

  const audioStream = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
    text: text,
    modelId: "eleven_flash_v2_5",
  });

  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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
    } catch (_err) {
      return res.status(500).json({ error: "Speech synthesis failed" });
    }
  }

  try {
    const buffer = await synthesizeWithPiper(text);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("X-TTS-Provider", "piper");
    return res.send(buffer);
  } catch (piperErr) {
    console.error("[TTS] Piper failed:", piperErr);
    try {
      const buffer = await synthesizeWithElevenLabs(text);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-TTS-Provider", "elevenlabs");
      return res.send(buffer);
    } catch (_elevenErr) {
      return res.status(500).json({ error: "Speech synthesis failed" });
    }
  }
});

export default router;
