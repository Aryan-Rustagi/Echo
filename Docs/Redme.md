                           ECHO
Echo is a from-scratch voice AI pipeline built in 3 days. It captures speech from the browser microphone, converts it to text, sends it to an LLM for a response, converts that response back to speech, and plays it back — all wired together manually without using any all-in-one voice AI platform. The goal is not perfection; it's completion. The project demonstrates the ability to build a multi-stage AI pipeline from individual components, handle the failure points between stages, and document the process honestly.

## Tech Stack
* **Frontend**: React
* **Backend**: Express
* **Pipeline Framework**: STT (Speech-to-Text) ➔ LLM (Large Language Model) ➔ TTS (Text-to-Speech)