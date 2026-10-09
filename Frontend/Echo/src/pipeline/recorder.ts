let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let mimeType = "";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    if (MediaRecorder.isTypeSupported(candidates[i])) {
      return candidates[i];
    }
  }
  return "";
}

export async function startRecording(): Promise<void> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Microphone API not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mimeType = pickMimeType();
  mediaRecorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  chunks = [];
  mediaRecorder.ondataavailable = function handleData(e: BlobEvent) {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  mediaRecorder.start();
}

export function stopRecording(): Promise<Blob> {
  return new Promise(function handleStopPromise(resolve, reject) {
    if (!mediaRecorder) {
      return reject(new Error("Not recording"));
    }

    mediaRecorder.onstop = function handleMediaStop() {
      const type = mediaRecorder?.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: type });
      if (mediaRecorder) {
        const tracks = mediaRecorder.stream.getTracks();
        for (let i = 0; i < tracks.length; i += 1) {
          tracks[i].stop();
        }
      }
      mediaRecorder = null;
      resolve(blob);
    };

    mediaRecorder.stop();
  });
}