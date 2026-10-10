import "./Cover.css";

interface CoverProps {
  onStart: () => void;
}

export default function Cover({ onStart }: CoverProps) {
  return (
    <div className="cover-page">
      <h1>ECHO</h1>
      <p className="subtitle">A from-scratch voice AI pipeline. Phase 1.</p>
      <p className="description">
        Speak into the microphone. Echo transcribes your speech, generates a reply with an LLM, and speaks the response back. No managed voice AI platform.
      </p>

      <h2>Architecture</h2>
      <div className="diagram-box">
        Mic → STT → LLM → TTS → Speaker
      </div>

      <h2>Stack</h2>
      <table className="stack-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Choice</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Frontend</td>
            <td>React + Vite + TypeScript</td>
            <td>Fast dev loop, typed state</td>
          </tr>
          <tr>
            <td>Backend</td>
            <td>Node.js + Express</td>
            <td>Hides API keys from the browser</td>
          </tr>
          <tr>
            <td>STT</td>
            <td>Deepgram + Speechmatics</td>
            <td>Real-time and batch transcription</td>
          </tr>
          <tr>
            <td>LLM</td>
            <td>Groq (with Gemini fallback)</td>
            <td>Low latency, generous free tier</td>
          </tr>
          <tr>
            <td>TTS</td>
            <td>Piper + ElevenLabs</td>
            <td>Offline primary, cloud fallback</td>
          </tr>
        </tbody>
      </table>

      <h2>APIs used</h2>
      <ul className="api-list">
        <li>Deepgram (streaming STT)</li>
        <li>Speechmatics (batch STT)</li>
        <li>Groq (LLM)</li>
        <li>Google Gemini (LLM fallback)</li>
        <li>ElevenLabs (TTS fallback)</li>
        <li>Piper (local TTS)</li>
      </ul>

      <button className="launch-btn" onClick={onStart}>
        Launch Echo →
      </button>

      <footer className="cover-footer">
        Repo · README · problems.md
      </footer>
    </div>
  );
}
