# Echo Product Requirements Document

## 1. Executive Summary
Echo is a browser-based voice AI agent that lets a user speak into a microphone and receive a spoken response from an LLM. The pipeline is assembled manually from independent components — audio capture, speech-to-text, LLM inference, and text-to-speech — and is deliberately not built on any managed voice AI platform.

Echo is not a product. It is a capability demonstration: build a multi-stage AI pipeline from first principles in three days, handle the failure points between stages, and document the process honestly.

## 2. Problem Statement
Build a simple, working, browser-based voice pipeline from scratch — capture microphone input, transcribe it, generate an LLM response, and synthesize that response back to audio — without relying on any all-in-one voice AI platform.

The problem is not "use a voice AI." The problem is construct the pipeline. This requires independently integrating STT, LLM, and TTS services, orchestrating them manually, and handling the failures between stages.

## 3. Objectives
**Primary (P0)**
* Deliver a working end-to-end voice pipeline in the browser
* Integrate STT, LLM, and TTS as independent, manually wired stages
* Operate entirely within free-tier or browser-native services
* Produce honest documentation: README.md, progress.md, problems.md
* Deliver a clean repo with commits and a reviewable PR
* Demo the pipeline live on Monday

**Secondary (P1)**
* End-to-end latency under 3 seconds
* Clear UI state feedback for every stage
* Professional README

**Explicit non-goals**
Echo is not production-grade, not commercially viable, and not intended to outperform managed platforms.

## 4. Success Metrics
| Metric | Target |
| :--- | :--- |
| End-to-end latency | < 3.0 s |
| Pipeline success rate | ≥ 8 / 10 attempts |
| Documented problems | ≥ 5 with root cause |
| Daily commits | ≥ 3 per day |
| Demo duration | < 2 minutes |
| Custom code volume | < 500 lines |

## 5. Scope
**In Scope**
* Web page with mic control and transcript display
* Audio capture via MediaRecorder
* STT via Groq Whisper
* LLM response via Groq
* TTS via Edge TTS (fallback: browser SpeechSynthesis)
* Local Express proxy to secure credentials
* UI state machine: idle / recording / transcribing / thinking / speaking / error
* Error handling for all identified failure paths
* Repository documentation and PR

**Out of Scope (Phase 2 candidates)**
* Streaming audio
* VAD
* turn detection
* conversation memory
* wake word
* voice cloning
* mobile support
* authentication
* database
* multi-provider fallback
* deployment
* polished UI

## 6. Users and Use Cases
Primary user: The reviewer evaluating engineering capability on Monday.
Secondary user: The developer building and testing the pipeline.

| ID | Use Case | Outcome |
| :--- | :--- | :--- |
| UC-1 | Start a voice interaction | Mic activates, recording begins |
| UC-2 | Speak a short utterance | Audio captured as a blob |
| UC-3 | Receive transcript | Text displayed on screen |
| UC-4 | Receive LLM response | Response text displayed |
| UC-5 | Hear response spoken | Audio plays through speakers |
| UC-6 | Recover from error | Message shown; return to idle |

## 7. Functional Requirements
**FR-1 Audio Capture**
* Capture mic audio via browser MediaRecorder (P0)
* Start on user interaction, stop on subsequent interaction (P0)
* Encode as webm or wav blob (P0)
* Handle permission denial gracefully (P0)

**FR-2 Speech-to-Text**
* Send audio blob to backend proxy (P0)
* Proxy forwards to Groq Whisper whisper-large-v3-turbo (P0)
* Display transcript in UI (P0)
* Surface empty/failed transcriptions as errors (P0)

**FR-3 LLM Response**
* Send transcript to Groq chat completion (P0)
* Use llama-3.3-70b-versatile or equivalent (P0)
* Constrain system prompt to limit response length (P0)
* Display response text (P0)
* Surface API/rate-limit failures as errors (P0)

**FR-4 Text-to-Speech**
* Convert response to audio via Edge TTS (P0)
* Browser SpeechSynthesis as fallback (P1)
* Auto-play on receipt (P0)
* On TTS failure, display text only (P0)

**FR-5 UI State**
* Display current state at all times (P0)
* Transitions visibly apparent (P0)
* Return to idle after every interaction (P0)

**FR-6 Error Handling**
* Every failure path produces a human-readable message (P0)
* System never fails silently (P0)
* System remains usable after any error (P0)

## 8. Non-Functional Requirements
| ID | Category | Requirement |
| :--- | :--- | :--- |
| NFR-1 | Performance | Latency ≤ 3.0 s |
| NFR-2 | Cost | Total cost $0 |
| NFR-3 | Compatibility | Chrome primary, Edge secondary |
| NFR-4 | Reliability | ≥ 80% success rate |
| NFR-5 | Security | Credentials never committed |
| NFR-6 | Security | Credentials never exposed to browser |
| NFR-7 | Maintainability | One module per pipeline stage |
| NFR-8 | Type safety | TypeScript on frontend |
| NFR-9 | Reproducibility | Runnable from clean clone via documented steps |

## 9. Architecture
```text
┌──────────────── Browser (React + Vite + TS) ────────────────┐
│                                                             │
│  [Mic] → MediaRecorder → audio blob                         │
│                                                             │
│  audio blob → POST /api/transcribe ──┐                      │
│  transcript ←────────────────────────┘                      │
│                                                             │
│  transcript → POST /api/chat ────────┐                      │
│  reply text ←────────────────────────┘                      │
│                                                             │
│  reply text → Edge TTS → <audio> → Speaker                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────── Express Proxy (local) ──────────────────────────┐
│  /api/transcribe → Groq Whisper                             │
│  /api/chat       → Groq LLM                                 │
│  Credentials from .env (never committed)                    │
└─────────────────────────────────────────────────────────────┘
```

## 10. Technical Stack
| Layer | Selection | Rationale |
| :--- | :--- | :--- |
| Frontend | React + Vite + TypeScript | Fast dev loop; typed state machine |
| Styling | Plain CSS | Single App.css file, zero dependencies |
| Backend | Node.js + Express | Thin credential proxy |
| STT | Groq Whisper whisper-large-v3-turbo | Free, reliable, same vendor as LLM |
| LLM | Groq llama-3.3-70b-versatile | Free tier, OpenAI-compatible |
| TTS | Edge TTS (fallback: SpeechSynthesis) | Free, neural voices, no key |

Rejected: MERN/MEAN/PERN (no DB needed) · VAPI/Retell/Bland (disallowed) · ElevenLabs (free tier too small) · Web Speech API for STT (inconsistent across browsers)

## 11. Error Handling
| ID | Scenario | Behavior |
| :--- | :--- | :--- |
| EC-1 | Mic permission denied | "Microphone access required." → idle |
| EC-2 | No speech detected | "No speech detected. Try again." → idle |
| EC-3 | STT fails | "Transcription failed. Try again." → idle |
| EC-4 | LLM fails | "Response failed. Try again." → idle |
| EC-5 | LLM rate limited | "Service busy. Try again shortly." → idle |
| EC-6 | TTS fails | Show text only → idle |
| EC-7 | Network unavailable | "Connection error." → idle |

## 12. Risks and Mitigations
| ID | Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| R-1 | Audio format mismatch | Medium | High | Validate on Day 1 |
| R-2 | Groq rate limit hit | Medium | Medium | Limit test frequency |
| R-3 | Web Speech API unreliable | High | High | Use Groq Whisper instead |
| R-4 | Latency exceeds target | Medium | Medium | Accept up to 3s; document |
| R-5 | Scope creep | High | High | Freeze scope Day 1 |
| R-6 | Single blocking bug | Medium | High | 45-min timebox; log and proceed |
| R-7 | Credentials committed | Low | High | .env + .gitignore first |

## 13. Timeline
| Day | Focus | Milestone |
| :--- | :--- | :--- |
| Fri | Setup, audio capture, STT | M1: Speech → transcript on screen |
| Sat | LLM + TTS + wiring | M2: Full pipeline works end-to-end once |
| Sun | Hardening, docs, rehearsal | M3: Repo complete; demo rehearsed |
| Mon | Demo | M4: Live demo delivered |

Scope is frozen on Friday. New ideas go to a "Phase 2" section.

## 14. Deliverables
* Code: Frontend, Express proxy, STT/LLM/TTS modules, error handling
* Repo: `main` branch, `phase1-voice-pipeline` branch, PR with description, daily commits
* Docs: README.md, progress.md, problems.md, .env.example, this PRD
* Demo: Live walkthrough, screenshots/video in PR, honest limitations

## 15. Acceptance Criteria
Phase 1 is complete when:
* User clicks, speaks, and receives a spoken response
* Transcript and response text are visible in the UI
* Pipeline succeeds in ≥ 8 of 10 attempts
* Latency measured and ≤ 3 seconds
* Every failure path produces a human-readable message
* Repo contains README.md, progress.md, problems.md
* problems.md documents ≥ 5 problems with root cause
* PR is reviewable with a clear description
* No credentials in repo history
* Demo delivered within 2 minutes

## 16. Future Phases
* **Phase 2**: Streaming audio · VAD · turn detection · conversation memory · provider fallback · higher-fidelity TTS · latency instrumentation
* **Phase 3**: Mobile support · deployment · user accounts · tool calling
