export async function speak(
  text: string,
  provider?: "piper" | "elevenlabs"
): Promise<void> {
  const payload: { text: string; provider?: string } = { text };
  if (provider) {
    payload.provider = provider;
  }

  const res = await fetch("http://localhost:3001/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Speech synthesis failed");
  }

  const providerHeader = res.headers.get("X-TTS-Provider");
  console.log("TTS provider:", providerHeader);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Audio playback failed"));
    };

    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      reject(err);
    });
  });
}
