                           ECHO
Echo is a from-scratch voice AI pipeline built in 3 days. It captures speech from the browser microphone, converts it to text, sends it to an LLM for a response, converts that response back to speech, and plays it back — all wired together manually without using any all-in-one voice AI platform. The goal is not perfection; it's completion. The project demonstrates the ability to build a multi-stage AI pipeline from individual components, handle the failure points between stages, and document the process honestly.

## Tech Stack
* **Frontend**: React
* **Backend**: Express
* **Pipeline Framework**: STT (Speech-to-Text) ➔ LLM (Large Language Model) ➔ TTS (Text-to-Speech)

## STT Architecture & Real-Time Streaming
We explored two different architectures for the Speech-to-Text (STT) pipeline:

### 1. HTTP Upload (Baseline: Groq Whisper)
* **How it works:** The frontend records an audio blob using `MediaRecorder` and posts it to the Express backend. The backend forwards it to the Groq Whisper API (whisper-large-v3-turbo).
* **Pros:** Extremely accurate; handles background noise gracefully; simple REST implementation.
* **Cons:** High latency (wait for chunk completion + upload time + processing time); taxes backend bandwidth.

### 2. WebSocket Streaming (Deepgram & Speechmatics)
* **How it works:** The frontend acquires a short-lived token from the backend and opens a WebSocket directly to the STT provider. Audio bytes are streamed straight from the browser microphone.
* **Pros:** Blazing fast; provides real-time partial transcripts for a highly responsive UI; offloads heavy audio bandwidth from the Express backend.
* **Cons:** Complex connection lifecycle management (handling disconnects, slicing `MediaRecorder` chunks, graceful closures).
