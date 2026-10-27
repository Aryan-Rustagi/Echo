/**
 * High-fidelity 16kHz linear PCM WAV recorder.
 * Captures clean, uncompressed 16-bit 16,000Hz mono audio directly from Web Audio API.
 * This guarantees zero WebM container overhead and 100% native compatibility with
 * both whisper.cpp and cloud Whisper APIs (Groq, OpenAI) without requiring ffmpeg.
 */

let activeStream: MediaStream | null = null;
let activeAudioContext: AudioContext | null = null;
let activeSourceNode: MediaStreamAudioSourceNode | null = null;
let activeWorkletNode: AudioWorkletNode | ScriptProcessorNode | null = null;
let pcmChunks: Int16Array[] = [];
let totalSamplesRecorded = 0;
let capturedSampleRate = 16000;
let isRecording = false;

function buildWavHeader(dataByteLength: number, sampleRate = 16000): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF Chunk Descriptor
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, "WAVE");

  // "fmt " sub-chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for Linear PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  writeString(36, "data");
  view.setUint32(40, dataByteLength, true);

  return buffer;
}

function resampleTo16k(input: Int16Array, fromRate: number): Int16Array {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Int16Array(newLength);
  for (let i = 0; i < newLength; i += 1) {
    const srcIndex = Math.min(Math.round(i * ratio), input.length - 1);
    result[i] = input[srcIndex];
  }
  return result;
}

export async function startRecording(): Promise<void> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Microphone API not supported in this browser.");
  }

  // Clean up any stale sessions
  await stopRecordingQuiet();

  pcmChunks = [];
  totalSamplesRecorded = 0;
  isRecording = true;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  activeStream = stream;

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  const ctx = new AudioContextClass({ sampleRate: 16000 });
  activeAudioContext = ctx;
  capturedSampleRate = ctx.sampleRate || 16000;

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const source = ctx.createMediaStreamSource(stream);
  activeSourceNode = source;

  // Use AudioWorklet if pcm-processor is available; fallback to ScriptProcessor if needed
  let workletRegistered = false;
  try {
    await ctx.audioWorklet.addModule("/pcm-worklet.js");
    workletRegistered = true;
  } catch (_e) {
    workletRegistered = false;
  }

  if (workletRegistered) {
    const workletNode = new AudioWorkletNode(ctx, "pcm-processor");
    workletNode.port.onmessage = function handleWorkletMessage(e: MessageEvent) {
      if (!isRecording) return;
      const int16Chunk = new Int16Array(e.data as ArrayBuffer);
      pcmChunks.push(int16Chunk);
      totalSamplesRecorded += int16Chunk.length;
    };
    source.connect(workletNode);
    activeWorkletNode = workletNode;
  } else {
    // Fallback: standard 4096-frame ScriptProcessorNode
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = function handleAudioProcess(e: AudioProcessingEvent) {
      if (!isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const int16Array = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i += 1) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Array[i] = s < 0 ? s * 32768 : s * 32767;
      }
      pcmChunks.push(int16Array);
      totalSamplesRecorded += int16Array.length;
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    activeWorkletNode = processor;
  }
}

async function stopRecordingQuiet(): Promise<void> {
  isRecording = false;

  if (activeWorkletNode) {
    try {
      activeWorkletNode.disconnect();
    } catch (_e) {}
    activeWorkletNode = null;
  }

  if (activeSourceNode) {
    try {
      activeSourceNode.disconnect();
    } catch (_e) {}
    activeSourceNode = null;
  }

  if (activeAudioContext) {
    try {
      if (activeAudioContext.state !== "closed") {
        await activeAudioContext.close();
      }
    } catch (_e) {}
    activeAudioContext = null;
  }

  if (activeStream) {
    try {
      activeStream.getTracks().forEach((t) => t.stop());
    } catch (_e) {}
    activeStream = null;
  }
}

export async function stopRecording(): Promise<Blob> {
  isRecording = false;

  await stopRecordingQuiet();

  if (totalSamplesRecorded === 0) {
    return new Blob([], { type: "audio/wav" });
  }

  // Merge PCM sample buffers
  const mergedPcm = new Int16Array(totalSamplesRecorded);
  let offset = 0;
  for (let i = 0; i < pcmChunks.length; i += 1) {
    mergedPcm.set(pcmChunks[i], offset);
    offset += pcmChunks[i].length;
  }

  // Downsample to 16kHz if audio context ran at a different native rate
  const finalPcm = capturedSampleRate === 16000
    ? mergedPcm
    : resampleTo16k(mergedPcm, capturedSampleRate);

  // Build standard 44-byte RIFF/WAVE header strictly for 16,000Hz mono audio
  const wavHeader = buildWavHeader(finalPcm.byteLength, 16000);
  const blob = new Blob([wavHeader, finalPcm.buffer], { type: "audio/wav" });

  pcmChunks = [];
  totalSamplesRecorded = 0;

  return blob;
}
