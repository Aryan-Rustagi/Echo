# Echo Frontend

React 19 + TypeScript + Vite web client for the **Echo** Voice AI Pipeline.

> 🌐 **Live Demo:** [https://echo-production-aa12.up.railway.app/](https://echo-production-aa12.up.railway.app/)

## Key Modules

* `src/LandingPage.tsx`: Main voice assistant conversational interface.
* `src/pipeline/mic.ts`: 16kHz mono audio capture powered by Web Audio API and AudioWorklet.
* `src/pipeline/deepgram.ts`: Deepgram Nova-3 raw PCM real-time WebSocket streaming.
* `src/pipeline/speechmatics.ts`: Speechmatics RT raw PCM real-time WebSocket streaming.
* `src/pipeline/recorder.ts` & `src/pipeline/stt.ts`: Groq/OpenAI Whisper audio recording and upload fallback.
* `src/pipeline/llm.ts`: Server-Sent Events (SSE) streaming reader with automatic non-streaming fallback.
* `src/pipeline/sentences.ts`: Streaming sentence boundary regex splitter (with 15-character minimum constraint).
* `src/pipeline/tts.ts`: Parallel fetch Web Audio FIFO playback queue with `AbortController` cancellation.

## Development

```bash
npm install
npm run dev
```

Build production bundle:
```bash
npm run build
```
