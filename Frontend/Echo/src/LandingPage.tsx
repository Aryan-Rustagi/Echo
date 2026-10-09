import { useState } from 'react';
import { startRecording, stopRecording } from './pipeline/recorder';
import { transcribe } from './pipeline/stt';

type Status = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export default function LandingPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleToggle = async () => {
    if (status === 'idle' || status === 'error') {
      try {
        setErrorMsg('');
        setTranscript('');
        await startRecording();
        setStatus('recording');
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Microphone access required.');
      }
    } else if (status === 'recording') {
      try {
        setStatus('transcribing');
        const audioBlob = await stopRecording();
        const text = await transcribe(audioBlob);
        
        if (!text) {
          throw new Error("No speech detected. Try again.");
        }
        
        setTranscript(text);
        setStatus('idle'); // Next phases will transition to 'thinking' here
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Transcription failed. Try again.');
      }
    }
  };

  return (
    <div className="container">
      <h1>ECHO</h1>
      <p className="subtitle">Voice pipeline — Phase 1</p>
      
      <div className="actions">
        <button 
          type="button" 
          onClick={handleToggle}
          disabled={status === 'transcribing' || status === 'thinking' || status === 'speaking'}
        >
          {status === 'recording' ? 'Stop' : 'Start'}
        </button>
        <span className="status">Status: {status}</span>
      </div>

      {status === 'error' && (
        <div style={{ color: '#d32f2f', marginBottom: '16px', fontSize: '14px', fontWeight: 'bold' }}>
          {errorMsg}
        </div>
      )}

      <div className="blocks">
        <div className="block">
          <div className="label">You said</div>
          <div className="text-box">{transcript}</div>
        </div>
        
        <div className="block">
          <div className="label">Echo said</div>
          <div className="text-box"></div>
        </div>
      </div>
    </div>
  );
}
