// ────────────────────────────────────────────────────────────────────────────
// Thin client for the Agentforce proxy.
//
// In dev, API_BASE is "" so calls hit /api/* and Vite proxies them to :8787.
// On GitHub Pages, set the proxy URL at runtime (Settings ⚙ in the UI, stored in
// localStorage) or at build time via VITE_PROXY_URL.
// ────────────────────────────────────────────────────────────────────────────

export function getApiBase() {
  const runtime = (typeof localStorage !== 'undefined' && localStorage.getItem('af_proxyUrl')) || '';
  const build = import.meta.env.VITE_PROXY_URL || '';
  return (runtime || build || '').replace(/\/$/, '');
}

export function setProxyUrl(url) {
  if (url) localStorage.setItem('af_proxyUrl', url.replace(/\/$/, ''));
  else localStorage.removeItem('af_proxyUrl');
}

async function jsonOrThrow(resp) {
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error ? JSON.stringify(data.error) : `Request failed (${resp.status})`);
  return data;
}

export async function createSession() {
  const resp = await fetch(`${getApiBase()}/api/session`, { method: 'POST' });
  return jsonOrThrow(resp); // { sessionId, messages: [...] }
}

export async function endSession(sessionId) {
  const resp = await fetch(`${getApiBase()}/api/session/${sessionId}`, { method: 'DELETE' });
  return jsonOrThrow(resp);
}

export async function submitFeedback(sessionId, stars, comment) {
  const resp = await fetch(`${getApiBase()}/api/session/${sessionId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars, comment }),
  });
  return jsonOrThrow(resp);
}

// Pull text out of an event payload regardless of the exact shape the API uses.
function pickText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data.message === 'string') return data.message;
  if (data.message && typeof data.message.message === 'string') return data.message.message;
  if (typeof data.text === 'string') return data.text;
  return '';
}

// Stream a user message. Callbacks fire as Server-Sent Events arrive:
//   onProgress(text)  — agent is working ("One moment while I check…")
//   onChunk(text)     — incremental answer text (append)
//   onInform(text)    — the complete message (replace)
//   onEnd()           — turn complete
//   onError(err)
export async function streamMessage(sessionId, text, handlers = {}) {
  const { onProgress, onChunk, onInform, onEnd, onError } = handlers;
  let resp;
  try {
    resp = await fetch(`${getApiBase()}/api/session/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    onError?.(err);
    return;
  }

  if (!resp.ok || !resp.body) {
    const data = await resp.json().catch(() => ({}));
    onError?.(new Error(data.error ? JSON.stringify(data.error) : `Stream failed (${resp.status})`));
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (rawEvent) => {
    const lines = rawEvent.split('\n');
    let eventName = '';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length && !eventName) return;

    let data = {};
    const dataStr = dataLines.join('\n');
    try {
      data = dataStr ? JSON.parse(dataStr) : {};
    } catch {
      data = dataStr;
    }

    // The event name shows up inconsistently — sometimes on the SSE `event:`
    // line, sometimes only inside the JSON — and the casing varies too
    // (ProgressIndicator vs PROGRESS_INDICATOR). Normalize every candidate and
    // match the first known type, so a progress indicator is never mistaken for
    // body text and concatenated onto the agent's actual reply.
    const norm = (s) => String(s || '').replace(/[^a-z]/gi, '').toLowerCase();
    const KNOWN = {
      progressindicator: 'ProgressIndicator',
      textchunk: 'TextChunk',
      inform: 'Inform',
      validationfailurechunk: 'Inform',
      endofturn: 'EndOfTurn',
    };
    const candidates = [eventName, data?.type, data?.message?.type].map(norm);
    const type = candidates.map((c) => KNOWN[c]).find(Boolean) || candidates.find(Boolean) || '';
    const txt = pickText(data);

    switch (type) {
      case 'ProgressIndicator':
        onProgress?.(txt || 'Working on it…');
        break;
      case 'TextChunk':
        if (txt) onChunk?.(txt);
        break;
      case 'Inform':
        if (txt) onInform?.(txt);
        break;
      case 'EndOfTurn':
        onEnd?.();
        break;
      default:
        // Unknown event — log for debugging during the demo, surface any text.
        if (txt) onChunk?.(txt);
        // eslint-disable-next-line no-console
        console.debug('[agentforce] unhandled event', type, data);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (rawEvent.trim()) dispatch(rawEvent);
      }
    }
    if (buffer.trim()) dispatch(buffer);
    onEnd?.();
  } catch (err) {
    onError?.(err);
  }
}
