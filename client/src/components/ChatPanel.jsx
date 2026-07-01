import React from 'react';

// The Agentforce chat, embedded as a right-column panel inside the bank shell.
// All session lifecycle + streaming logic lives in App.jsx; this is presentation.

export default function ChatPanel({
  status,
  messages,
  input,
  busy,
  error,
  scrollRef,
  onInputChange,
  onStart,
  onSend,
  onEnd,
  onStartNew,
}) {
  const canType = status === 'active' && !busy;

  return (
    <div className="chat-panel">
      <header className="chat-head">
        <div className="chat-head-left">
          <div className="chat-avatar">AI</div>
          <div>
            <div className="chat-title">Ask Ada</div>
            <div className="chat-status">
              <span className={`dot ${status === 'active' ? 'live' : ''}`} />
              {status === 'active'
                ? 'Online · replies instantly'
                : status === 'starting'
                  ? 'Connecting…'
                  : status === 'ended'
                    ? 'Session ended'
                    : 'Your Meridian AI assistant'}
            </div>
          </div>
        </div>
        {status === 'active' && (
          <button className="btn danger sm" onClick={onEnd}>
            End chat
          </button>
        )}
      </header>

      <div className="chat-body" ref={scrollRef}>
        {status === 'idle' && (
          <ChatWelcome onStart={onStart} error={error} />
        )}

        {status === 'starting' && (
          <div className="chat-empty">
            <div className="loader" />
            <p>Starting a secure session…</p>
          </div>
        )}

        {status !== 'idle' && messages.length > 0 && (
          <div className="chat-thread">
            {messages.map((m) => (
              <div key={m.id} className={`bubble-row ${m.role}`}>
                {m.role === 'agent' && <div className="mini-avatar">AI</div>}
                <div className={`bubble ${m.role} ${m.streaming && !m.text ? 'thinking' : ''}`}>
                  {m.role === 'agent' && m.streaming && !m.text ? (
                    <>
                      <TypingDots />
                      <span className="thinking-text">
                        {m.progress && m.progress !== '…' ? m.progress : 'Thinking…'}
                      </span>
                    </>
                  ) : (
                    <>
                      {m.text}
                      {m.streaming && m.text && <span className="caret" />}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {status === 'ended' && (
          <div className="chat-ended">
            <div className="chat-ended-icon">✅</div>
            <h3>Your chat has ended</h3>
            <p>Need something else? Start a fresh conversation with Ada anytime.</p>
            <button className="btn primary lg" onClick={onStartNew}>
              Start a new chat
            </button>
          </div>
        )}
      </div>

      {status === 'active' && (
        <div className="chat-composer">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={canType ? 'Ask about your accounts, cards, or spending…' : 'Ada is replying…'}
            rows={1}
            disabled={!canType}
          />
          <button
            className="btn primary send"
            onClick={onSend}
            disabled={!canType || !input.trim()}
            title="Send"
          >
            ➤
          </button>
        </div>
      )}

      {error && status === 'active' && <div className="chat-error">{error}</div>}
    </div>
  );
}

function ChatWelcome({ onStart, error }) {
  const suggestions = [
    'What did I spend on dining this month?',
    'How is my credit score trending?',
    'Help me set up a savings goal',
  ];
  return (
    <div className="chat-welcome">
      <div className="welcome-badge">🤖 Agentforce</div>
      <h2>Meet Ada, your AI money coach</h2>
      <p>
        Ask Ada anything about your accounts, cards, spending, or credit —
        powered by Salesforce Agentforce.
      </p>
      <button className="btn primary lg full" onClick={onStart}>
        Start chat
      </button>
      <div className="welcome-hints">
        {suggestions.map((s) => (
          <div className="hint" key={s}>💬 {s}</div>
        ))}
      </div>
      {error && <div className="chat-error inline">{error}</div>}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="typing">
      <span />
      <span />
      <span />
    </span>
  );
}
