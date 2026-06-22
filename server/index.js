// ────────────────────────────────────────────────────────────────────────────
// Agentforce streaming proxy
//
// The browser never sees the client secret or the access token. This server:
//   1. Runs the OAuth client-credentials flow and caches the access token.
//   2. Creates a session (returns the agent's greeting).
//   3. Relays the SSE streaming response for each user message to the browser.
//   4. Ends the session and submits feedback.
//
// It maps 1:1 onto the Postman collection "Salesforce Main Sean SDO".
// ────────────────────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from the repo root (one level up from /server).
dotenv.config({ path: new URL('../.env', import.meta.url) });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  SF_MY_DOMAIN_URL,
  SF_API_HOST = 'api.salesforce.com',
  SF_AGENT_ID,
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  PORT = 8787,
  ALLOWED_ORIGIN = '*',
  FEEDBACK_MODE = 'enum',
} = process.env;

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map((s) => s.trim()) }));
app.use(express.json());

// ── Token cache ─────────────────────────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  if (!SF_MY_DOMAIN_URL || !SF_CLIENT_ID || !SF_CLIENT_SECRET) {
    throw new Error('Server is missing SF_MY_DOMAIN_URL / SF_CLIENT_ID / SF_CLIENT_SECRET. Check your .env.');
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
  });
  const resp = await fetch(`https://${SF_MY_DOMAIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  // client_credentials responses often omit expires_in; default to ~110 min.
  const ttlMs = (json.expires_in ? Number(json.expires_in) : 110 * 60) * 1000;
  tokenCache = { token: json.access_token, expiresAt: Date.now() + ttlMs };
  return tokenCache.token;
}

// ── Per-session message sequence counter (mirrors the Postman pre-request) ───
const sessionSeq = new Map();
function nextSeq(sessionId) {
  const n = (sessionSeq.get(sessionId) ?? 1) + 1;
  sessionSeq.set(sessionId, n);
  return n;
}

const agentBase = () => `https://${SF_API_HOST}/einstein/ai-agent/v1`;

// ── Health / config ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const configured = Boolean(SF_MY_DOMAIN_URL && SF_AGENT_ID && SF_CLIENT_ID && SF_CLIENT_SECRET);
  res.json({ ok: true, configured });
});

// ── Create a session (OAuth + create) ────────────────────────────────────────
app.post('/api/session', async (_req, res) => {
  try {
    const token = await getAccessToken();
    const resp = await fetch(`${agentBase()}/agents/${SF_AGENT_ID}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        externalSessionKey: randomUUID(),
        instanceConfig: { endpoint: `https://${SF_MY_DOMAIN_URL}` },
        streamingCapabilities: { chunkTypes: ['Text'] },
        bypassUser: true,
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ error: json });

    sessionSeq.set(json.sessionId, 1);
    // Surface only what the UI needs: the session id and the greeting messages.
    const messages = (json.messages || [])
      .map((m) => (typeof m === 'string' ? m : m.message))
      .filter(Boolean);
    res.json({ sessionId: json.sessionId, messages });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ── Send a message, stream the reply (SSE relay) ──────────────────────────────
app.post('/api/session/:id/messages/stream', async (req, res) => {
  const sessionId = req.params.id;
  const text = (req.body && req.body.text) || '';
  try {
    const token = await getAccessToken();
    const upstream = await fetch(`${agentBase()}/sessions/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: { sequenceId: nextSeq(sessionId), type: 'Text', text } }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      res.setHeader('Content-Type', 'application/json');
      return res.status(upstream.status || 502).json({ error: errText || 'Upstream stream failed' });
    }

    // Relay the raw Server-Sent Events straight to the browser.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    req.on('close', () => upstream.body?.cancel?.().catch(() => {}));

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
    else res.end();
  }
});

// ── End a session ─────────────────────────────────────────────────────────────
app.delete('/api/session/:id', async (req, res) => {
  const sessionId = req.params.id;
  try {
    const token = await getAccessToken();
    const resp = await fetch(`${agentBase()}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'x-session-end-reason': 'UserRequest' },
    });
    sessionSeq.delete(sessionId);
    res.status(resp.ok ? 200 : resp.status).json({ ok: resp.ok });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ── Submit feedback ───────────────────────────────────────────────────────────
const STAR_LABELS = { 1: 'Bad', 2: 'Not Well', 3: 'Good', 4: 'Very Good', 5: 'Amazing' };

app.post('/api/session/:id/feedback', async (req, res) => {
  const sessionId = req.params.id;
  const stars = Math.max(1, Math.min(5, Number(req.body?.stars) || 0));
  const comment = (req.body?.comment || '').trim();
  const label = STAR_LABELS[stars] || 'Good';

  // "enum" mode keeps the API-safe GOOD/BAD value and stores the rich rating in text.
  // "label" mode sends the descriptive word as the feedback value (org must accept it).
  const feedbackValue =
    FEEDBACK_MODE === 'label' ? label.toUpperCase() : stars >= 3 ? 'GOOD' : 'BAD';
  const text = `[${stars}/5 — ${label}]${comment ? ` ${comment}` : ''}`;

  try {
    const token = await getAccessToken();
    const resp = await fetch(`${agentBase()}/sessions/${sessionId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feedbackId: randomUUID(), feedback: feedbackValue, text }),
    });
    const ok = resp.ok;
    const json = await resp.json().catch(() => ({}));
    res.status(ok ? 200 : resp.status).json(ok ? { ok: true } : { error: json });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ── Optionally serve the built client (single-service deploy) ─────────────────
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Agentforce proxy listening on http://localhost:${PORT}`);
  console.log(`  My Domain : ${SF_MY_DOMAIN_URL || '(not set)'}`);
  console.log(`  Agent ID  : ${SF_AGENT_ID || '(not set)'}`);
  console.log(`  Feedback  : ${FEEDBACK_MODE} mode`);
});
