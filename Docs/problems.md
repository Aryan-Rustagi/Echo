# Echo Pipeline — Engineering Problems & Resolutions Log

This document tracks the core architectural and engineering challenges encountered while building the **Echo** voice AI pipeline from scratch, detailing their root causes and technical resolutions based on the actual code implementation.

---

## 1. Audio Capture: WebM Container Overhead vs. Raw 16kHz PCM AudioWorklet
* **The Problem:**
  Browser `MediaRecorder` encodes microphone input into multimedia containers (`audio/webm;codecs=opus`). Streaming containerized WebM chunks over WebSockets to real-time speech engines (Deepgram Nova-3 and Speechmatics) caused protocol errors, frame boundary desynchronization, and dropped speech packets because those engines require raw, uncompressed linear PCM audio.
* **Root Cause:**
  `MediaRecorder` buffers and prepends EBML container headers and compresses audio with Opus rather than exposing raw audio frames.
* **Technical Resolution:**
  Replaced `MediaRecorder` with the **Web Audio API** and an off-thread **`AudioWorkletProcessor`** (`Frontend/Echo/public/pcm-worklet.js`). The worklet captures audio directly at 16,000Hz mono on a separate rendering thread, clamps 32-bit float samples `[-1.0, 1.0]`, converts them to 16-bit linear signed PCM (`Int16Array`), and batches them into ~100ms frames (1,600 samples = 3,200 bytes) with zero container overhead.

---

## 2. Speechmatics Protocol Handshake & In-Flight Audio Truncation on Stop
* **The Problem:**
  Speechmatics real-time streaming failed if audio was sent immediately upon opening the socket. Furthermore, when users clicked "Stop", the last 300–500ms of speech were frequently cut off.
* **Root Cause:**
  Speechmatics enforces a strict state machine: audio cannot be sent before the server acknowledges `RecognitionStarted`. Furthermore, abruptly closing the socket when the user stops talking drops buffered audio frames that are still in transit over TCP.
* **Technical Resolution:**
  Implemented strict flow-control in `speechmatics.ts`:
  1. Gated microphone streaming until the socket receives the server's `RecognitionStarted` handshake message.
  2. Tracked the exact number of sent audio chunks (`audioChunksCount`).
  3. On stop, sent an `EndOfStream` message specifying `last_seq_no: audioChunksCount` and awaited the server's `EndOfTranscript` confirmation message (with an 800ms safety timeout) before closing the connection, guaranteeing zero audio loss.

---

## 3. Security: Ephemeral Token Minting & Zero Key Leaks
* **The Problem:**
  Connecting directly from browser JavaScript to Deepgram or Speechmatics WebSockets requires an API key. Exposing master API keys in client-side code risks credential theft. A previous insecure fallback returned the master key if token minting failed.
* **Root Cause:**
  Browser clients are untrusted execution environments, but proxying bidirectional binary media streams adds significant network latency.
* **Technical Resolution:**
  1. Implemented an **ephemeral token minting endpoint** (`/api/stt-keys/deepgram-token` and `/api/stt-keys/speechmatics-token`).
  2. In `Backend/routes/stt-keys.js`, if the Deepgram `/v1/auth/grant` call fails or key tier is unpermitted, the backend returns a clear `502 Bad Gateway` error. The master API key is never leaked to the client.
  3. Protected the endpoint with JWT authentication (`authenticateToken`).

---

## 4. Real-Time STT Resilience & Automatic Whisper Failover
* **The Problem:**
  If a user experienced network instability, strict firewall restrictions blocking WebSockets, or browser STT microphone permission errors, the voice assistant crashed and blocked the turn completely.
* **Root Cause:**
  The pipeline had a single point of failure with no bridge between real-time streaming sockets and HTTP fallback services.
* **Technical Resolution:**
  Engineered an automatic fallback state machine in `useVoiceSession.ts`. If the active STT engine fails during connection or mid-stream, the assistant automatically falls back to `recorder.ts` + `stt.ts` (Groq/OpenAI Whisper HTTP upload via `/api/transcribe`), displays a non-blocking UI status badge, and completes the conversational turn without failure.

---

## 5. Sub-Second Latency: Streaming SSE & Sentence-by-Sentence Pipelining
* **The Problem:**
  Waiting for the LLM to complete its entire response before initiating text-to-speech introduced 3 to 5 seconds of dead silence, destroying the natural conversational rhythm.
* **Root Cause:**
  Sequential pipeline execution (User speaks ➔ STT ➔ Full LLM Generation ➔ Full TTS Synthesis ➔ Playback).
* **Technical Resolution:**
  Re-architected the pipeline to run concurrently:
  1. Implemented **Server-Sent Events (SSE)** on `/api/chat/stream`, streaming token deltas to the client. The 12-second timeout is applied strictly to the first token, not the whole stream.
  2. Implemented a client-side **Sentence Boundary Splitter** (`sentences.ts`) that intercepts incoming tokens and dispatches completed sentences to TTS as punctuation arrives, while the LLM continues generating subsequent sentences.
  3. Removed all hardcoded or canned fallback replies from `Backend/routes/chat.js`. When all providers fail, a real 502 error is returned.

---

## 6. Sentence Boundary Splitting on Abbreviations & Decimals
* **The Problem:**
  Naive string splitting on periods (`.`) broke titles like *"Dr. Smith"*, decimals like *"3.14"*, and abbreviations like *"e.g."* or *"U.S."* into broken sentence fragments (*"Dr"* ... awkward pause ... *"Smith"*).
* **Root Cause:**
  Splitting on punctuation without lexical context constraints triggers premature chunking on honorifics and abbreviations.
* **Technical Resolution:**
  In `sentences.ts`:
  1. Maintained an explicit set of known abbreviations (`dr.`, `mr.`, `mrs.`, `ms.`, `prof.`, `st.`, `e.g.`, `i.e.`, `u.s.`, `u.k.`, `vs.`, `a.m.`, `p.m.`, `etc.`). If a period terminates an abbreviation, it is not split.
  2. Detected decimals (`isDecimal`): if preceded and followed by digits, the period is not split.
  3. Allowed early splitting on commas or semicolons once the buffer exceeds ~60 characters so the first synthesized audio begins playing sooner.
  4. Provided a `flush()` method so trailing words at the end of the stream without punctuation are never dropped.

---

## 7. Sequential Web Audio Queue & Mid-Reply Voice Consistency
* **The Problem:**
  Fetching TTS audio for multiple sentences in parallel over HTTP caused race conditions where short follow-up sentences returned faster than longer preceding sentences, playing audio out of order. Furthermore, if a remote ElevenLabs call failed mid-reply, switching between remote and browser voices mid-sentence sounded jarring.
* **Root Cause:**
  Network latency varies by sentence length; without a serialized playback coordinator, audio played according to HTTP arrival time.
* **Technical Resolution:**
  In `Frontend/Echo/src/pipeline/tts.ts`:
  1. Audio requests are dispatched in parallel over HTTP for maximum throughput, but audio buffers are played sequentially via Web Audio API `AudioBufferSourceNode`.
  2. Rewrote `speakWithBrowserTTS` using clean promise patterns without `new Promise(async ...)`.
  3. Added mid-reply voice stability: if a remote TTS call fails, `fallbackToBrowserForCurrentTurn` locks the remainder of that answer to the browser voice and surfaces a visible notice in the UI.
  4. Routed synthesized audio through an `AnalyserNode` (`getOutputAudioLevel()`) so output sound levels drive the visualizer during speech.

---

## 8. Real-Time Barge-In (Interruption) & Lifecycle Management
* **The Problem:**
  If a user spoke to interrupt the assistant while it was talking, previous audio continued playing. Furthermore, simply pausing current audio left background HTTP downloads running, which would resume playing over the user's voice.
* **Root Cause:**
  TTS network promises and audio playback nodes lacked unified lifecycle coordination with user speech state.
* **Technical Resolution:**
  1. Handled `SpeechStarted` events from the microphone to trigger an immediate interruption routine.
  2. Attached a turn-scoped `AbortController` to every queue item and removed abort event listeners upon item completion to prevent listener leaks.
  3. Preserved `firstAudioFired` state across `stopAll` calls, resetting it only when a new turn actually initiates.

---

## 9. Browser SpeechSynthesis Watchdog Recovery
* **The Problem:**
  When falling back to local browser TTS (`window.speechSynthesis`), speech frequently stalled mid-sentence on Chromium, leaving the audio queue permanently stuck in the `"speaking"` state.
* **Root Cause:**
  Chromium's Web Speech API has a known bug where the `onend` event fails to fire on longer utterances or during background tab transitions.
* **Technical Resolution:**
  Implemented a **dynamic watchdog timer** proportional to utterance length (`watchdogMs = text.length * 90 + 3000`). If the browser fails to fire `onend` within that window, the watchdog forces promise resolution, calls `window.speechSynthesis.cancel()`, and frees the queue.

---

## 10. Whisper Silence Hallucinations on Empty Audio
* **The Problem:**
  When clicking "Start" and immediately "Stop", the recorded audio contained no speech (just an EBML file header). Groq Whisper hallucinated standard video sign-offs like *"Thank you for watching!"* or *"Thanks."*
* **Root Cause:**
  Header-only WebM files contain no acoustic speech data, triggering training-set hallucination biases in Whisper.
* **Technical Resolution:**
  In `Backend/routes/transcribe.js`:
  1. Calibrated file size cutoff to 1,200 bytes (EBML headers are ~500–800 bytes; real speech is >2KB). Files below this are skipped.
  2. Configured Whisper with `response_format: "verbose_json"` and `temperature: 0`.
  3. Implemented `isWhisperHallucination(text, duration, avgNoSpeechProb)` using normalized case-insensitive phrase matching, applied strictly when the clip is under ~1.5s or average `no_speech_prob > 0.45`.
