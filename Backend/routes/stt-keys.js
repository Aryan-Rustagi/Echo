const express = require('express');
const router = express.Router();

// Returns a temporary Deepgram API key for WebSocket connections.
// This keeps the real key server-side (NFR-6).
router.get('/deepgram-token', (req, res) => {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Deepgram API key not configured" });
  }
  res.json({ key });
});

// Fetches a short-lived Speechmatics JWT using the server-side API key.
router.post('/speechmatics-token', async (req, res) => {
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
      console.error("Speechmatics auth error:", errorText);
      return res.status(response.status).json({ error: `Speechmatics auth failed: ${response.statusText}` });
    }

    const data = await response.json();
    res.json({ jwt: data.key_value });
  } catch (err) {
    console.error("Speechmatics token error:", err);
    res.status(500).json({ error: "Failed to get Speechmatics token" });
  }
});

module.exports = router;
