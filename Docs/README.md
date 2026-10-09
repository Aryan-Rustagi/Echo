# ECHO

Echo is a from-scratch voice AI pipeline built for sub-second, natural conversational interactions. It captures speech from the browser microphone, converts it to text, streams it to an LLM for response generation, splits the tokens into sentences, synthesizes audio in parallel, and plays it back sequentially through Web Audio — all without relying on heavy all-in-one proprietary voice SDKs.

## Tech Stack
* **Frontend**: React 19 + TypeScript + Vite + Web Audio API
* **Backend**: Express 5 + Node.js (SSE Streaming & Proxy)
* **Realtime STT**: Deepgram Nova-3 / Speechmatics RT (Raw PCM WebSockets)
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
[ AudioWorklet (Float32 -> Int16 PCM) ]
      │
      ▼ (Raw 16kHz PCM chunks ~100ms)
[ Realtime STT (Deepgram nova-3 / Speechmatics) ]
      │ (speech_final / UtteranceEnd)
      ▼
[ Express Backend (/api/chat/stream) ]
      │ (Server-Sent Events)
      ▼
[ LLM Stream (Groq / OpenAI) ]
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

1. **Microphone Capture**: The browser acquires 16kHz mono audio with hardware echo cancellation, noise suppression, and auto-gain control.
2. **Raw PCM Processing**: An off-thread `AudioWorkletProcessor` converts native Float32 frames to 16-bit linear PCM and batches ~100ms frames (1,600 samples = 3,200 bytes) with zero container overhead.
3. **Streaming STT**: Raw PCM buffers stream directly over WebSocket to Deepgram Nova-3 (or Speechmatics). Deepgram's native acoustic VAD detects turn completion with `speech_final: true` and `UtteranceEnd`.
4. **Streaming LLM**: The transcript and recent conversation history are posted to `/api/chat/stream`, which forwards token deltas to the browser using Server-Sent Events (SSE).
5. **Sentence Segmentation**: A client-side sentence splitter monitors incoming tokens and emits complete sentences at `.`, `!`, or `?` boundaries (requiring >= 15 characters to avoid splitting abbreviations like "Dr." or "e.g.").
6. **Parallel TTS Queue**: Each completed sentence triggers an immediate parallel fetch to `/api/tts` (ElevenLabs `eleven_flash_v2_5`, with browser SpeechSynthesis fallback). Audio buffers are decoded and played strictly in order through Web Audio `AudioBufferSourceNode`.
7. **Barge-in Support**: When Deepgram emits `SpeechStarted` while Echo is speaking, the app immediately cancels Web Audio playback, aborts in-flight LLM inference with an `AbortController`, and starts a new turn.
8. **Continuous Mode**: In Continuous Mode, the microphone automatically reopens after Echo finishes speaking for hands-free conversations.

---

## STT Architecture & Real-Time Streaming

We support two distinct STT architectures:

### 1. Real-Time Raw PCM Streaming (Deepgram & Speechmatics)
* **Mechanism**: Direct client-to-provider WebSockets using ephemeral tokens granted by the backend.
* **Benefits**: 
  - Lowest latency: partial transcripts arrive as the user speaks.
  - Off-thread AudioWorklet streaming avoids main thread UI stutter.
  - Server-side VAD eliminates arbitrary client silence timers.

### 2. HTTP Upload Fallback (Groq Whisper)
* **Mechanism**: Records client audio and posts it to `/api/transcribe`.
* **Hardening**:
  - Uses `response_format: "verbose_json"` and `temperature: 0`.
  - Filters out segments with `no_speech_prob > 0.6` to eliminate hallucinations.
  - Automatically activates if realtime WebSocket connections fail.

## Current Reliable Voice-Agent Run Path

The recommended local path is Speechmatics realtime PCM transcription,
Gemini Flash response generation, and browser SpeechSynthesis:

```text
Speechmatics -> silence detection -> Gemini Flash (OpenAI fallback) -> sentence queue -> browser TTS
```

Speechmatics is the default engine because its short-lived token endpoint is
currently healthy. Deepgram remains selectable; if its grant endpoint returns
403 for the configured key, Echo automatically switches to the Whisper upload
fallback instead of stopping the turn.

The LLM stream is bounded by a 2.5-second client timeout. If the streaming
endpoint stalls, the frontend retries the regular chat endpoint. Browser TTS
does not wait for remote audio generation, so the first sentence starts
speaking as soon as the response is available.
