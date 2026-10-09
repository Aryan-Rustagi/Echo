const express = require("express");
const router = express.Router();

// Returns an ephemeral Deepgram grant token for client WebSocket connections.
// Calls Deepgram /v1/auth/grant so the master key never leaves the server.
router.get("/deepgram-token", async function handleDeepgramToken(req, res) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Deepgram API key not configured" });
  }

  try {
    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 30 }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Deepgram auth error:", response.status, errorText);
      return res.status(response.status).json({ error: `Deepgram auth failed: ${response.statusText}` });
    }

    const data = await response.json();
    const token = data.access_token || data.token;
    return res.json({ token: token });
  } catch (err) {
    console.error("Deepgram token error:", err);
    return res.status(500).json({ error: "Failed to get Deepgram token" });
  }
});

// Fetches a short-lived Speechmatics JWT using the server-side API key.
async function handleSpeechmaticsToken(req, res) {
  const key = process.env.SPEECHMATICS_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Speechmatics API key not configured" });
  }

  try {
    const response = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 3600 }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Speechmatics auth error:", response.status, errorText);
      let detail = response.statusText || `status ${response.status}`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed && (parsed.detail || parsed.message || parsed.error)) {
          detail = parsed.detail || parsed.message || parsed.error;
        }
      } catch (_jsonErr) {
        if (errorText && errorText.length < 200) {
          detail = errorText;
        }
      }
      return res.status(response.status).json({ error: `Speechmatics auth failed: ${detail}` });
    }

    const data = await response.json();
    return res.json({ jwt: data.key_value });
  } catch (err) {
    console.error("Speechmatics token error:", err);
    return res.status(500).json({ error: "Failed to get Speechmatics token" });
  }
}

router.post("/speechmatics-token", handleSpeechmaticsToken);
router.get("/speechmatics-token", handleSpeechmaticsToken);

module.exports = router;
