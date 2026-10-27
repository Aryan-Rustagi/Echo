import React from "react";

export function TrustStrip() {
  return (
    <div className="trust-strip-container" role="region" aria-label="Engine Specifications">
      <div className="trust-strip-hairline" aria-hidden="true" />
      <p className="trust-strip-text">
        Gemini Flash · ElevenLabs · Deepgram Nova-3 · Speechmatics · Express 5 · PostgreSQL
      </p>
    </div>
  );
}

export default TrustStrip;
