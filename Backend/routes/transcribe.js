const express = require("express");
const multer = require("multer");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.post("/", upload.single("audio"), async function handleTranscribe(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  console.log(`Received audio file: ${req.file.originalname} (${req.file.size} bytes)`);

  // A webm/ogg file with just a header is around ~1KB. If it's less than 4KB, it's virtually empty/silent.
  if (req.file.size < 4000) {
    console.log("Audio file too small (likely empty). Skipping Whisper to avoid hallucinations.");
    return res.json({ transcript: "" });
  }

  try {
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });

    const isGroq = Boolean(process.env.GROQ_API_KEY);
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    const endpoint = isGroq
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions";
    const model = isGroq ? "whisper-large-v3-turbo" : "whisper-1";

    formData.append("file", blob, req.file.originalname);
    formData.append("model", model);
    formData.append("response_format", "verbose_json");
    formData.append("temperature", "0");

    const apiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("STT API Error:", errorText);
      return res.status(apiResponse.status).json({ error: "Transcription failed at STT API" });
    }

    const data = await apiResponse.json();

    // Drop segments with no_speech_prob > 0.6
    let text = "";
    if (data && Array.isArray(data.segments) && data.segments.length > 0) {
      const validParts = [];
      for (let i = 0; i < data.segments.length; i += 1) {
        const seg = data.segments[i];
        if (!seg) {
          continue;
        }
        if (typeof seg.no_speech_prob === "number" && seg.no_speech_prob > 0.6) {
          console.log(`[Transcribe] Dropped segment with no_speech_prob ${seg.no_speech_prob}: "${seg.text}"`);
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

    console.log("Raw Transcription result:", text);

    // Filter out common Whisper silence hallucinations
    const hallucinations = [
      "Thank you.",
      "Thank you",
      "Thank you for watching.",
      "Thanks for watching.",
      "Thank you for watching!",
      "Thanks.",
      "Thank you!",
    ];
    if (hallucinations.includes(text)) {
      text = "";
      console.log("Filtered out Whisper hallucination.");
    }

    return res.json({ transcript: text });
  } catch (err) {
    console.error("Transcription Server Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
