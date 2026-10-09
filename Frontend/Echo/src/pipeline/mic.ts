export interface MicController {
  stop(): Promise<void>;
}

let activeController: MicController | null = null;

export async function stopMic(): Promise<void> {
  if (activeController) {
    const controller = activeController;
    activeController = null;
    await controller.stop();
  }
}

export async function startMic(
  onChunk: (chunk: ArrayBuffer) => void
): Promise<MicController> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Microphone API not supported in this browser.");
  }

  // 1. Acquire media stream with requested audio constraints
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // 2. Initialize AudioContext at 16000Hz
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
    sampleRate: 16000,
  });

  // 3. Load PCM AudioWorklet processor
  await audioContext.audioWorklet.addModule("/pcm-worklet.js");

  const source = audioContext.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");

  // Batch frames to ~100ms (1600 samples at 16kHz)
  const BATCH_SAMPLE_THRESHOLD = 1600;
  let sampleChunks: Int16Array[] = [];
  let totalSamples = 0;
  let isStopped = false;

  workletNode.port.onmessage = function handleWorkletMessage(event: MessageEvent) {
    if (isStopped) {
      return;
    }

    const chunk = new Int16Array(event.data as ArrayBuffer);
    sampleChunks.push(chunk);
    totalSamples += chunk.length;

    if (totalSamples >= BATCH_SAMPLE_THRESHOLD) {
      const merged = new Int16Array(totalSamples);
      let offset = 0;
      for (let i = 0; i < sampleChunks.length; i += 1) {
        merged.set(sampleChunks[i], offset);
        offset += sampleChunks[i].length;
      }
      sampleChunks = [];
      totalSamples = 0;
      onChunk(merged.buffer);
    }
  };

  source.connect(workletNode);

  const controller: MicController = {
    stop: async function stop(): Promise<void> {
      if (isStopped) {
        return;
      }
      isStopped = true;

      // Flush remaining buffered samples if any
      if (totalSamples > 0) {
        const merged = new Int16Array(totalSamples);
        let offset = 0;
        for (let i = 0; i < sampleChunks.length; i += 1) {
          merged.set(sampleChunks[i], offset);
          offset += sampleChunks[i].length;
        }
        sampleChunks = [];
        totalSamples = 0;
        onChunk(merged.buffer);
      }

      // Disconnect audio nodes
      try {
        source.disconnect();
      } catch (_e) {
        // ignore
      }
      try {
        workletNode.disconnect();
      } catch (_e) {
        // ignore
      }
      try {
        workletNode.port.close();
      } catch (_e) {
        // ignore
      }

      // Stop all microphone tracks
      const tracks = stream.getTracks();
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].stop();
      }

      // Close AudioContext
      if (audioContext.state !== "closed") {
        await audioContext.close();
      }

      if (activeController === controller) {
        activeController = null;
      }
    },
  };

  activeController = controller;
  return controller;
}
