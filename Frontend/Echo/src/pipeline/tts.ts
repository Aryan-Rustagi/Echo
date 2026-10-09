const API_BASE = "http://localhost:3000";

/**
 * Speak text using Edge TTS (via backend) with browser SpeechSynthesis as fallback.
 * Returns a promise that resolves when speech finishes.
 */
export async function speak(text: string): Promise<void> {
  if (!text.trim()) return;

  try {
    console.log("[TTS] Requesting speech from backend for:", text);
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    console.log("[TTS] Backend responded with status:", res.status, res.statusText);

    if (res.ok && res.status !== 204) {
      const audioBlob = await res.blob();
      console.log("[TTS] Received audio blob size:", audioBlob.size, "type:", audioBlob.type);
      if (audioBlob.size > 0) {
        return await playAudioBlob(audioBlob);
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[TTS] Backend error:", res.status, errText);
    }

    // Fallback to browser SpeechSynthesis
    console.warn("[TTS] Falling back to browser SpeechSynthesis");
    return speakWithBrowserTTS(text);
  } catch (err) {
    console.warn("[TTS] Fetch failed, falling back to browser SpeechSynthesis:", err);
    return speakWithBrowserTTS(text);
  }
}

function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.oncanplaythrough = () => {
      console.log("[TTS] Audio ready to play");
    };

    audio.onended = () => {
      console.log("[TTS] Audio playback finished");
      URL.revokeObjectURL(url);
      resolve();
    };

    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      console.warn("[TTS] Audio element error:", e);
      reject(e);
    };

    audio.play().catch((err) => {
      console.error("[TTS] audio.play() was rejected by browser:", err);
      reject(err);
    });
  });
}

function speakWithBrowserTTS(text: string): Promise<void> {
  return new Promise((resolve, _reject) => {
    if (!window.speechSynthesis) {
      console.warn("SpeechSynthesis not available");
      resolve();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.pitch = 1.15; // Set higher pitch for a female tone

    // Try to pick an English female voice
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find((v) =>
      v.lang.startsWith("en") &&
      /zira|female|samantha|victoria|aria|jenny|natural|susan|hazel|karen/i.test(v.name)
    ) || voices.find((v) =>
      v.lang.startsWith("en") && !/david|mark|george|male|guy/i.test(v.name)
    );

    if (femaleVoice) {
      console.log("[TTS] Selected female browser voice:", femaleVoice.name);
      utterance.voice = femaleVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      console.warn("Browser TTS error:", e);
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}
