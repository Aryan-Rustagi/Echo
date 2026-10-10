import { useState } from "react";
import "./Cover.css";

interface CoverProps {
  onStart: () => void;
}

type TabKey = "architecture" | "fallbacks" | "challenges" | "deployment";

interface PipelineStep {
  name: string;
  badge: string;
  sub: string;
  tech: string;
  latency: string;
  desc: string;
  details: string[];
}

export default function Cover({ onStart }: CoverProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("architecture");
  const [selectedStep, setSelectedStep] = useState<number>(0);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const pipelineSteps: PipelineStep[] = [
    {
      name: "1. Audio Capture",
      badge: "Input Layer",
      sub: "Microphone & Web Audio",
      tech: "MediaStream API + ScriptProcessor / AudioWorklet",
      latency: "< 20ms",
      desc: "Captures user microphone audio at 16kHz PCM / Opus chunks with noise reduction and echo cancellation enabled.",
      details: [
        "AudioContext pre-warmed on initial user gesture to avoid mobile autoplay blocking",
        "Buffered chunk transmission over streaming WebSocket connection",
        "Silence detection timer for hands-free continuous conversational turn switching"
      ]
    },
    {
      name: "2. Speech-to-Text",
      badge: "STT Layer",
      sub: "Real-Time Streaming STT",
      tech: "Speechmatics Flow · Deepgram Nova-2 · OpenAI Whisper",
      latency: "150ms – 350ms",
      desc: "Streams audio chunks over WebSocket for instant partial and final transcripts with sub-second accuracy.",
      details: [
        "Primary: Speechmatics Flow WebSocket with live word-level confidence",
        "Secondary: Deepgram Nova-2 streaming WebSocket via ephemeral backend tokens",
        "Tertiary Fallback: Whisper REST API using recorded audio blobs if sockets disconnect"
      ]
    },
    {
      name: "3. LLM Reasoning",
      badge: "Inference Layer",
      sub: "Token-by-Token Streaming",
      tech: "Google Gemini 1.5 Flash · OpenAI GPT-4o-mini",
      latency: "200ms – 400ms TTFT",
      desc: "Streams language model output via Server-Sent Events (SSE) directly into the sentence chunking buffer.",
      details: [
        "Primary: Gemini 1.5 Flash for ultra-low Time-To-First-Token (TTFT)",
        "Secondary Fallback: OpenAI GPT-4o-mini SSE stream with conversation history",
        "System prompt calibrated for concise, conversational voice output (< 35 words/turn)"
      ]
    },
    {
      name: "4. Sentence Chunker",
      badge: "Pipelining Layer",
      sub: "Boundary Detection",
      tech: "Regex Punctuation Boundary Parser",
      latency: "< 5ms",
      desc: "Splits streaming LLM tokens into complete grammatical sentences the instant punctuation is received.",
      details: [
        "Detects periods, question marks, and exclamation points while ignoring decimals/acronyms",
        "Sends Sentence 1 to TTS synthesis while the LLM is still generating Sentence 2",
        "Eliminates 2–4 seconds of dead silence compared to waiting for the full response"
      ]
    },
    {
      name: "5. TTS & Speaker",
      badge: "Output Layer",
      sub: "Audio Queue & Playback",
      tech: "ElevenLabs Flash v2.5 · Piper ONNX · Web SpeechSynthesis",
      latency: "250ms – 450ms",
      desc: "Parallel audio fetching and FIFO decoding with seamless, non-overlapping playback via Web Audio API.",
      details: [
        "Primary: ElevenLabs Flash v2.5 REST API with mp3_22050_32 high-throughput streaming",
        "Secondary: Piper neural voice ONNX model on server fallback",
        "Tertiary: Browser Web SpeechSynthesis with character-length watchdog recovery"
      ]
    }
  ];

  function handleCopy(command: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(command);
      setCopiedCmd(command);
      setTimeout(() => setCopiedCmd(null), 2000);
    }
  }

  return (
    <div className="cover-page">
      {/* Top Navigation & Status */}
      <header className="cover-header">
        <div className="brand-group">
          <span className="cover-tag">Echo Engine · Production</span>
          <span className="status-badge live">● Active Pipeline</span>
        </div>
        <button className="launch-btn header-launch" onClick={onStart}>
          Launch Assistant →
        </button>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <h1 className="hero-title">ECHO</h1>
        <p className="hero-subtitle">
          From-Scratch Sub-Second Voice AI Pipeline with Multi-API Fallback & Docker Orchestration
        </p>
        <p className="hero-desc">
          Echo is an autonomous conversational voice agent built without managed platforms (no Vapi, Retell, or LangChain wrappers). 
          Engineered with streaming WebSockets, Server-Sent Events, pipelined sentence-boundary chunking, and resilient multi-tier fallbacks for speech, reasoning, and synthesis.
        </p>

        <div className="metrics-strip">
          <div className="metric-card">
            <span className="metric-val">~650ms</span>
            <span className="metric-lbl">Time to First Audio</span>
          </div>
          <div className="metric-card">
            <span className="metric-val">3-Tier</span>
            <span className="metric-lbl">Automated Fallback Chain</span>
          </div>
          <div className="metric-card">
            <span className="metric-val">100%</span>
            <span className="metric-lbl">Web Audio & Native SSE</span>
          </div>
          <div className="metric-card">
            <span className="metric-val">Docker</span>
            <span className="metric-lbl">Railway Cloud Ready</span>
          </div>
        </div>

        <div className="hero-actions">
          <button className="launch-btn hero-launch" onClick={onStart}>
            <span>Start Voice Assistant</span>
            <span className="btn-arrow">→</span>
          </button>
          <span className="quick-note">Mobile & Tablet Optimized · Voice & Push-to-Talk</span>
        </div>
      </section>

      {/* Interactive Tabs */}
      <nav className="tab-navigation" aria-label="Documentation Sections">
        <button
          className={`tab-btn ${activeTab === "architecture" ? "active" : ""}`}
          onClick={() => setActiveTab("architecture")}
        >
          <span className="tab-icon">🏗</span>
          <span>Pipeline Flow</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "fallbacks" ? "active" : ""}`}
          onClick={() => setActiveTab("fallbacks")}
        >
          <span className="tab-icon">🛡</span>
          <span>Fallback Matrix</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "challenges" ? "active" : ""}`}
          onClick={() => setActiveTab("challenges")}
        >
          <span className="tab-icon">⚡</span>
          <span>Problems & Fixes</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "deployment" ? "active" : ""}`}
          onClick={() => setActiveTab("deployment")}
        >
          <span className="tab-icon">🐳</span>
          <span>Docker & Railway</span>
        </button>
      </nav>

      {/* TAB 1: Architecture & Interactive Pipeline */}
      {activeTab === "architecture" && (
        <section className="tab-content" id="architecture-panel">
          <div className="section-header">
            <h2>Interactive Pipeline Architecture</h2>
            <p>
              Tap or click any stage to inspect its data flow, latency profile, and internal concurrency design.
            </p>
          </div>

          <div className="pipeline-stepper" role="tablist">
            {pipelineSteps.map((step, idx) => (
              <button
                key={step.name}
                className={`step-btn ${selectedStep === idx ? "selected" : ""}`}
                onClick={() => setSelectedStep(idx)}
                role="tab"
                aria-selected={selectedStep === idx}
              >
                <div className="step-num">{idx + 1}</div>
                <div className="step-text">
                  <div className="step-name">{step.name.replace(/^\d+\.\s*/, "")}</div>
                  <div className="step-sub">{step.badge}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="pipeline-detail-card">
            <div className="detail-header">
              <div>
                <span className="detail-badge">{pipelineSteps[selectedStep].badge}</span>
                <h3 className="detail-title">{pipelineSteps[selectedStep].name}</h3>
                <div className="detail-tech">{pipelineSteps[selectedStep].tech}</div>
              </div>
              <div className="latency-badge">
                <span className="latency-lbl">Avg Latency</span>
                <span className="latency-val">{pipelineSteps[selectedStep].latency}</span>
              </div>
            </div>

            <p className="detail-desc">{pipelineSteps[selectedStep].desc}</p>

            <div className="detail-bullets">
              <h4>Engineering Highlights</h4>
              <ul>
                {pipelineSteps[selectedStep].details.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="arch-diagram-card">
            <h4>Full Concurrency Diagram</h4>
            <div className="code-diagram">
              <pre>{`[User Voice] ──(Microphone 16kHz)──> [Web Audio API]
                                             │
                                   (Streaming WebSocket)
                                             ▼
                                   [STT: Speechmatics / Deepgram]
                                             │  (Finalized Words)
                                             ▼
                                   [LLM: Gemini / OpenAI SSE]
                                             │  (Token Stream)
                                             ▼
                                   [Sentence Boundary Chunker]
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   ▼                                                   ▼
         Sentence 1 Generated                                Sentence 2 Streaming...
         [TTS: ElevenLabs / Browser]                         [LLM Generating Tokens]
                   │
                   ▼ (AudioBuffer Decoded)
         [AudioContext FIFO Queue] ──> [Device Speaker] (User hears voice!)`}</pre>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: Multi-API Fallback System */}
      {activeTab === "fallbacks" && (
        <section className="tab-content" id="fallbacks-panel">
          <div className="section-header">
            <h2>Multi-API Automated Fallback System</h2>
            <p>
              Echo guarantees zero downtime. If any vendor encounters rate-limits, invalid tokens, or network interruptions, the system automatically falls back to secondary and tertiary providers in real time.
            </p>
          </div>

          <div className="matrix-grid">
            {/* STT Card */}
            <div className="matrix-card">
              <div className="matrix-card-header stt-header">
                <h3>Speech-to-Text (STT)</h3>
                <span className="layer-tag">Input Transcription</span>
              </div>
              <div className="tier-list">
                <div className="tier-row primary">
                  <span className="tier-badge">Tier 1 Primary</span>
                  <div className="tier-info">
                    <strong>Speechmatics Flow</strong>
                    <p>Low-latency streaming WebSocket with live word alignment and high noise tolerance.</p>
                  </div>
                </div>
                <div className="tier-row secondary">
                  <span className="tier-badge">Tier 2 Backup</span>
                  <div className="tier-info">
                    <strong>Deepgram Nova-2</strong>
                    <p>Sub-200ms real-time WebSocket transcription with smart punctuation and speech-final events.</p>
                  </div>
                </div>
                <div className="tier-row fallback">
                  <span className="tier-badge">Tier 3 Fallback</span>
                  <div className="tier-info">
                    <strong>OpenAI Whisper API</strong>
                    <p>REST audio upload fallback if streaming sockets are blocked by restrictive firewalls.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* LLM Card */}
            <div className="matrix-card">
              <div className="matrix-card-header llm-header">
                <h3>Language Model (LLM)</h3>
                <span className="layer-tag">Reasoning & Chat</span>
              </div>
              <div className="tier-list">
                <div className="tier-row primary">
                  <span className="tier-badge">Tier 1 Primary</span>
                  <div className="tier-info">
                    <strong>Google Gemini 1.5 Flash</strong>
                    <p>Ultra-low Time-to-First-Token (~200ms) with concise conversational conditioning.</p>
                  </div>
                </div>
                <div className="tier-row secondary">
                  <span className="tier-badge">Tier 2 Backup</span>
                  <div className="tier-info">
                    <strong>OpenAI GPT-4o-mini</strong>
                    <p>Reliable streaming server-sent events fallback with full multi-turn conversational history.</p>
                  </div>
                </div>
                <div className="tier-row fallback">
                  <span className="tier-badge">Context Sync</span>
                  <div className="tier-info">
                    <strong>In-Memory Turn History</strong>
                    <p>Maintains user and assistant turn memory while pruning oldest context to stay within token budgets.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* TTS Card */}
            <div className="matrix-card">
              <div className="matrix-card-header tts-header">
                <h3>Text-to-Speech (TTS)</h3>
                <span className="layer-tag">Voice Synthesis</span>
              </div>
              <div className="tier-list">
                <div className="tier-row primary">
                  <span className="tier-badge">Tier 1 Primary</span>
                  <div className="tier-info">
                    <strong>ElevenLabs Flash v2.5</strong>
                    <p>Ultra-expressive neural voice with 22kHz MP3 streaming synthesis in ~300ms.</p>
                  </div>
                </div>
                <div className="tier-row secondary">
                  <span className="tier-badge">Tier 2 Backup</span>
                  <div className="tier-info">
                    <strong>Piper Local ONNX</strong>
                    <p>Server-side offline neural voice synthesis when internet speech APIs are unavailable.</p>
                  </div>
                </div>
                <div className="tier-row fallback">
                  <span className="tier-badge">Tier 3 Fallback</span>
                  <div className="tier-info">
                    <strong>Web SpeechSynthesis</strong>
                    <p>100% in-browser offline speech engine with character-length watchdog recovery.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Problems Faced & Solutions */}
      {activeTab === "challenges" && (
        <section className="tab-content" id="challenges-panel">
          <div className="section-header">
            <h2>Engineering Challenges & Solutions</h2>
            <p>
              Building a real-time voice pipeline from scratch exposes unique concurrency, timing, and cross-browser edge cases. Here is how each issue was resolved.
            </p>
          </div>

          <div className="challenges-grid">
            {/* Challenge 1 */}
            <div className="challenge-card">
              <div className="challenge-badge">Concurreny & State</div>
              <h3>1. Stuck "Stop Recording" & WebSocket Closure Races</h3>
              <div className="problem-block">
                <strong>Problem:</strong> Rapidly clicking "Stop Recording" while speech was still streaming caused race conditions where state variables remained stuck in <code>recording</code> mode while MediaRecorder had already stopped.
              </div>
              <div className="solution-block">
                <strong>Solution:</strong> Decoupled UI state from asynchronous closures using mutable <code>statusRef</code> and <code>turnActiveRef</code> locks. Added a safety timeout to force media track disconnection if the recorder event does not fire within 1.5s.
              </div>
            </div>

            {/* Challenge 2 */}
            <div className="challenge-card">
              <div className="challenge-badge">Browser Audio Bug</div>
              <h3>2. Chrome & Safari SpeechSynthesis Frozen Playback</h3>
              <div className="problem-block">
                <strong>Problem:</strong> Mobile browsers often fail to fire the <code>onend</code> event when synthesizing long sentences, locking the audio queue and halting all future voice responses.
              </div>
              <div className="solution-block">
                <strong>Solution:</strong> Implemented a dynamic watchdog timer proportional to utterance length (<code>watchdogMs = text.length * 90 + 3000</code>). If the browser fails to fire <code>onend</code>, the watchdog automatically resolves the item and frees the queue.
              </div>
            </div>

            {/* Challenge 3 */}
            <div className="challenge-card">
              <div className="challenge-badge">Latency Optimization</div>
              <h3>3. Eliminating Audio Stutter Between Sentences</h3>
              <div className="problem-block">
                <strong>Problem:</strong> Calling TTS only after the entire LLM answer completes introduced 2 to 4 seconds of uncomfortable silence before the user heard anything.
              </div>
              <div className="solution-block">
                <strong>Solution:</strong> Built a sentence-boundary regex splitter that slices tokens at punctuation marks (<code>.!?</code>). Sentence 1 is dispatched to ElevenLabs immediately while Sentence 2 is still being streamed from Gemini/OpenAI.
              </div>
            </div>

            {/* Challenge 4 */}
            <div className="challenge-card">
              <div className="challenge-badge">Security Architecture</div>
              <h3>4. Private API Key Protection vs. WebSocket Streaming</h3>
              <div className="problem-block">
                <strong>Problem:</strong> Connecting directly to Deepgram/Speechmatics from the browser exposes private API keys to the client DevTools.
              </div>
              <div className="solution-block">
                <strong>Solution:</strong> The Node/Express backend acts as an ephemeral token authority (<code>/api/stt-keys/*</code>). It validates client requests, applies IP rate limiting, and issues short-lived single-use tokens without exposing master keys.
              </div>
            </div>

            {/* Challenge 5 */}
            <div className="challenge-card">
              <div className="challenge-badge">DevOps & Networking</div>
              <h3>5. Deployment CORS & Dynamic Port Assignment</h3>
              <div className="problem-block">
                <strong>Problem:</strong> Hosting frontend and backend on separate servers resulted in CORS preflight penalties and mixed-content SSL blocking on mobile browsers.
              </div>
              <div className="solution-block">
                <strong>Solution:</strong> Bundled the entire stack into a unified multi-stage Docker container. The Express backend serves both <code>/api/*</code> endpoints and static frontend assets on Railway's dynamic <code>$PORT</code> with host-aware CORS middleware.
              </div>
            </div>

            {/* Challenge 6 */}
            <div className="challenge-card">
              <div className="challenge-badge">User Experience</div>
              <h3>6. Real-Time Interruption (Barge-In)</h3>
              <div className="problem-block">
                <strong>Problem:</strong> If the user starts speaking while the assistant is talking, overlapping audio creates chaos.
              </div>
              <div className="solution-block">
                <strong>Solution:</strong> Tapping the microphone immediately calls <code>stopAll()</code>, which aborts ongoing HTTP requests, clears the AudioContext FIFO queue, and calls <code>speechSynthesis.cancel()</code> before opening the microphone.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: Docker & Railway Deployment */}
      {activeTab === "deployment" && (
        <section className="tab-content" id="deployment-panel">
          <div className="section-header">
            <h2>Docker & Railway Deployment</h2>
            <p>
              Echo is containerized with a production multi-stage Docker build, preconfigured for one-click deployment on Railway or any container host.
            </p>
          </div>

          <div className="deploy-steps-grid">
            <div className="deploy-card">
              <div className="step-tag">Step 1 · Multi-Stage Dockerfile</div>
              <h3>Optimized Container Build</h3>
              <p>
                Separates the build environment from the production runner to minimize container image size and accelerate deployments.
              </p>
              <div className="code-box">
                <pre>{`# Stage 1: Build Frontend (Vite + React)
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY Frontend/Echo/package*.json ./Frontend/Echo/
RUN cd Frontend/Echo && npm ci
COPY Frontend/Echo ./Frontend/Echo
RUN cd Frontend/Echo && npm run build

# Stage 2: Production Server (Node 20 Alpine)
FROM node:20-alpine AS runner
WORKDIR /app/Backend
COPY Backend/package*.json ./
RUN npm ci --omit=dev
COPY Backend/ ./
COPY --from=frontend-builder /app/Frontend/Echo/dist ./public
EXPOSE 3000
CMD ["node", "server.js"]`}</pre>
              </div>
            </div>

            <div className="deploy-card">
              <div className="step-tag">Step 2 · Local Testing</div>
              <h3>Run with Docker Compose</h3>
              <p>
                Test the production container locally with healthchecks and automatic <code>.env</code> file injection.
              </p>
              <div className="command-row">
                <code>docker compose up --build</code>
                <button
                  className="copy-btn"
                  onClick={() => handleCopy("docker compose up --build")}
                >
                  {copiedCmd === "docker compose up --build" ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="subtext">
                Echo will start on <code>http://localhost:3000</code> with health status verified via <code>/api/health</code>.
              </p>
            </div>

            <div className="deploy-card">
              <div className="step-tag">Step 3 · Cloud Deployment</div>
              <h3>Railway Zero-Config Deployment</h3>
              <p>
                Railway detects the root <code>railway.json</code> and builds the Dockerfile automatically.
              </p>
              <ol className="deploy-ol">
                <li>Push your repository branch to GitHub.</li>
                <li>In Railway Dashboard, select <strong>New Project → Deploy from GitHub repo</strong>.</li>
                <li>Add your API keys in the <strong>Variables</strong> tab (<code>OPENAI_API_KEY</code>, <code>DEEPGRAM_API_KEY</code>, etc.).</li>
                <li>Railway auto-assigns <code>$PORT</code>, provides free HTTPS, and mounts your voice assistant live!</li>
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* Bottom Floating CTA Bar */}
      <footer className="cover-footer-banner">
        <div className="footer-content">
          <div>
            <h3 className="footer-title">Ready to test the pipeline?</h3>
            <p className="footer-desc">Experience real-time speech transcription, LLM streaming, and low-latency voice feedback.</p>
          </div>
          <button className="launch-btn footer-launch" onClick={onStart}>
            <span>Launch Echo Assistant</span>
            <span className="btn-arrow">→</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
