# Echo Pipeline — Engineering Problems & Resolutions Log

This document tracks the core architectural and engineering challenges encountered while building the **Echo** voice AI pipeline from scratch, detailing their root causes and technical resolutions.

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
  Speechmatics real-time streaming failed if audio was sent immediately upon opening the socket. Furthermore, when users clicked "Stop", the last 300–500ms of speech (e.g. *"What is the capital of France... in 1900?"*) were frequently cut off.
* **Root Cause:**
  Speechmatics enforces a strict state machine: audio cannot be sent before the server acknowledges `RecognitionStarted`. Furthermore, abruptly closing the socket when the user stops talking drops buffered audio frames that are still in transit over TCP.
* **Technical Resolution:**
  Implemented strict flow-control in `speechmatics.ts`:
  1. Gated microphone streaming until the socket receives the server's `RecognitionStarted` handshake message.
  2. Tracked the exact number of sent audio chunks (`audioChunksCount`).
  3. On stop, sent an `EndOfStream` message specifying `last_seq_no: audioChunksCount` and awaited the server's `EndOfTranscript` confirmation message (with an 800ms safety timeout) before closing the connection, guaranteeing zero audio loss.

---

## 3. Security vs. Latency: Ephemeral Token Authority Pattern
* **The Problem:**
  Connecting directly from browser JavaScript to Deepgram or Speechmatics WebSockets requires an API key in the connection header (`Authorization: Bearer <key>`). Exposing master API keys in the frontend allows anyone to inspect DevTools and steal paid credentials. However, proxying all raw microphone audio through the Express server introduces 200–400ms of extra latency.
* **Root Cause:**
  Browser clients are untrusted execution environments, but proxying bidirectional binary media streams adds significant network overhead.
* **Technical Resolution:**
  Built an **ephemeral token minting endpoint** on the Express backend (`/api/stt-keys/*`). The backend uses the master key to request short-lived (30-second TTL) temporary single-use tokens/JWTs from provider auth APIs. The browser fetches this disposable token and opens a direct, low-latency WebSocket connection to the provider. The master key never leaves the server.

---

## 4. Real-Time STT Resilience & Automatic Whisper Failover
* **The Problem:**
  If a user experienced network instability, strict firewall restrictions blocking WebSockets, or provider HTTP 403 quota errors, the voice assistant crashed and blocked the turn completely.
* **Root Cause:**
  The pipeline initially had a single point of failure with no bridge between real-time streaming sockets and HTTP fallback services.
* **Technical Resolution:**
  Engineered an automatic fallback state machine in `LandingPage.tsx`. If the active WebSocket engine fails during connection or mid-stream, the assistant automatically falls back to `recorder.ts` + `stt.ts` (Groq/OpenAI Whisper HTTP upload), displays a non-blocking UI status badge, and completes the conversational turn without failure.

---

## 5. Sub-Second Latency: Streaming SSE & Sentence-by-Sentence Pipelining
* **The Problem:**
  Waiting for the LLM to complete its entire 40–50 word response before initiating text-to-speech introduced 3 to 5 seconds of dead silence, destroying the natural conversational rhythm.
* **Root Cause:**
  Sequential pipeline execution (User speaks ➔ STT ➔ Full LLM Generation ➔ Full TTS Synthesis ➔ Playback).
* **Technical Resolution:**
  Re-architected the pipeline to run concurrently:
  1. Implemented **Server-Sent Events (SSE)** on `/api/chat/stream`, streaming token deltas to the client with sub-300ms Time-To-First-Token (TTFT).
  2. Implemented a client-side **Sentence Boundary Chunker** (`sentences.ts`) that intercepts incoming tokens and dispatches Sentence 1 to TTS the moment its punctuation arrives, while the LLM is still generating Sentence 2 in the background.

---

## 6. Sentence Boundary Splitting on Titles and Abbreviations ("The Dr. Problem")
* **The Problem:**
  Naive string splitting on periods (`.`) broke titles like *"Dr. Smith"*, decimals like *"3.14"*, and abbreviations like *"e.g."* or *"U.S."* into broken sentence fragments (*"Dr"* ... awkward pause ... *"Smith"*).
* **Root Cause:**
  Splitting on punctuation without character-length or lexical context constraints triggers premature chunking on honorifics and abbreviations.
* **Technical Resolution:**
  Created an incremental regex boundary detector in `sentences.ts` requiring punctuation (`.`, `!`, `?`) to be followed by whitespace, combined with a **15-character minimum candidate length constraint** before emitting a sentence. Provided a `flush()` method so trailing words at the end of the stream without punctuation are never dropped.

---

## 7. Concurrent TTS Race Conditions & Out-of-Order Audio ("The Fast Sentence 2 Problem")
* **The Problem:**
  Fetching TTS audio for multiple sentences in parallel over HTTP caused race conditions where short follow-up sentences (e.g. *"Yes, exactly!"*) returned faster than longer preceding sentences, playing the assistant's response out of order.
* **Root Cause:**
  Network latency varies by sentence length; without a serialized playback coordinator, audio played according to HTTP arrival time rather than narrative order.
* **Technical Resolution:**
  Built an asynchronous FIFO queue in `Frontend/Echo/src/pipeline/tts.ts`. Audio requests are dispatched in parallel over HTTP for maximum throughput, but audio buffers are held in a strictly ordered FIFO queue and played sequentially via Web Audio API `AudioBufferSourceNode`.

---

## 8. Real-Time Barge-In (Interruption) & Ghost Audio Playback
* **The Problem:**
  If a user spoke to interrupt the assistant while it was talking, previous audio continued playing. Furthermore, simply pausing the current audio left background HTTP downloads for subsequent sentences running, which then unexpectedly started playing audio over the user's voice a second later.
* **Root Cause:**
  TTS network promises and audio playback nodes lacked unified lifecycle coordination with user speech state.
* **Technical Resolution:**
  1. Wired Deepgram's native `SpeechStarted` acoustic VAD event to trigger an immediate interruption routine.
  2. Attached a turn-scoped **`AbortController`** to every queue item.
  3. Inside `processQueue()`, added `item.abortController.signal.aborted` verification guards immediately after the audio promise settles, ensuring in-flight promises that resolve after an interruption are instantly discarded without playing audio.

---

## 9. Browser SpeechSynthesis "Frozen Playback" Bug
* **The Problem:**
  When falling back to local browser TTS (`window.speechSynthesis`), speech frequently stalled mid-sentence on Chromium and Safari, leaving the audio queue permanently stuck in the `"speaking"` state.
* **Root Cause:**
  Browser Web Speech API implementations have a known bug where the `onend` event fails to fire on longer utterances or during background tab transitions.
* **Technical Resolution:**
  Implemented a **dynamic watchdog timer** proportional to utterance length (`watchdogMs = text.length * 90 + 3000`). If the browser fails to fire `onend` within that calculated window, the watchdog forces promise resolution, calls `window.speechSynthesis.cancel()`, and frees the queue.

---

## 10. Whisper Silence Hallucinations on Empty Audio
* **The Problem:**
  When clicking "Start" and immediately "Stop", the recorded audio contained no speech (just an EBML file header). Groq Whisper hallucinated standard video sign-offs like *"Thank you for watching!"* or *"Thanks."*
* **Root Cause:**
  Header-only WebM files contain no acoustic speech data, triggering training-set hallucination biases in Whisper.
* **Technical Resolution:**
  Implemented three layers of hardening in `Backend/routes/transcribe.js`:
  1. Calibrated file size cutoff to 1,200 bytes (EBML headers are ~500–800 bytes; real speech is >2KB). Files below this are skipped.
  2. Configured Whisper with `response_format: "verbose_json"` and `temperature: 0`.
  3. Filtered out segments where `no_speech_prob > 0.6` and stripped common video sign-off phrases.
