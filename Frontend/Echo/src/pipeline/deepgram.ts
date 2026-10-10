import { API_BASE } from "../config";
import { startMic, type MicController } from "./mic";

export interface TranscriptionController {
  stop(): Promise<void>;
}

/**
 * Fetch the ephemeral Deepgram grant token from our backend proxy.
 */
async function getDeepgramKey(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/stt-keys/deepgram-token`);
  } catch (netErr: unknown) {
    const netMessage = netErr instanceof Error ? netErr.message : String(netErr);
    throw new Error(
      `Cannot connect to backend (${netMessage}). Ensure the backend server is running on port 3000.`
    );
  }

  if (!res.ok) {
    let errMsg = `Backend returned status ${res.status}`;
    try {
      const errData = (await res.json()) as { error?: string };
      if (errData && typeof errData.error === "string") {
        errMsg = errData.error;
      }
    } catch (_parseErr) {
      // ignore JSON parse error
    }
    throw new Error(errMsg);
  }

  const data = (await res.json()) as { token?: string; key?: string };
  const token = data.token || data.key;
  if (!token) {
    throw new Error("No token returned by server");
  }
  return token;
}

export async function startRealtimeTranscription(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (err: Error) => void,
  onEndOfTurn?: () => void,
  onSpeechStarted?: () => void
): Promise<TranscriptionController> {
  const apiKey = await getDeepgramKey();

  let socket: WebSocket | null = null;
  let micController: MicController | null = null;
  let hasOpened = false;
  let isStopped = false;

  async function cleanup(): Promise<void> {
    if (micController) {
      const mc = micController;
      micController = null;
      await mc.stop();
    }
  }

  // Connect to Deepgram WebSocket with raw PCM linear16 and VAD events
  const wsUrl =
    "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=300&utterance_end_ms=1000&vad_events=true&smart_format=true";

  socket = new WebSocket(wsUrl, ["bearer", apiKey]);

  socket.onmessage = function handleMessage(message: MessageEvent) {
    try {
      const received = JSON.parse(message.data as string) as {
        type?: string;
        channel?: {
          alternatives?: Array<{ transcript?: string }>;
        };
        is_final?: boolean;
        speech_final?: boolean;
      };

      // 1. Barge-in detection: user began speaking
      if (received.type === "SpeechStarted") {
        if (onSpeechStarted) {
          onSpeechStarted();
        }
      }

      // 2. Transcripts
      if (
        received.channel &&
        received.channel.alternatives &&
        received.channel.alternatives.length > 0
      ) {
        const transcript = received.channel.alternatives[0].transcript;
        if (transcript) {
          onTranscript(transcript, Boolean(received.is_final));
        }
      }

      // 3. End-of-turn detection
      if (received.speech_final === true || received.type === "UtteranceEnd") {
        if (onEndOfTurn) {
          onEndOfTurn();
        }
      }
    } catch (e: unknown) {
      console.error("Error parsing Deepgram message", e);
    }
  };

  let errorReported = false;
  function reportError(err: Error) {
    if (!errorReported && !isStopped) {
      errorReported = true;
      onError(err);
    }
  }

  socket.onerror = function handleError(error: Event) {
    console.error("Deepgram WebSocket Error", error);
    void cleanup();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    reportError(new Error("Deepgram connection failed. Please check the API key."));
  };

  socket.onclose = function handleClose() {
    console.log("Deepgram WebSocket closed.");
    if (!hasOpened) {
      void cleanup();
    }
  };

  socket.onopen = async function handleOpen() {
    hasOpened = true;
    if (isStopped) {
      void cleanup();
      return;
    }

    try {
      micController = await startMic(function handleChunk(chunk: ArrayBuffer) {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(chunk);
        }
      });
    } catch (micErr: unknown) {
      const errorObj = micErr instanceof Error ? micErr : new Error(String(micErr));
      reportError(errorObj);
    }
  };

  return {
    stop: async function stop(): Promise<void> {
      isStopped = true;
      await cleanup();

      if (socket && socket.readyState === WebSocket.OPEN) {
        const activeSocket = socket;
        await new Promise<void>(function waitForClose(resolve) {
          let resolved = false;
          function finish() {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          }

          const timeoutTimer = setTimeout(function handleTimeout() {
            if (activeSocket.readyState === WebSocket.OPEN) {
              activeSocket.close();
            }
            finish();
          }, 800);

          activeSocket.addEventListener("close", function handleSocketClose() {
            clearTimeout(timeoutTimer);
            finish();
          });

          try {
            activeSocket.send(JSON.stringify({ type: "CloseStream" }));
          } catch (_sendErr) {
            clearTimeout(timeoutTimer);
            activeSocket.close();
            finish();
          }
        });
      } else if (socket) {
        socket.close();
      }
      socket = null;
    },
  };
}
