import { API_BASE } from "../config";
import { startMic, type MicController } from "./mic";

export interface TranscriptionController {
  stop(): Promise<void>;
}

/**
 * Fetch a short-lived Speechmatics JWT from our backend proxy.
 */
async function getSpeechmaticsJwt(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/stt-keys/speechmatics-token`, {
      method: "POST",
    });
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

  const data = (await res.json()) as { jwt?: string };
  if (!data.jwt) {
    throw new Error("No JWT returned by server");
  }
  return data.jwt;
}

export async function startSpeechmaticsTranscription(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (err: Error) => void
): Promise<TranscriptionController> {
  const jwt = await getSpeechmaticsJwt();

  let socket: WebSocket | null = null;
  let micController: MicController | null = null;
  let hasOpened = false;
  let isStopped = false;
  let audioChunksCount = 0;
  let endOfTranscriptResolver: (() => void) | null = null;

  async function cleanup(): Promise<void> {
    if (micController) {
      const mc = micController;
      micController = null;
      await mc.stop();
    }
  }

  socket = new WebSocket(`wss://eu2.rt.speechmatics.com/v2?jwt=${jwt}`);

  let errorReported = false;
  function reportError(err: Error) {
    if (!errorReported && !isStopped) {
      errorReported = true;
      onError(err);
    }
  }

  socket.onmessage = async function handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data as string) as {
        message?: string;
        metadata?: { transcript?: string };
        reason?: string;
      };

      if (message.message === "RecognitionStarted") {
        if (isStopped) {
          void cleanup();
          return;
        }

        try {
          micController = await startMic(function handleChunk(chunk: ArrayBuffer) {
            if (socket && socket.readyState === WebSocket.OPEN) {
              audioChunksCount += 1;
              socket.send(chunk);
            }
          });
        } catch (micErr: unknown) {
          const errorObj = micErr instanceof Error ? micErr : new Error(String(micErr));
          reportError(errorObj);
        }
      } else if (message.message === "AddPartialTranscript") {
        const text = message.metadata?.transcript;
        if (text) {
          onTranscript(text, false);
        }
      } else if (message.message === "AddTranscript") {
        const text = message.metadata?.transcript;
        if (text) {
          onTranscript(text, true);
        }
      } else if (message.message === "EndOfTranscript") {
        if (endOfTranscriptResolver) {
          endOfTranscriptResolver();
          endOfTranscriptResolver = null;
        }
      } else if (message.message === "Error") {
        void cleanup();
        reportError(new Error(`Speechmatics Error: ${message.reason ?? "Unknown error"}`));
      }
    } catch (e: unknown) {
      console.error("Error parsing Speechmatics message", e);
    }
  };

  socket.onerror = function handleError(error: Event) {
    console.error("Speechmatics WebSocket Error", error);
    void cleanup();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    reportError(new Error("Speechmatics connection failed."));
  };

  socket.onclose = function handleClose() {
    console.log("Speechmatics WebSocket closed.");
    if (!hasOpened) {
      void cleanup();
    }
  };

  socket.onopen = function handleOpen() {
    hasOpened = true;
    if (isStopped) {
      void cleanup();
      return;
    }

    // Send StartRecognition with raw pcm_s16le 16000Hz format
    socket?.send(
      JSON.stringify({
        message: "StartRecognition",
        audio_format: {
          type: "raw",
          encoding: "pcm_s16le",
          sample_rate: 16000,
        },
        transcription_config: {
          language: "en",
          enable_partials: true,
        },
      })
    );
  };

  return {
    stop: async function stop(): Promise<void> {
      isStopped = true;
      await cleanup();

      if (socket && socket.readyState === WebSocket.OPEN) {
        const activeSocket = socket;

        try {
          activeSocket.send(
            JSON.stringify({
              message: "EndOfStream",
              last_seq_no: audioChunksCount,
            })
          );
        } catch (_err) {
          // ignore send error
        }

        await new Promise<void>(function waitForEndOfTranscript(resolve) {
          let resolved = false;
          function finish() {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          }

          const timeoutTimer = setTimeout(function handleTimeout() {
            finish();
          }, 1200);

          endOfTranscriptResolver = function handleResolved() {
            clearTimeout(timeoutTimer);
            finish();
          };
        });

        if (activeSocket.readyState === WebSocket.OPEN) {
          activeSocket.close();
        }
      } else if (socket) {
        socket.close();
      }
      socket = null;
    },
  };
}
