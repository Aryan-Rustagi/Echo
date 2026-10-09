const API_BASE = "http://localhost:3000";

/**
 * Speak text using Edge TTS (via backend) with browser SpeechSynthesis as fallback.
 * Returns a promise that resolves when speech finishes.
 */
export async function speak(text: string): Promise<void> {
  if (!text.trim()) return;

  try {
    // Try Edge TTS through the backend
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (res.ok && res.status !== 204) {
      const audioBlob = await res.blob();
      if (audioBlob.size > 0) {
        return playAudioBlob(audioBlob);
      }
    }

    // Fallback to browser SpeechSynthesis
    return speakWithBrowserTTS(text);
  } catch (err) {
    console.warn("Edge TTS failed, falling back to browser SpeechSynthesis:", err);
    return speakWithBrowserTTS(text);
  }
}

function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };

    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      console.warn("Audio playback failed, falling back to browser TTS");
      reject(e);
    };

    audio.play().catch(reject);
  });
}

function speakWithBrowserTTS(text: string): Promise<void> {
  return new Promise((resolve, _reject) => {
    if (!window.speechSynthesis) {
      console.warn("SpeechSynthesis not available");
      resolve(); // Graceful degradation: just show text
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      console.warn("Browser TTS error:", e);
      resolve(); // Don't reject — showing text is acceptable fallback (EC-6)
    };

    window.speechSynthesis.speak(utterance);
  });
}
