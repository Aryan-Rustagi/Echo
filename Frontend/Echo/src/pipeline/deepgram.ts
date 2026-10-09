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
 * Fetch the Deepgram API key from our backend proxy (keeps it out of browser source).
 */
async function getDeepgramKey(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/stt-keys/deepgram-token`);
  if (!res.ok) {
    throw new Error("Failed to get Deepgram token from server");
  }
  const data = await res.json();
  return data.key;
}

export async function startRealtimeTranscription(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (err: Error) => void
): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone API not supported in this browser.");
  }

  const apiKey = await getDeepgramKey();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  // Connect to Deepgram WebSocket
  socket = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', [
    'token',
    apiKey
  ]);

  socket.onmessage = (message) => {
    try {
      const received = JSON.parse(message.data);
      if (received.channel && received.channel.alternatives && received.channel.alternatives.length > 0) {
        const transcript = received.channel.alternatives[0].transcript;
        if (transcript) {
          onTranscript(transcript, received.is_final);
        }
      }
    } catch (e) {
      console.error("Error parsing Deepgram message", e);
    }
  };

  socket.onerror = (error) => {
    console.error("Deepgram WebSocket Error", error);
    onError(new Error("Deepgram connection failed. Please check the API key."));
  };

  socket.onclose = () => {
    console.log("Deepgram WebSocket closed.");
  };

  socket.onopen = () => {
    const mimeType = pickMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && socket?.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };
    
    // Start recording, emit data every 250ms
    mediaRecorder.start(250);
  };
}

export function stopRealtimeTranscription(): void {
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    mediaRecorder = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
}
