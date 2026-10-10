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

  // If a previous recorder was active, stop its tracks cleanly first
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch (_e) {
      // ignore
    }
    try {
      const tracks = mediaRecorder.stream.getTracks();
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].stop();
      }
    } catch (_e) {
      // ignore
    }
    mediaRecorder = null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mimeType = pickMimeType();
  mediaRecorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  chunks = [];
  mediaRecorder.ondataavailable = function handleData(e: BlobEvent) {
    if (e.data && e.data.size > 0) {
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

    const currentRecorder = mediaRecorder;

    function cleanupTracks() {
      try {
        const tracks = currentRecorder.stream.getTracks();
        for (let i = 0; i < tracks.length; i += 1) {
          tracks[i].stop();
        }
      } catch (_e) {
        // ignore
      }
    }

    if (currentRecorder.state === "inactive") {
      cleanupTracks();
      mediaRecorder = null;
      const type = currentRecorder.mimeType || mimeType || "audio/webm";
      return resolve(new Blob(chunks, { type }));
    }

    let resolved = false;
    function finish() {
      if (!resolved) {
        resolved = true;
        cleanupTracks();
        mediaRecorder = null;
        const type = currentRecorder.mimeType || mimeType || "audio/webm";
        resolve(new Blob(chunks, { type }));
      }
    }

    currentRecorder.onstop = function handleMediaStop() {
      finish();
    };

    // Safety timeout in case browser onstop event fails to fire
    const safetyTimeout = setTimeout(function handleTimeout() {
      finish();
    }, 1500);

    try {
      currentRecorder.stop();
    } catch (err) {
      clearTimeout(safetyTimeout);
      finish();
    }
  });
}