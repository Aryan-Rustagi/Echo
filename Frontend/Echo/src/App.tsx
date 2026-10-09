import { useState } from 'react';
import './App.css';

function App() {
  const [status, setStatus] = useState('idle');

  return (
    <div className="container">
      <h1>ECHO</h1>
      <p className="subtitle">Voice pipeline — Phase 1</p>
      
      <div className="actions">
        <button type="button">Start</button>
        <span className="status">Status: {status}</span>
      </div>

      <div className="blocks">
        <div className="block">
          <div className="label">You said</div>
          <div className="text-box"></div>
        </div>
        
        <div className="block">
          <div className="label">Echo said</div>
          <div className="text-box"></div>
        </div>
      </div>
    </div>
  );
}

export default App;
