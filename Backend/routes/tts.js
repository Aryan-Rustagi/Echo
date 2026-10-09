const express = require('express');
const router = express.Router();

// TTS endpoint
router.post('/', async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: "No text provided" });
    }

    // Attempt to use ElevenLabs if the API key is configured
    if (process.env.ELEVENLABS_API_KEY) {
      try {
        const voiceId = "pNInz6obpgDQGcFmaJgB"; // Adam voice
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5
            }
          })
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length,
          });
          return res.send(buffer);
        } else {
          console.warn("ElevenLabs API failed, falling back to Edge TTS.", await response.text());
        }
      } catch (err) {
        console.warn("Error calling ElevenLabs, falling back to Edge TTS:", err.message);
      }
    }

    // Fallback: Use Microsoft Edge TTS via their free API endpoint
    const voice = "en-US-AriaNeural";
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
      <voice name='${voice}'>${escapeXml(text)}</voice>
    </speak>`;

    // Edge TTS WebSocket approach - connect to the free endpoint
    const WebSocket = require('ws');
    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${generateUUID()}`;
    
    const audioChunks = [];
    
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Origin": "chrome-extension://jdiccldimpdaibmpdmdrat",
        }
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Edge TTS timed out"));
      }, 15000);

      ws.on('open', () => {
        // Send config message
        ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`);
        
        // Send SSML message
        const requestId = generateUUID();
        ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Binary messages contain the audio data
          // The binary data starts after the header, which ends with "\r\n\r\n"
          const headerEnd = findHeaderEnd(data);
          if (headerEnd !== -1) {
            audioChunks.push(data.slice(headerEnd));
          }
        } else {
          const message = data.toString();
          if (message.includes("Path:turn.end")) {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    if (audioChunks.length === 0) {
      // Fallback: return empty response, frontend will use SpeechSynthesis
      return res.status(204).send();
    }

    const audioBuffer = Buffer.concat(audioChunks);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
    });
    res.send(audioBuffer);

  } catch (error) {
    console.error("TTS Error:", error.message);
    // Return 204 to signal fallback to browser SpeechSynthesis
    res.status(204).send();
  }
});

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateUUID() {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

function findHeaderEnd(buffer) {
  const separator = Buffer.from('\r\n\r\n');
  const idx = buffer.indexOf(separator);
  return idx !== -1 ? idx + separator.length : -1;
}

module.exports = router;
