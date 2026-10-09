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
