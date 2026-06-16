import React, { useEffect, useRef, useState } from 'react';
import { createSession, endSession, streamMessage, submitFeedback, getApiBase, setProxyUrl } from './api.js';
import FeedbackModal from './components/FeedbackModal.jsx';

let idSeq = 0;
const newId = () => `m${++idSeq}`;

export default function App() {
  const [status, setStatus] = useState('idle'); // idle | starting | active | ended
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]); // { id, role, text, streaming, progress }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false); // a turn is in flight
  const [error, setError] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function pushMessage(role, text, streaming = false) {
    const id = newId();
    setMessages((m) => [...m, { id, role, text, streaming, progress: null }]);
    return id;
  }
  function patchMessage(id, updater) {
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, ...updater(msg) } : msg)));
  }

  async function handleStart() {
    setError(null);
    setStatus('starting');
    try {
      const { sessionId: sid, messages: greeting } = await createSession();
      setSessionId(sid);
      setStatus('active');
      setMessages([]);
      if (greeting && greeting.length) greeting.forEach((g) => pushMessage('agent', g));
      else pushMessage('agent', 'Hi! How can I help you today?');
    } catch (err) {
      setStatus('idle');
      setError(friendlyError(err));
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy || status !== 'active') return;
    setInput('');
    setError(null);
    pushMessage('user', text);
    setBusy(true);

    const agentId = pushMessage('agent', '', true);

    // A turn can contain several messages. Each message streams as TextChunk
    // deltas, then an Inform carrying that message's full text. We collect
    // finished messages in `segments` and the in-flight one in `current`,
    // so the Inform never duplicates what the chunks already showed.
    const segments = [];
    let current = '';

    const render = () =>
      patchMessage(agentId, () => ({
        text: [...segments, ...(current ? [current] : [])].join('\n\n'),
      }));

    await streamMessage(sessionId, text, {
      onProgress: (t) => patchMessage(agentId, () => ({ progress: t })),
      onChunk: (t) => {
        current += t;
        patchMessage(agentId, (m) => ({
          text: [...segments, current].join('\n\n'),
          progress: null,
        }));
      },
      onInform: (t) => {
        // Authoritative full text for the current message segment.
        segments.push(t || current);
        current = '';
        patchMessage(agentId, () => ({ text: segments.join('\n\n'), progress: null }));
      },
      onEnd: () => {
        if (current) {
          segments.push(current);
          current = '';
        }
        patchMessage(agentId, (m) => ({
          streaming: false,
          progress: null,
          text: segments.join('\n\n') || m.text,
        }));
        setBusy(false);
      },
      onError: (err) => {
        patchMessage(agentId, () => ({ streaming: false, progress: null, text: '⚠️ ' + friendlyError(err) }));
        setBusy(false);
      },
    });
  }

  async function handleEnd() {
    if (!sessionId) return;
    try {
      await endSession(sessionId);
    } catch {
      /* end is best-effort */
    }
    setStatus('ended');
    setBusy(false);
    setShowFeedback(true);
  }

  async function handleFeedback(stars, comment) {
    setFeedbackSubmitting(true);
    try {
      await submitFeedback(sessionId, stars, comment);
      setToast('Thanks for your feedback! 🙌');
    } catch (err) {
      setToast('Could not submit feedback: ' + friendlyError(err));
    } finally {
      setFeedbackSubmitting(false);
      setShowFeedback(false);
      setSessionId(null);
    }
  }

  function handleSkipFeedback() {
    setShowFeedback(false);
    setSessionId(null);
  }

  function handleSettings() {
    const current = getApiBase();
    const next = window.prompt(
      'Proxy server URL (where your Agentforce proxy is hosted).\nLeave blank to use same-origin / dev proxy.',
      current,
    );
    if (next !== null) {
      setProxyUrl(next.trim());
      setToast('Proxy URL saved. Start a new chat to use it.');
    }
  }

  const canType = status === 'active' && !busy;

  return (
    <div className="app">
      <div className="chat-card">
        <header className="chat-header">
          <div className="brand">
            <div className="brand-mark">AF</div>
            <div>
              <div className="brand-title">Agentforce Assistant</div>
              <div className="brand-status">
                <span className={`dot ${status === 'active' ? 'live' : ''}`} />
                {status === 'active'
                  ? 'Connected'
                  : status === 'starting'
                    ? 'Connecting…'
                    : status === 'ended'
                      ? 'Session ended'
                      : 'Offline'}
              </div>
            </div>
          </div>
          <div className="header-actions">
            {status === 'active' && (
              <button className="btn danger sm" onClick={handleEnd}>
                End chat
              </button>
            )}
            <button className="icon-btn" title="Proxy settings" onClick={handleSettings}>
              ⚙
            </button>
          </div>
        </header>

        <div className="messages" ref={scrollRef}>
          {status === 'idle' && (
            <div className="welcome">
              <div className="welcome-art">💬</div>
              <h1>Chat with Agentforce</h1>
              <p>Start a session to talk with the agent in real time.</p>
              <button className="btn primary lg" onClick={handleStart}>
                Start chat
              </button>
              {error && <div className="error-box">{error}</div>}
            </div>
          )}

          {status === 'starting' && <div className="center-muted">Starting a session…</div>}

          {status !== 'idle' &&
            messages.map((m) => (
              <div key={m.id} className={`bubble-row ${m.role}`}>
                {m.role === 'agent' && <div className="avatar">AF</div>}
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

          {status === 'ended' && !showFeedback && (
            <div className="center-muted">
              <p>This session has ended.</p>
              <button className="btn primary" onClick={handleStart}>
                Start a new chat
              </button>
            </div>
          )}
        </div>

        {status === 'active' && (
          <div className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={canType ? 'Type your message…' : 'Agent is replying…'}
              rows={1}
              disabled={!canType}
            />
            <button className="btn primary send" onClick={handleSend} disabled={!canType || !input.trim()}>
              ➤
            </button>
          </div>
        )}

        {error && status === 'active' && <div className="error-strip">{error}</div>}
      </div>

      <div className="footer-note">
        Proxy: <code>{getApiBase() || '(dev / same-origin)'}</code>
      </div>

      {showFeedback && (
        <FeedbackModal
          onSubmit={handleFeedback}
          onSkip={handleSkipFeedback}
          submitting={feedbackSubmitting}
        />
      )}

      {toast && (
        <div className="toast" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}
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

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (msg.includes('Failed to fetch'))
    return 'Cannot reach the proxy server. Set the proxy URL via ⚙ and make sure it is running.';
  return msg;
}
