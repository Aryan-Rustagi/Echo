const API_BASE = "http://localhost:3000";

export let mediaRecorder: MediaRecorder | null = null;
export let socket: WebSocket | null = null;

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/**
 * Fetch a short-lived Speechmatics JWT from our backend proxy.
 */
async function getSpeechmaticsJwt(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/stt-keys/speechmatics-token`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Failed to get Speechmatics token from server");
  }
  const data = await res.json();
  return data.jwt;
}

export async function startSpeechmaticsTranscription(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (err: Error) => void
): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone API not supported in this browser.");
  }

  try {
    // 1. Fetch short-lived JWT from our backend proxy
    const jwt = await getSpeechmaticsJwt();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 2. Connect to Speechmatics WebSocket
    socket = new WebSocket(`wss://eu2.rt.speechmatics.com/v2?jwt=${jwt}`);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.message === "AddPartialTranscript") {
          const text = message.metadata.transcript;
          if (text) onTranscript(text, false);
        } else if (message.message === "AddTranscript") {
          const text = message.metadata.transcript;
          if (text) onTranscript(text, true);
        } else if (message.message === "Error") {
          onError(new Error(`Speechmatics Error: ${message.reason}`));
        }
      } catch (e) {
        console.error("Error parsing Speechmatics message", e);
      }
    };

    socket.onerror = (error) => {
      console.error("Speechmatics WebSocket Error", error);
      onError(new Error("Speechmatics connection failed."));
    };

    socket.onclose = () => {
      console.log("Speechmatics WebSocket closed.");
    };

    socket.onopen = () => {
      // 3. Send StartRecognition message
      socket?.send(
        JSON.stringify({
          message: "StartRecognition",
          audio_format: {
            type: "file",
          },
          transcription_config: {
            language: "en",
            enable_partials: true,
          },
        })
      );

      // 4. Start recording and sending audio
      const mimeType = pickMimeType();
      mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socket?.readyState === WebSocket.OPEN) {
          socket.send(e.data);
        }
      };

      mediaRecorder.start(250);
    };
  } catch (err: any) {
    onError(err);
  }
}

export function stopSpeechmaticsTranscription(): void {
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    mediaRecorder = null;
  }
  if (socket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ message: "EndOfStream", last_seq_no: 0 }));
    }
    socket.close();
    socket = null;
  }
}
