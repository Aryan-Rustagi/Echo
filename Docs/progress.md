# Echo Pipeline Progress

This document tracks the progress of the Echo voice AI pipeline project, detailing commits, feature additions, and pull requests.

## Phase 1: Foundation and Initialization

### [Date: Oct 9, 2026] - Project Initialization
**Commit:** `chore: initialize project documentation and backend structure`

**What was done:**
1. **Documentation Setup:**
   - Created `Prd.md` (Product Requirements Document) outlining project goals, architecture, and timeline.
   - Updated `README.md` to include a project summary and the planned tech stack (React + Express, STT ➔ LLM ➔ TTS).
2. **Backend Setup:**
   - Initialized the Node.js backend in the `Backend/` directory with `npm init -y`, generating the base `package.json`.
3. **Frontend Setup:**
   - Triggered Vite initialization for the React frontend in the `Frontend/` directory.
   - Implemented the Phase 1 UI layout in `App.tsx` and `App.css` using plain CSS (no Tailwind, per user request).
   - Extracted UI state and logic to `LandingPage.tsx` to keep `App.tsx` clean.
4. **STT Integration (Complete):**
   - Implemented `recorder.ts` (MediaRecorder) and `stt.ts` (API fetch) on the frontend.
   - Built the Express `/api/transcribe` route using `multer` and native `fetch` to securely proxy audio files to Groq's `whisper-large-v3-turbo` model.

**Next Steps:**
- Create the LLM text generation phase (wiring the transcript to Groq `llama-3.3-70b-versatile`).
- Implement the Edge TTS phase to speak the response back to the user.

## Phase 1 (Hardening): Security & Repo Hygiene

### [Date: Oct 9, 2026] - Security Hardening & Hygiene
**What was done:**
1. **Repository Hygiene & Git Configuration:**
   - Rewrote `.gitignore` with LF endings to ignore `node_modules/`, `dist/`, `.env`, and `*.log`.
   - Staged cleanup of stale `Frontend/src/` artifacts and cached build outputs.
2. **Ephemeral STT Token Granting:**
   - Refactored `Backend/routes/stt-keys.js` to call Deepgram's `/v1/auth/grant` with `ttl_seconds: 30`, returning only `{ token: access_token }` so the master API key is never exposed to the client.
3. **CORS, Rate Limiting & Body Protection:**
   - Updated `Backend/server.js` with CORS allowlisting backed by `ALLOWED_ORIGINS` (defaulting to `http://localhost:5173`).
   - Added rate limiting (30 req/min per IP) on `/api/chat`, `/api/tts`, and `/api/stt-keys`.
   - Enforced a strict 50kb request payload cap on `express.json()`.
4. **Chat Input Sanitization & Prompt Injection Protection:**
   - Added `cleanMessages()` helper in `Backend/routes/chat.js` to strip client-supplied `system` roles, allow only `user` and `assistant`, truncate content to 1000 characters, retain only the last 8 messages, and return 400 for empty/invalid payloads.
5. **Audio Upload Limits & Defensive Transcription Parsing:**
   - Capped `multer` in `Backend/routes/transcribe.js` with a 5MB `fileSize` limit.
   - Guarded against missing or non-string `data.text` before invoking `.trim()`.
6. **TTS Hardening & Resilience:**
   - Capped text length at 500 characters in `Backend/routes/tts.js`.
   - Sanitized logging by stripping API key prefixes and user input text.
   - Removed the reverse-engineered Edge TTS WebSocket fallback with hardcoded tokens.
   - Added a 3-second `AbortController` timeout for ElevenLabs, returning HTTP 204 to trigger client browser SpeechSynthesis fallback seamlessly.
7. **Unified Frontend Configuration & Code Style Compliance:**
   - Centralized `API_BASE` in `Frontend/Echo/src/config.ts` reading `import.meta.env.VITE_API_BASE` with `http://localhost:3000` fallback.
   - Refactored pipeline modules (`stt.ts`, `llm.ts`, `deepgram.ts`, `speechmatics.ts`) to use `config.ts`, eliminate arrow functions, and enforce strict TypeScript without `any`.
8. **Environment Template Documentation:**
   - Updated `Backend/.env.example` with all configuration keys required by the backend.

## Phase 2: STT Correctness & Resilience Fixes

### [Date: Oct 9, 2026] - STT Pipeline Correctness
**What was done:**
1. **Double Turn Finalization Guard:**
   - Introduced `turnActiveRef` in `LandingPage.tsx` guarding `finishTurn()` so it can only execute once per turn, resetting on new turn initiation.
2. **Stream Flush & Flushed Text Reading:**
   - Deferred reading `finalizedTextRef` on manual Stop until `controller.stop()` finishes.
   - For Deepgram, sent `{"type":"CloseStream"}` and waited for socket close (with 800ms safety timeout) so in-flight audio buffers are fully transcribed before LLM invocation.
3. **Deepgram Nova-3 & Server-Side VAD Migration:**
   - Upgraded Deepgram WebSocket URL with `model=nova-3`, `interim_results=true`, `endpointing=300`, `utterance_end_ms=1000`, `vad_events=true`, and `smart_format=true`.
   - Switched authentication to `["bearer", token]` subprotocol.
   - Replaced fragile 1200ms client silence timer with Deepgram's native `speech_final: true` and `UtteranceEnd` signals.
4. **Hardware Microphone Leak Elimination:**
   - Stored direct `MediaStream` references in `deepgram.ts` and `speechmatics.ts` and invoked explicit track stops across all terminal paths (manual stop, runtime error, and handshake failures before `onopen`).
5. **Defensive Error Handling:**
   - Bound `onError` to synchronously mark turns inactive and tear down ongoing transcription controllers.
6. **Speechmatics Flow-Control Protocol Conformance:**
   - Gated `MediaRecorder` startup behind Speechmatics `RecognitionStarted` handshake message.
   - Tracked sent audio chunks and passed exact sequence count `last_seq_no` in `EndOfStream`.
   - Awaited `EndOfTranscript` confirmation message before severing WebSocket connections.
7. **Modular Controller Abstraction:**
   - Removed module-level mutable exports (`socket`, `mediaRecorder`) from pipeline files in favor of encapsulated `{ stop(): Promise<void> }` controller instances returned from initialization calls.

## Phase 3: Raw PCM AudioWorklet Streaming & Whisper Fallback

### [Date: Oct 9, 2026] - PCM Streaming & Resilience Fallback
**What was done:**
1. **AudioWorklet Processor for Float32 to Int16 PCM Conversion:**
   - Implemented `pcm-processor` in `Frontend/Echo/public/pcm-worklet.js`, clamping audio inputs between -1.0 and 1.0 and converting Float32 frames to 16-bit linear PCM (`Int16Array`).
2. **Unified Audio Capture Module (`mic.ts`):**
   - Created `Frontend/Echo/src/pipeline/mic.ts` capturing 16000Hz mono audio with acoustic constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`).
   - Connected `MediaStreamSource` to `AudioWorkletNode` and batched audio frames to ~100ms (1,600 samples / 3,200 bytes) before dispatching to WebSocket consumers.
   - Built comprehensive shutdown logic releasing all media tracks and terminating `AudioContext`.
3. **Deepgram Linear16 PCM Streaming:**
   - Replaced containerized `MediaRecorder` in `deepgram.ts` with direct PCM chunk transmission via `startMic`.
   - Updated WebSocket endpoint with `encoding=linear16&sample_rate=16000&channels=1`.
4. **Speechmatics Raw PCM Streaming:**
   - Configured Speechmatics `StartRecognition` payload with `audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: 16000 }`.
   - Replaced `MediaRecorder` with `startMic` upon `RecognitionStarted` receipt.
   - Removed unused `onEndOfTurn` parameter to eliminate `TS6133` compile warnings.
5. **Backend Whisper Fallback Quality Hardening (`transcribe.js`):**
   - Migrated `/api/transcribe` to `response_format: "verbose_json"` and `temperature: 0`.
   - Dropped hallucinated silent audio segments with `no_speech_prob > 0.6`.
   - Removed prompt biasing instructions.
6. **Automatic Frontend Whisper Fallback (`LandingPage.tsx`):**
   - Implemented resilient fallback wiring in `LandingPage.tsx`: if realtime WebSocket engines fail during connection or streaming, the assistant automatically switches to `recorder.ts` + `stt.ts` (Whisper), maintains the active turn, and displays an informative UI status badge.

## Current Working Voice Agent

The end-to-end voice agent now uses Speechmatics as the default realtime STT
engine, OpenAI for response generation, and browser SpeechSynthesis for
immediate spoken output. It supports automatic silence-based turn completion,
manual Stop, recent conversation context, sentence-level response display,
continuous mode, barge-in interruption, Whisper fallback, and a bounded
non-streaming LLM fallback.

## Phase 4: Streaming LLM & Sentence-by-Sentence TTS Pipeline

### [Date: Oct 9, 2026] - Sub-Second Voice Response Optimization
**What was done:**
1. **Server-Sent Events (SSE) Streaming Route (`chat.js`):**
   - Implemented `POST /api/chat/stream` forwarding upstream LLM token deltas directly to the client via `text/event-stream`.
   - Wired client disconnect handling (`req.on("close")`) to an `AbortController` terminating the upstream LLM request immediately.
   - Raised token budget to `max_tokens: 150` and guarded against empty stream completions.
2. **Ultra-Low Latency ElevenLabs Flash Voice (`tts.js`):**
   - Switched remote TTS model to `eleven_flash_v2_5` with `output_format=mp3_22050_32` for ~70% reduction in audio generation time.
   - Preserved 3-second `AbortController` timeout returning HTTP 204 fallback.
3. **Frontend SSE Reader (`llm.ts`):**
   - Added `streamResponse(messages, onToken, signal)` utilizing `ReadableStream` reader and `TextDecoder` to parse incoming SSE events incrementally.
4. **Natural Sentence Segmentation (`sentences.ts`):**
   - Created `createSentenceSplitter(onSentence)` splitting on punctuation marks (`.`, `!`, `?`) followed by whitespace with a 15-character minimum length constraint to prevent mid-title/abbreviation splits (`Dr.`, `e.g.`).
   - Provided `flush()` to output any remaining trailing sentence.
5. **Parallel Fetch & Sequential Audio Playback Queue (`tts.ts`):**
   - Rewrote `tts.ts` as an asynchronous Web Audio queue (`enqueueSentence`): fetches audio chunks in parallel over HTTP while enforcing strictly sequential playback order.
   - Built `stopAll()` aborting in-flight fetches, clearing the queue, stopping active audio nodes, and canceling browser speech synthesis.
   - Integrated `resumeAudioContext()` wired to user Start gestures.
6. **Robust Browser SpeechSynthesis Fallback:**
   - Implemented async voice pre-loading with `voiceschanged` event and 1-second timeout.
   - Added dynamic watchdog timer (`text.length * 90 + 3000 ms`) guaranteeing prompt promise resolution on buggy mobile/desktop Web Speech engines.
   - Removed artificial pitch distortion.
7. **Streaming Pipeline Orchestration & Timing Metrics (`LandingPage.tsx`):**
   - Coordinated `streamResponse` -> `splitter` -> `enqueueSentence` lifecycle: "speaking" status starts upon first audio arrival, returning to "idle" only once both the LLM stream and the audio playback queue have drained.
   - Logged critical conversational latencies: `t_speech_end`, `t_first_token`, and `t_first_audio`, reporting TTFT, audio latency, and token-to-audio elapsed times in the developer console.

## Phase 5: Conversational Polish, Barge-In & Continuous Mode

### [Date: Oct 9, 2026] - Natural Turn-Taking & Ergonomic Experience
**What was done:**
1. **Realtime Barge-In Interruption:**
   - Captured Deepgram `SpeechStarted` events during assistant `speaking` or `thinking` states.
   - Wired immediate audio cancellation via `stopAll()`, aborted in-flight LLM tokens and pending TTS fetches via the turn's `AbortController`, and cleanly initiated a new user turn.
2. **Continuous Conversation Mode:**
   - Added a continuous mode toggle in the UI with a live visual mic indicator (`● Mic is live (listening...)`).
   - Automatically reopens the microphone and begins listening as soon as Echo finishes speaking, enabling hands-free dialog.
3. **Turn-Level AbortController Integration:**
   - Established a single `AbortController` per conversational turn that spans both the SSE LLM stream (`streamResponse`) and all parallel sentence fetches (`enqueueSentence`), guaranteeing immediate teardown without orphaned network traffic.
4. **UI Stylesheet Migration & Accessibility:**
   - Migrated all inline styles from `LandingPage.tsx` into semantic CSS classes in `App.css`, with full dark mode support.
   - Added `aria-live="polite"` attributes to status badges, live mic indicators, and latency readouts for screen-reader accessibility.
   - Rendered real-time partial transcripts during speech and an instant latency readout badge (`⚡ Xms to first audio`).
5. **Documentation & Pipeline Diagram:**
   - Added a dedicated "How it works" architecture guide and ASCII pipeline diagram in `Docs/README.md`.

## Debugging & Resilience: Speechmatics Token & Dev Proxy Fixes

### [Date: Oct 9, 2026] - Speechmatics Token & Network Connectivity Diagnostics
**What was done:**
1. **STT Token Route Hardening (`Backend/routes/stt-keys.js`):**
   - Enabled both `POST` and `GET` methods for `/speechmatics-token` and improved error propagation to parse and relay upstream Speechmatics authentication error messages rather than empty status strings.
2. **Backend CORS Optimization (`Backend/server.js`):**
   - Expanded CORS options to explicitly declare allowed HTTP methods (`GET, POST, PUT, DELETE, OPTIONS`), `allowedHeaders`, and `optionsSuccessStatus: 200` to prevent preflight drops.
3. **Frontend Connection Diagnostics (`speechmatics.ts` & `deepgram.ts`):**
   - Wrapped token fetches in diagnostic try/catch blocks that surface descriptive messages indicating whether the Express backend is running on port 3000, along with parsed server error details.
4. **Vite Dev Server Proxy (`vite.config.ts`):**
   - Added `/api` proxy forwarding to `http://localhost:3000` to allow same-origin routing during development.

## Pipeline Resilience: Reliable Local Run Path & Latency Optimizations

### [Date: Oct 9, 2026] - Resilient Engine Defaults & Immediate Speech Synthesis
**What was done:**
1. **Default Realtime Engine Switch to Speechmatics (`LandingPage.tsx`):**
   - Set Speechmatics as the default active STT engine given healthy token generation.
   - Preserved Deepgram as selectable with automatic fallback to Whisper upload on HTTP 403 or network failure.
2. **Stalled Stream Watchdog with Automatic Chat Fallback (`llm.ts`):**
   - Added a 2.5-second client-side timeout to SSE streaming requests (`/api/chat/stream`).
   - If streaming stalls or times out, the client automatically aborts the stream and fails over to the non-streaming `/api/chat` endpoint, preventing the UI from getting permanently stuck in "thinking".
3. **Immediate Browser SpeechSynthesis for First Audio (`tts.ts`):**
   - Placed browser `SpeechSynthesis` on the immediate critical path in the sentence audio queue (`enqueueSentence`), eliminating remote HTTP latency before speech begins.
   - Playback starts immediately as soon as the first sentence boundary is parsed, delivering lowest time-to-first-audio.

