import { useState, useRef, useEffect } from 'react';
import { startRealtimeTranscription, stopRealtimeTranscription } from './pipeline/deepgram';
import { startSpeechmaticsTranscription, stopSpeechmaticsTranscription } from './pipeline/speechmatics';
import { getResponse } from './pipeline/llm';
import { speak } from './pipeline/tts';

type Status = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';
type Engine = 'deepgram' | 'speechmatics';

export default function LandingPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [engine, setEngine] = useState<Engine>('deepgram');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const finalizedTextRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTurnRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const handleToggle = async () => {
    if (status === 'idle' || status === 'error') {
      try {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        setErrorMsg('');
        setTranscript('');
        setResponse('');
        finalizedTextRef.current = '';
        setStatus('recording');

        const finishTurn = async () => {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }

          if (engine === 'deepgram') stopRealtimeTranscription();
          else stopSpeechmaticsTranscription();

          const currentText = finalizedTextRef.current.trim();
          if (!currentText) {
            setErrorMsg('No speech detected. Try again.');
            setStatus('error');
            return;
          }

          try {
            setStatus('thinking');
            const reply = await getResponse(currentText);
            setResponse(reply);

            if (reply) {
              setStatus('speaking');
              try {
                await speak(reply);
              } catch (ttsErr: any) {
                console.warn('TTS failed, text displayed instead:', ttsErr);
              }
            }
          } catch (err: any) {
            setErrorMsg(err.message || 'LLM error');
            setStatus('error');
            return;
          }

          setStatus('idle');
        };
        finishTurnRef.current = finishTurn;

        const onTranscript = (text: string, isFinal: boolean) => {
          if (isFinal) {
            finalizedTextRef.current += (finalizedTextRef.current ? ' ' : '') + text;
            setTranscript(finalizedTextRef.current);
          } else {
            setTranscript(finalizedTextRef.current + (finalizedTextRef.current ? ' ' : '') + text);
          }

          if (finalizedTextRef.current.trim()) {
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }
            silenceTimerRef.current = setTimeout(() => {
              void finishTurn();
            }, 1200);
          }
        };

        const onError = (err: Error) => {
           setStatus('error');
           setErrorMsg(err.message || `${engine} access error.`);
           if (engine === 'deepgram') stopRealtimeTranscription();
           else stopSpeechmaticsTranscription();
        };

        if (engine === 'deepgram') {
          await startRealtimeTranscription(onTranscript, onError);
        } else {
          await startSpeechmaticsTranscription(onTranscript, onError);
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Microphone access required.');
      }
    } else if (status === 'recording') {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      void finishTurnRef.current?.();
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
          <div className="text-box">{response}</div>
        </div>
      </div>
    </div>
  );
}
