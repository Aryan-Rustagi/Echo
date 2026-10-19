# ECHO

> 🌐 **Live Demo:** [https://echo-production-aa12.up.railway.app/](https://echo-production-aa12.up.railway.app/)

Echo is a from-scratch voice AI pipeline built for sub-second, natural conversational interactions. It captures speech from the browser microphone, converts it to text, streams it to an LLM for response generation, splits the tokens into sentences, synthesizes audio in parallel, and plays it back sequentially through Web Audio — all without relying on heavy all-in-one proprietary voice SDKs.

## Tech Stack
* **Frontend**: React 19 + TypeScript + Vite + Axios + Web Audio API
* **Backend**: Express 5 + Node.js (SSE Streaming, Proxy & 7-Day JWT Authentication)
* **Auth & Security**: RFC 7519 HS256 JWT, 7-day session token duration, separate auth & authorization middleware, CORS allowlist
* **Realtime STT**: Browser Native Web Speech API (Primary / Default) · Speechmatics RT · Deepgram Nova-3
* **Fallback STT**: Whisper via `/api/transcribe` (multipart/form-data)
* **LLM**: Google Gemini Flash (`gemini-flash-latest`) / OpenAI / Groq (`/api/chat/stream` with Server-Sent Events)
* **TTS**: ElevenLabs Flash v2.5 with Web SpeechSynthesis watchdog fallback

---

## How It Works

The voice pipeline is architected for ultra-low latency with sentence-by-sentence audio streaming:

```
[ Microphone ]
      │
      ▼
[ Browser STT (Web Speech API) / AudioWorklet PCM WebSocket ]
      │ (Interim streaming + Adaptive VAD / speech_final)
      ▼
[ Express Backend (/api/chat/stream) ]
      │ (Server-Sent Events)
      ▼
[ LLM Stream (Gemini Flash / OpenAI) ]
      │ (Tokens)
      ▼
[ Sentence Splitter (. ! ? + whitespace >= 15 chars) ]
      │ (Sentences)
      ▼
[ Web Audio TTS Queue (ElevenLabs Flash v2.5 / SpeechSynthesis) ]
      │ (Parallel Fetch, Strictly Sequential Playback)
      ▼
[ Speaker ]
```

1. **Speech Capture & STT**: By default, Echo uses the browser's native `webkitSpeechRecognition` / `SpeechRecognition` engine. It emits streaming interim transcripts instantaneously as the user speaks with sub-50ms latency, zero cloud API fees, and zero token grant latency.
2. **Auto-Recovery & Adaptive VAD**: Browser STT includes automatic reconnection recovery (preventing Chrome's silence timeout disconnects) and an adaptive 1.2s silence detection timer that automatically concludes turns.
3. **Alternative Raw PCM Streaming**: If selected in Settings, an off-thread `AudioWorkletProcessor` converts native Float32 frames to 16-bit linear PCM and streams ~100ms frames to Speechmatics Flow or Deepgram Nova-3 over WebSocket.
4. **Streaming LLM**: The finalized transcript is posted to `/api/chat/stream`, which forwards token deltas to the browser using Server-Sent Events (SSE).
5. **Sentence Segmentation**: A client-side sentence splitter monitors incoming tokens and emits complete sentences at `.`, `!`, or `?` boundaries (requiring >= 15 characters to avoid splitting abbreviations like "Dr." or "e.g.").
6. **Parallel TTS Queue**: Each completed sentence triggers an immediate parallel fetch to `/api/tts` (ElevenLabs `eleven_flash_v2_5`, with browser SpeechSynthesis fallback). Audio buffers are decoded and played strictly in order through Web Audio `AudioBufferSourceNode`.
7. **Barge-in Support**: When user speech is detected while Echo is speaking or thinking, the app immediately cancels Web Audio playback, aborts in-flight LLM inference with an `AbortController`, and starts a new turn.
8. **Continuous Mode**: In Continuous Mode, the microphone automatically reopens after Echo finishes speaking for hands-free conversations.

---

## STT Architecture & Options

Echo supports three distinct STT architectures:

### 1. Browser Native Web Speech API (Primary · Recommended)
* **Mechanism**: Direct in-browser speech recognition using `window.SpeechRecognition || window.webkitSpeechRecognition`.
* **Benefits**:
  - Fastest response: instantaneous sub-50ms partial transcripts.
  - Zero cloud dependency: no external API keys or token endpoints needed.
  - Hardened with adaptive silence detection, non-fatal timeout recovery, and multi-language/accent support.

### 2. Real-Time Raw PCM Streaming (Speechmatics & Deepgram)
* **Mechanism**: Direct client-to-provider WebSockets using ephemeral tokens granted by the backend.
* **Benefits**:
  - High noise tolerance and cloud-grade acoustic VAD.
  - Off-thread AudioWorklet streaming avoids main thread UI stutter.

### 3. HTTP Upload Fallback (Groq Whisper)
* **Mechanism**: Records client audio and posts it to `/api/transcribe`.
* **Hardening**:
  - Uses `response_format: "verbose_json"` and `temperature: 0`.
  - Filters out segments with `no_speech_prob > 0.6` to eliminate hallucinations.
  - Automatically activates if streaming engines encounter fatal connection failures.

## Current Reliable Voice-Agent Run Path

The recommended out-of-the-box local path is Browser Native Web Speech transcription, Gemini Flash response generation, and browser SpeechSynthesis:

```text
Browser Web Speech -> adaptive silence VAD -> Gemini Flash (OpenAI fallback) -> sentence queue -> browser TTS
```

Browser STT is the default engine because it works out of the box in Google Chrome, Microsoft Edge, and modern Chromium browsers without requiring API keys or backend tokens. Speechmatics and Deepgram remain selectable in Settings.

The LLM stream is bounded by a 2.5-second client timeout. If the streaming endpoint stalls, the frontend retries the regular chat endpoint. Browser TTS does not wait for remote audio generation, so the first sentence starts speaking as soon as the response is available.

---

## Fallback Matrix

| Layer | Primary (Tier 1) | Secondary (Tier 2) | Tertiary (Tier 3) | Fallback (Tier 4) |
| :--- | :--- | :--- | :--- | :--- |
| **STT** | **Browser Native Web Speech** (Zero-latency, Free) | **Speechmatics Flow** (Realtime WebSocket) | **Deepgram Nova-3** (Realtime WebSocket) | **Groq / OpenAI Whisper** (REST `/api/transcribe`) |
| **LLM** | **Google Gemini Flash** (SSE Stream) | **OpenAI GPT-4o-mini** (SSE Stream) | **Groq LLaMA 3.3 70B** | — |
| **TTS** | **ElevenLabs Flash v2.5** (Parallel Fetch) | **Piper Local ONNX** (Server-side) | **Browser SpeechSynthesis** (Watchdog Recovery) | — |

## Controls & Interaction
* **Push-to-Talk**: Click **Start Speaking** or tap **Spacebar**.
* **Interruption (Barge-In)**: Tap Spacebar, click Stop, or begin speaking while Echo is talking. The pipeline terminates active speech and inference immediately via `AbortController`.
* **Continuous Mode**: Toggle on for hands-free conversations where the microphone automatically re-arms after Echo finishes speaking.

---

## Getting Started

### Prerequisites
* Node.js 20+
* API keys for Google Gemini / OpenAI / Groq / Deepgram / Speechmatics / ElevenLabs (as needed)

### Installation & Local Run

```bash
# Install dependencies across root, backend, and frontend
npm run install:all

# Run backend and frontend concurrently
npm run dev
```

Or run services individually:
```bash
# Backend (http://localhost:3000)
npm run dev:backend

# Frontend (http://localhost:5173)
npm run dev:frontend
```
