import React, { useRef, useEffect } from "react";
import type { Message } from "../../pipeline/llm";
import type { VoiceStatus } from "../../pipeline/useVoiceSession";

export interface TranscriptProps {
  messages: Message[];
  interimTranscript: string;
  finalTranscript: string;
  assistantStreamingText: string;
  status: VoiceStatus;
}

export function Transcript({
  messages,
  interimTranscript,
  finalTranscript,
  assistantStreamingText,
  status,
}: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(function autoScroll() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimTranscript, finalTranscript, assistantStreamingText, status]);

  function copyText(text: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }

  const isUserSpeaking = status === "listening" || status === "transcribing";
  const isAssistantThinkingOrSpeaking =
    (status === "thinking" || status === "speaking") && assistantStreamingText.length > 0;

  const hasContent =
    messages.length > 0 ||
    isUserSpeaking ||
    isAssistantThinkingOrSpeaking;

  return (
    <div
      ref={scrollRef}
      className="echo-transcript-scroll"
      role="log"
      aria-live="polite"
      aria-label="Conversation Transcript"
    >
      {!hasContent ? (
        <div className="echo-transcript-empty">
          <div className="echo-empty-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5v14M7 5v14M2 9v6M22 9v6" />
            </svg>
          </div>
          <p className="echo-empty-title">Ready for conversation</p>
          <p className="echo-empty-desc">
            Tap the microphone button or press <strong>Spacebar</strong> to speak. Echo streams responses sentence by sentence.
          </p>
        </div>
      ) : (
        <div className="echo-transcript-list">
          {messages.map(function renderMessage(msg, index) {
            const isUser = msg.role === "user";
            return (
              <div
                key={`msg-${index}`}
                className={`echo-msg-row ${isUser ? "echo-msg-user" : "echo-msg-assistant"}`}
              >
                <div className="echo-msg-header">
                  <span className="echo-msg-speaker">
                    {isUser ? "You" : "Echo"}
                  </span>
                  <button
                    type="button"
                    className="echo-msg-copy-btn"
                    onClick={function handleCopy() {
                      copyText(msg.content);
                    }}
                    title="Copy text"
                    aria-label={`Copy ${isUser ? "your message" : "Echo's response"}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
                <div className="echo-msg-bubble">
                  {msg.content}
                </div>
              </div>
            );
          })}

          {/* Current User Turn: Solid Final Text + Muted Interim Text */}
          {isUserSpeaking && (finalTranscript || interimTranscript) && (
            <div className="echo-msg-row echo-msg-user active-turn">
              <div className="echo-msg-header">
                <span className="echo-msg-speaker">You (speaking)</span>
              </div>
              <div className="echo-msg-bubble active-speech">
                {finalTranscript && (
                  <span className="echo-text-solid">{finalTranscript} </span>
                )}
                {interimTranscript && (
                  <span className="echo-text-interim">{interimTranscript}</span>
                )}
              </div>
            </div>
          )}

          {/* Current Assistant Turn: Streaming Reply */}
          {isAssistantThinkingOrSpeaking && (
            <div className="echo-msg-row echo-msg-assistant active-turn">
              <div className="echo-msg-header">
                <span className="echo-msg-speaker">Echo (replying)</span>
              </div>
              <div className="echo-msg-bubble streaming-reply">
                <span>{assistantStreamingText}</span>
                <span className="echo-streaming-cursor" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Transcript;
