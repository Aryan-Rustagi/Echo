import { useState, useRef } from 'react';
import { startRealtimeTranscription, stopRealtimeTranscription } from './pipeline/deepgram';
import { startSpeechmaticsTranscription, stopSpeechmaticsTranscription } from './pipeline/speechmatics';

type Status = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';
type Engine = 'deepgram' | 'speechmatics';

export default function LandingPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [engine, setEngine] = useState<Engine>('deepgram');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const finalizedTextRef = useRef('');
  const DEEPGRAM_API_KEY = "0e1835b889092a42aa9f25af413443e6e3bd7edd";
  const SPEECHMATICS_API_KEY = "7C5SeYxN6hQLTFtSyvTqO2HaJryEAuKr";

  const handleToggle = async () => {
    if (status === 'idle' || status === 'error') {
      try {
        setErrorMsg('');
        setTranscript('');
        finalizedTextRef.current = '';
        setStatus('recording');

        const onTranscript = (text: string, isFinal: boolean) => {
          if (isFinal) {
            finalizedTextRef.current += (finalizedTextRef.current ? ' ' : '') + text;
            setTranscript(finalizedTextRef.current);
          } else {
            setTranscript(finalizedTextRef.current + (finalizedTextRef.current ? ' ' : '') + text);
          }
        };

        const onError = (err: Error) => {
           setStatus('error');
           setErrorMsg(err.message || `${engine} access error.`);
           if (engine === 'deepgram') stopRealtimeTranscription();
           else stopSpeechmaticsTranscription();
        };

        if (engine === 'deepgram') {
          await startRealtimeTranscription(DEEPGRAM_API_KEY, onTranscript, onError);
        } else {
          await startSpeechmaticsTranscription(SPEECHMATICS_API_KEY, onTranscript, onError);
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Microphone access required.');
      }
    } else if (status === 'recording') {
      if (engine === 'deepgram') stopRealtimeTranscription();
      else stopSpeechmaticsTranscription();
      setStatus('idle');
    }
  };

  return (
    <div className="container">
      <h1>ECHO</h1>
      <p className="subtitle">Voice pipeline — Phase 1</p>
      
      <div className="actions">
        <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)} disabled={status !== 'idle' && status !== 'error'} style={{ marginRight: '10px', padding: '4px 8px' }}>
          <option value="deepgram">Deepgram</option>
          <option value="speechmatics">Speechmatics</option>
        </select>
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
