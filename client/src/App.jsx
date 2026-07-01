import React, { useEffect, useRef, useState } from 'react';
import { createSession, endSession, streamMessage, submitFeedback, getApiBase, setProxyUrl } from './api.js';
import FeedbackModal from './components/FeedbackModal.jsx';
import BankShell from './components/BankShell.jsx';
import ChatPanel from './components/ChatPanel.jsx';

let idSeq = 0;
const newId = () => `m${++idSeq}`;

export default function App() {
  const [status, setStatus] = useState('idle'); // idle | starting | active | ended
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
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
    setMessages([]);
    try {
      const { sessionId: sid, messages: greeting } = await createSession();
      setSessionId(sid);
      setStatus('active');
      if (greeting && greeting.length) greeting.forEach((g) => pushMessage('agent', g));
      else pushMessage('agent', 'Hi Alex! I\'m Ada, your Meridian assistant. How can I help you today?');
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

    const segments = [];
    let current = '';

    const render = () =>
      patchMessage(agentId, () => ({
        text: [...segments, ...(current ? [current] : [])].join('\n\n'),
        progress: null,
      }));

    const addChunk = (t) => {
      if (!t) return;
      if (current === t || current.endsWith(t)) return;
      if (current && t.startsWith(current)) current = t;
      else if (current.startsWith(t)) return;
      else current += t;
      render();
    };

    const finishSegment = (t) => {
      const finalText = (t && t.length >= current.length ? t : current).trim();
      if (finalText) segments.push(finalText);
      current = '';
      render();
    };

    await streamMessage(sessionId, text, {
      onProgress: (t) => patchMessage(agentId, () => ({ progress: t })),
      onChunk: addChunk,
      onInform: finishSegment,
      onEnd: () => {
        if (current) finishSegment();
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

  function resetChat() {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setInput('');
    setBusy(false);
    setStatus('idle');
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
      resetChat();
    }
  }

  function handleSkipFeedback() {
    setShowFeedback(false);
    resetChat();
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

  return (
    <>
      <BankShell onSettings={handleSettings}>
        <ChatPanel
          status={status}
          messages={messages}
          input={input}
          busy={busy}
          error={error}
          scrollRef={scrollRef}
          onInputChange={setInput}
          onStart={handleStart}
          onSend={handleSend}
          onEnd={handleEnd}
          onStartNew={handleStart}
        />
      </BankShell>

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
    </>
  );
}

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (msg.includes('Failed to fetch'))
    return 'Cannot reach the proxy server. Set the proxy URL via ⚙ and make sure it is running.';
  return msg;
}
