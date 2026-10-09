# Echo Pipeline Problems Log

This document tracks issues encountered while building the Echo pipeline, including their root causes and resolutions, as mandated by the PRD.

## 1. Port Mismatch and CORS Errors ("Failed to fetch")
**Problem:** The frontend `stt.ts` module threw a `TypeError: Failed to fetch` when attempting to send audio to the backend.
**Root Cause:** The frontend `API_BASE` was hardcoded to `http://localhost:3001`, but the Express server was running on its default fallback `PORT=3000`.
**Resolution:** Updated `stt.ts` to point to port 3000 to align with the backend `.env`.

## 2. Missing Backend Transcribe Route
**Problem:** Even after fixing the port, the frontend still failed because the Express server lacked the necessary route.
**Root Cause:** The `/api/transcribe` endpoint was not yet scaffolded in the Express server to receive the `POST` request.
**Resolution:** Implemented `Backend/routes/transcribe.js` with `multer` to intercept `multipart/form-data` uploads and extract the audio buffer into memory.

## 3. Whisper Hallucination ("Thank you.")
**Problem:** The Groq Whisper API constantly returned "Thank you." or "Thanks for watching." regardless of what the user did.
**Root Cause:** The user clicked "Start" and then immediately "Stop" in the UI, causing `MediaRecorder` to generate a tiny ~1KB file containing only WebM metadata (no audio). When fed silence or empty data, the Whisper model hallucinates standard video sign-offs due to its training data biases.
**Resolution:** Implemented three layers of defense in `transcribe.js`:
  1. File size cutoff (aborts if `< 4000 bytes`).
  2. A system prompt (`prompt="Transcribe the following exactly. Do not output 'Thank you.' for silence."`).
  3. A hardcoded string filter to wipe the hallucination if it still occurs.

## 4. Concurrently / Windows File Lock Failures
**Problem:** Running `npm install` for the root monorepo setup failed repeatedly with "The file cannot be accessed by the system."
**Root Cause:** The backend Express server and frontend Vite server were actively running in the terminal and locking the project directories, preventing npm from writing to `node_modules`.
**Resolution:** Instructed the user to manually stop all running terminal processes before executing `npm install` and setting up the root `concurrently` script.

## 5. Repeated Follow-up Questions
**Problem:** Echo could ask the same question again instead of using a fact from
an earlier turn.

**Root Cause:** The LLM prompt did not explicitly require conversation-memory
behavior, even though recent messages were being sent.

**Resolution:** The chat route now sends the last eight messages and instructs
the model to remember user-provided facts, answer follow-ups from history, and
avoid repeating answered questions.

## 6. TTS Response Delay
**Problem:** A response appeared in the UI before Echo started speaking.

**Root Cause:** The frontend waited for a remote backend TTS request and audio
download before falling back to browser speech.

**Resolution:** Browser SpeechSynthesis is now the immediate TTS path. This
starts playback as soon as the LLM response arrives and avoids network latency.

## 7. Deepgram Master API Key Leaked via Backend Proxy
**Problem:** The `/api/stt-keys/deepgram-token` endpoint returned the raw `process.env.DEEPGRAM_API_KEY` to the client browser.
**Root Cause:** The backend proxy was returning `{ key: process.env.DEEPGRAM_API_KEY }` directly under the assumption that hiding it from the git repository was sufficient. This exposed the root Deepgram master key in client network payloads.
**Resolution:** Updated the endpoint to call Deepgram's ephemeral grant API (`POST https://api.deepgram.com/v1/auth/grant`) with a 30-second TTL (`ttl_seconds: 30`) using server credentials, and returned only `{ token: access_token }`. The master key never leaves the backend environment.

## 8. Unrestricted CORS and Missing Rate Limiting on Backend Endpoints
**Problem:** Any arbitrary origin could call backend endpoints (`/api/chat`, `/api/tts`, `/api/stt-keys`), exposing LLM and speech APIs to quota exhaustion, DoS, and unauthorized web origins.
**Root Cause:** Express was configured with open `cors()` and had no request rate limiting or payload constraints.
**Resolution:** Restricted CORS to an explicit allowlist parsed from `ALLOWED_ORIGINS` (defaulting to `http://localhost:5173`), applied IP-based rate limiting (30 requests/minute per IP) on all sensitive endpoints, and capped incoming JSON bodies to 50kb.

## 9. System Role Injection and Unbounded Chat History
**Problem:** Malicious clients could inject arbitrary `system` role instructions into `/api/chat` or send excessively large payloads, inflating LLM token consumption and overriding the assistant's instructions.
**Root Cause:** `/api/chat` forwarded the raw client `messages` array straight into the OpenAI/Groq API payload without role filtering, message count capping, or character length validation.
**Resolution:** Implemented `cleanMessages()` to strictly filter message roles to `"user"` and `"assistant"` only (dropping client-supplied system messages), trimming each message content to 1,000 characters, retaining only the 8 most recent messages, and rejecting empty submissions with HTTP 400.

## 10. Memory Exhaustion and Crash Vulnerabilities in Transcribe Endpoint
**Problem:** Attackers could upload massive audio files causing Node.js memory exhaustion, and missing text properties in STT responses caused unhandled type errors on `.trim()`.
**Root Cause:** `multer` was configured with unbounded `memoryStorage()`, allowing arbitrary file sizes to be buffered in memory, and `data.text` was assumed to always be a valid string without nullish checking.
**Resolution:** Configured `multer` limits to cap file uploads at 5MB, and added safe type-guarding (`typeof data.text === "string" ? data.text : ""`) before invoking string trimming methods.

## 11. Unofficial Edge TTS WebSocket Fallback and Information Leakage in Logs
**Problem:** The backend TTS route logged API key substrings and user input text, and relied on an unofficial reverse-engineered Edge TTS WebSocket service with a hardcoded extension token that was brittle and unauthorized.
**Root Cause:** Fallback logic was built using reverse-engineered Microsoft speech endpoints, and debugging statements leaked user queries and credential prefixes into server logs.
**Resolution:** Completely removed the Edge TTS WebSocket implementation and its hardcoded token. Sanitized server logs to remove credential fragments and user prompt text. Added a 3-second `AbortController` timeout on ElevenLabs requests; if ElevenLabs fails or times out, the backend immediately returns HTTP 204, signaling the client to smoothly speak via browser SpeechSynthesis.

## 12. Hardcoded Frontend API Base URLs
**Problem:** Frontend modules had hardcoded `http://localhost:3000` URLs across multiple pipeline files, making environment configuration and deployments brittle.
**Root Cause:** Each pipeline file independently declared its own `API_BASE` string literal.
**Resolution:** Created a single centralized `Frontend/Echo/src/config.ts` module reading `import.meta.env.VITE_API_BASE` with fallback to `http://localhost:3000`, and updated all pipeline modules (`stt.ts`, `llm.ts`, `deepgram.ts`, `speechmatics.ts`) to import from it.

## 13. Double Turn Execution Race Conditions ("Double finishTurn")
**Problem:** The conversation assistant occasionally triggered two overlapping LLM calls for a single utterance, causing duplicate replies and garbled speech.
**Root Cause:** `finishTurn()` could be called almost concurrently from multiple triggers—such as the manual "Stop" button click racing against a silence timeout or socket event—without an idempotent synchronization guard.
**Resolution:** Added a boolean ref `turnActiveRef` that is set to `true` when recording starts and checked/cleared synchronously at the top of `finishTurn()`. If `finishTurn()` is already running or complete for the current turn, subsequent invocations immediately return.

## 14. Truncated User Speech on Manual Stop ("Lost Last Words")
**Problem:** When users clicked "Stop" mid-speech or right after speaking, the final words of their sentence were omitted from the transcribed prompt sent to the LLM.
**Root Cause:** Clicking "Stop" immediately read `finalizedTextRef.current` before buffered audio chunks in transit over WebSocket had reached the STT service and returned their final transcript packets.
**Resolution:** Modified `finishTurn()` to stop the media stream and await stream flushing before reading `finalizedTextRef.current`. For Deepgram, the client sends `{"type":"CloseStream"}` and waits up to 800ms for the server to acknowledge, flush, and close the WebSocket, ensuring all pending transcripts are delivered to `onTranscript`.

## 15. Inaccurate Silence Detection via Hardcoded 1200ms Client Timer
**Problem:** A static 1200ms `setTimeout` was used in the client to determine when a user stopped speaking, causing premature cutoffs during natural pauses or sluggish turn completions.
**Root Cause:** Relying on client-side wall-clock silence timers ignores audio acoustics and natural conversational cadence.
**Resolution:** Completely deleted the 1200ms client silence timer. Migrated Deepgram to server-side acoustic Voice Activity Detection (VAD) via `model=nova-3&endpointing=300&utterance_end_ms=1000&vad_events=true`. Deepgram's native `speech_final: true` and `UtteranceEnd` events now trigger prompt completion with accurate conversational timing.

## 16. Hardware Microphone Leaks and Stuck Browser Audio Indicators
**Problem:** The browser recording indicator remained active in the tab even after the user stopped recording, switched sessions, or encountered connection errors.
**Root Cause:** `MediaRecorder.stop()` only halts encoding; the underlying `MediaStream` audio tracks continue capturing hardware audio unless each track is explicitly terminated via `track.stop()`. Furthermore, socket initialization failures prior to `onopen` left orphan tracks open.
**Resolution:** Captured direct references to the active `MediaStream` and introduced an exhaustive cleanup routine that iterates and calls `.stop()` on all audio tracks on stop, error, session reset, and when socket connection fails before `onopen`.

## 17. Speechmatics Protocol Desynchronization and Abrupt Socket Closure
**Problem:** Speechmatics realtime streaming failed or produced transcription errors when audio was pushed immediately upon connection or cut abruptly upon stop.
**Root Cause:** Speechmatics RT requires a two-way handshake: clients must wait for the `RecognitionStarted` message before transmitting audio binary frames, must number audio chunks with monotonic sequence numbers, must transmit an `EndOfStream` message specifying `last_seq_no`, and must wait for `EndOfTranscript` before severing the socket.
**Resolution:** Implemented strict Speechmatics protocol flow control: gated audio transmission until `RecognitionStarted` is received, tracked sent audio chunks and passed `last_seq_no` in `EndOfStream`, and awaited `EndOfTranscript` before closing the WebSocket connection.

## 18. Global Mutable WebSocket and MediaRecorder Instances
**Problem:** Pipeline modules exported mutable globals (`export let socket`, `export let mediaRecorder`), making concurrent session management brittle and prone to race conditions across re-renders.
**Root Cause:** Using module-level shared state across multiple lifecycle runs creates accidental coupling and potential memory leaks.
**Resolution:** Encapsulated WebSocket and recorder state inside closure scopes, returning a unified `{ stop(): Promise<void> }` controller interface from initialization functions.

## 19. High Latency and Container Overhead with Browser MediaRecorder
**Problem:** Streaming audio via browser `MediaRecorder` introduced encoding latency and packet framing overhead (WebM/Opus container headers) that varied unpredictably across browsers.
**Root Cause:** `MediaRecorder` buffers and re-packages raw microphone input into containerized multimedia blobs rather than providing immediate access to native linear audio samples.
**Resolution:** Replaced `MediaRecorder` with an `AudioWorkletProcessor` (`pcm-processor`) running off the main thread. It samples audio directly at 16,000Hz, converts Float32 frames to 16-bit linear PCM (`Int16Array`), and batches samples into crisp ~100ms buffers, streaming raw PCM chunks (`linear16` / `pcm_s16le`) directly over WebSockets.

## 20. Strict TypeScript Unused Parameter Build Failure (TS6133)
**Problem:** Running `npm run build` failed with `TS6133: 'onEndOfTurn' is declared but its value is never read` in `speechmatics.ts`.
**Root Cause:** The project's `tsconfig` enforces strict `noUnusedParameters`. While Deepgram has server VAD events to drive `onEndOfTurn`, Speechmatics RT uses client-directed end-of-stream commands, leaving the parameter unused.
**Resolution:** Cleanly removed the unused parameter from the `startSpeechmaticsTranscription` definition and call site in `LandingPage.tsx`, satisfying strict TypeScript compilation.

## 21. Whisper Silence Hallucinations and Prompt Biasing in Fallback STT
**Problem:** When Whisper was used as a fallback, background ambient noise or brief pauses caused Whisper to hallucinate common training phrases ("Thank you for watching!"), and temperature variations degraded transcription fidelity.
**Root Cause:** Whisper defaulted to non-deterministic temperature sampling and lacked per-segment confidence checks, while instruction-like prompts sometimes leaked into the generated transcript.
**Resolution:** Configured `/api/transcribe` with `response_format: "verbose_json"` and `temperature: 0`. Inspected segment metadata and discarded any segments where `no_speech_prob > 0.6`, while removing instruction-style prompt biasing.

## 22. App Failure and Dead Ends on Realtime WebSocket Connection Drop
**Problem:** If the user experienced network issues or API quota limits on Deepgram/Speechmatics, the app threw an error and blocked the user from speaking.
**Root Cause:** There was no automated fallback pathway between the realtime streaming WebSocket engines and the REST Whisper transcription endpoint.
**Resolution:** Implemented an automatic Whisper fallback in `LandingPage.tsx`. If the active realtime engine fails to connect or errors out mid-stream, the app automatically transitions the session to `recorder.ts` + `stt.ts`, records the user's speech, invokes Whisper on stop, and displays an informative banner in the UI.

## 23. High Turn-around Latency from Monolithic LLM Generation
**Problem:** Users experienced a multi-second delay between speaking and hearing an answer because the application waited for the complete LLM response before initiating text-to-speech.
**Root Cause:** The pipeline operated sequentially (User speaks -> Wait for STT -> Wait for entire LLM paragraph -> Send paragraph to TTS -> Play audio).
**Resolution:** Implemented streaming Server-Sent Events (SSE) for the LLM paired with sentence-level audio pipelining. As tokens stream in, a sentence boundary splitter detects completed sentences and enqueues them for TTS synthesis in parallel while later sentences are still being generated by the model.

## 24. Orphaned Upstream LLM Token Consumption on Early Disconnect
**Problem:** If a user navigated away or started a new turn while the model was generating, the backend continued streaming tokens from OpenAI/Groq, consuming unnecessary API tokens and server compute.
**Root Cause:** Express requests did not propagate client socket closure (`req.on("close")`) to the upstream `fetch` call.
**Resolution:** Attached an `AbortController` to the client request `close` event and passed its signal to the upstream `fetch`, terminating active inference runs the moment a client disconnects.

## 25. Out-of-Order Audio Glitches from Concurrent Sentence TTS Calls
**Problem:** Fetching TTS audio for multiple sentences concurrently resulted in race conditions where short later sentences arrived before earlier longer sentences, playing the assistant's speech out of order.
**Root Cause:** Network latency varies across HTTP requests; without an ordered playback coordinator, audio played strictly according to network arrival time.
**Resolution:** Created a Web Audio queue manager (`tts.ts`). It dispatches TTS HTTP requests in parallel for maximum concurrency, but chains audio buffer playback strictly in sentence generation sequence.

## 26. Browser SpeechSynthesis Hangs and Unnatural Pitch Alterations
**Problem:** The browser TTS fallback frequently stalled mid-sentence or failed to resolve promises, and voices sounded robotic due to hardcoded pitch modifications.
**Root Cause:** Browser Web Speech API implementations (especially Chrome and Safari) have known bugs where `onend` events fail to fire on certain voices, and an artificial 1.15 pitch factor distorted timbre.
**Resolution:** Added a dynamic watchdog timer (`text.length * 90 + 3000 ms`) ensuring fallback promises always resolve, implemented asynchronous voice pre-loading with fallback timeouts, and removed pitch hacks in favor of natural voice synthesis.

## 27. Uninterruptible Assistant Playback ("Barge-In Collision")
**Problem:** When users attempted to correct or interrupt the assistant while it was speaking, Echo continued playing the audio to completion, forcing the user to wait or shout over the speaker.
**Root Cause:** The assistant lacked full-duplex interruption listening; speech synthesis and inference pipelines were not listening for acoustic user speech cues during active playback.
**Resolution:** Wired Deepgram's native `SpeechStarted` VAD event. When detected while status is `speaking` or `thinking`, the app immediately interrupts audio playback via `stopAll()`, aborts in-flight token generation and TTS network calls, and begins a fresh user turn.

## 28. Disconnected Abort Lifecycles Across LLM and TTS Stages
**Problem:** Canceling a conversational turn aborted the LLM stream but left pending TTS sentence audio fetches running in the background, which then unexpectedly played audio after the user started speaking again.
**Root Cause:** The LLM stream and the TTS queue maintained independent, uncoordinated lifecycle abort triggers.
**Resolution:** Unified the turn lifecycle under a single `AbortController` per turn. Both the SSE stream reader and each parallel sentence fetch in the Web Audio queue subscribe to the same abort signal, ensuring atomic teardown on barge-in, error, or manual stop.

## 29. Turn Exhaustion in Conversational Flow ("Manual Re-Click Fatigue")
**Problem:** After Echo answered a question, the user had to manually click "Start" again for every turn, breaking the natural rhythm of conversational voice interactions.
**Root Cause:** The pipeline operated as a single-turn request-response loop that terminated the microphone session on turn completion.
**Resolution:** Implemented an opt-in Continuous Mode. When active, the app automatically transitions back to listening and reopens the microphone after the assistant finishes speaking, displaying a live microphone indicator badge.

## 30. Accessibility and UI Coupling from Inline Styles
**Problem:** Rapid voice status transitions were invisible to assistive technologies (screen readers), and heavy inline styling made dark-mode adaptability and layout maintenance fragile.
**Root Cause:** Status updates lacked ARIA live region markup, and style attributes were directly bound to JSX nodes.
**Resolution:** Added `aria-live="polite"` to status notifications, latency badges, and live mic badges. Refactored all inline styles into semantic CSS classes in `App.css` with dedicated dark mode rules.

## 31. Speechmatics Realtime Engine Token Failure ("Failed to fetch")
**Problem:** Selecting Speechmatics in the frontend UI produced `Realtime engine failed (Failed to fetch). Switched to Whisper fallback.`
**Root Cause:** Compounding factors:
1. The backend Express server on port 3000 was inactive (only `npm run dev` in `Frontend/Echo` was running; without port 3000 listening, the browser received TCP connection refused `ERR_CONNECTION_REFUSED`).
2. The route `/api/stt-keys/speechmatics-token` was restricted to `POST` only without rich upstream error propagation, and the client token fetcher lacked diagnostics to distinguish backend connection failures from token authorization issues.
**Resolution:**
1. Enhanced `Backend/routes/stt-keys.js` to accept both `POST` and `GET` requests on `/speechmatics-token` and parse upstream Speechmatics error payloads so specific errors (such as invalid credentials) are surfaced to clients.
2. Enhanced `Frontend/Echo/src/pipeline/speechmatics.ts` and `deepgram.ts` to catch network fetch failures and display actionable messages (`Cannot connect to backend (Failed to fetch). Ensure the backend server is running on port 3000.`).
3. Added `/api` proxy forwarding to `Frontend/Echo/vite.config.ts` targeting `http://localhost:3000`.
4. Enhanced `Backend/server.js` CORS options with explicit HTTP methods (`GET, POST, PUT, DELETE, OPTIONS`), `allowedHeaders`, and `optionsSuccessStatus: 200`.

## 32. Deepgram Grant Rejection and Stalled LLM Streaming
**Problem:** The configured Deepgram grant endpoint returned HTTP 403, while
the streaming chat request could leave the UI stuck in `Thinking...`.

**Resolution:** Speechmatics is the default realtime engine because its token
endpoint succeeds. Deepgram failures activate the Whisper upload fallback.
The frontend aborts a stalled LLM stream after 2.5 seconds and retries the
regular chat endpoint so a provider failure cannot block the turn forever.

## 33. Remote TTS Delayed First Audio
**Problem:** Sentence playback waited for a remote TTS request before speaking.

**Resolution:** The sentence queue now uses browser SpeechSynthesis immediately.
Remote TTS is no longer on the critical path, so speech starts as soon as the
first complete response sentence is available.

## 34. Transition to Gemini Flash Model & Streaming Watchdog Scope
**Problem:** The pipeline required a faster, lower-latency LLM provider than standard OpenAI/Groq endpoints to minimize conversational turn latency, and the client-side streaming watchdog timer was not cleared after stream connection, causing responses exceeding 2.5 seconds to prematurely abort.

**Resolution:**
1. Integrated Google Gemini Flash (`gemini-flash-latest`) as the primary LLM provider in `Backend/routes/chat.js` for both non-streaming (`POST /api/chat`) and SSE streaming (`POST /api/chat/stream`). Formatted conversation turns into Gemini's `user`/`model` structure with `system_instruction` support.
2. Cleared the TTFT watchdog timeout in `Frontend/Echo/src/pipeline/llm.ts` immediately upon response stream body establishment, ensuring active generation is never interrupted mid-sentence while preserving the 2.5-second timeout for stalled upstream connections.
3. Preserved fallback to OpenAI/Groq when `GEMINI_API_KEY` is not set.

## 35. LLM Provider Selection and Automated Gemini-to-OpenAI Fallback
**Problem:** Users lacked an interface control to choose between Gemini Flash and OpenAI, and if the Gemini API encountered rate limits or errors, the conversational turn failed completely rather than falling back to OpenAI.

**Resolution:**
1. Added an LLM selector dropdown in `Frontend/Echo/src/LandingPage.tsx` alongside the STT engine selector, allowing dynamic selection between "Gemini Flash" and "OpenAI (GPT-4o-mini)".
2. Updated `Frontend/Echo/src/pipeline/llm.ts` to pass the `provider` parameter in `/api/chat` and `/api/chat/stream`.
3. Structured `Backend/routes/chat.js` with automated fallback: when `gemini` is selected, the server attempts Gemini Flash streaming; if Gemini fails or throws an upstream error, the backend automatically catches the exception and falls back to OpenAI streaming seamlessly.
