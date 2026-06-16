# Agentforce Chat Demo — Bring Your Own Channel

A React web app that lets an end user chat with a **Salesforce Agentforce** agent in
real time, using the [Agent API](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-examples.html).
It demonstrates deploying an Agentforce agent on a third‑party website / custom channel.

It mirrors the Postman collection **"Salesforce Main Sean SDO"**: OAuth → Create
session → **streaming** messages → End session → Submit feedback.

## Why there's a backend

The Agent API uses an OAuth **client secret** and is **not CORS-enabled for browsers**.
A static site (e.g. GitHub Pages) therefore *cannot* call it directly without leaking
the secret and getting blocked by CORS. So this repo ships a tiny **proxy server**
that holds the secret, runs OAuth, and relays the streaming response to the browser:

```
Browser (React)  ──►  proxy (Express)  ──►  api.salesforce.com (Agent API)
      ◄──── Server-Sent Events relayed back ────┘
```

## Project layout

| Path        | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `client/`   | Vite + React chat UI (deploys to GitHub Pages)                    |
| `server/`   | Express streaming proxy (deploy to Render/Railway/Cloudflare)     |
| `.env`      | Your Salesforce credentials (gitignored — copy from `.env.example`)|

## Run locally

```bash
cp .env.example .env        # then fill in SF_CLIENT_SECRET (and any other values)
npm install                 # installs client + server (npm workspaces)
npm run dev                 # starts proxy :8787 and client :5173 together
```

Open http://localhost:5173 → **Start chat**. In dev the client proxies `/api` to the
local server, so no extra config is needed and nothing is exposed.

## Streaming behavior

The app uses the **Send Streaming Messages** endpoint. As the agent works you'll see:

- **ProgressIndicator** → a "Thinking… / One moment while I check…" bubble
- **TextChunk** → the answer typed in incrementally (typewriter effect)
- **Inform** → the complete message
- **EndOfTurn** → turn finished

## Feedback

When the user ends the chat, a 1–5 **star** modal appears. Stars map to:

| Stars | Label      |
| ----- | ---------- |
| 1     | Bad        |
| 2     | Not Well   |
| 3     | Good       |
| 4     | Very Good  |
| 5     | Amazing    |

By default (`FEEDBACK_MODE=enum`) the proxy sends the API-safe `GOOD`/`BAD` value and
puts `"[5/5 — Amazing] <comment>"` in the `text` field. Set `FEEDBACK_MODE=label` to
send the descriptive word as the `feedback` value instead (only if your org accepts it).

## Deploy

### Frontend → GitHub Pages
Pushing to `main` runs `.github/workflows/deploy-pages.yml`, which builds `client/`
and publishes it. Enable Pages → Source: **GitHub Actions** in repo Settings.

> GitHub Pages from a **private** repo requires a paid GitHub plan. On a free plan,
> either make the repo public or host the frontend elsewhere (Render static site, Netlify…).

### Proxy → any Node host (Render shown)
1. New **Web Service** from this repo, root directory `server` (or repo root).
2. Build: `npm install` · Start: `npm start`
3. Add env vars from `.env.example` (set `ALLOWED_ORIGIN` to your Pages URL).
4. Copy the service URL, open the deployed app, click **⚙**, and paste it.

Alternatively, deploy the **whole repo to one Node host**: run `npm run build` then
`npm start` — the server auto-serves `client/dist`, giving you a single same-origin
URL with no CORS to configure.

## Configuration reference

All server config lives in `.env` (see `.env.example`): `SF_MY_DOMAIN_URL`,
`SF_API_HOST`, `SF_AGENT_ID`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `PORT`,
`ALLOWED_ORIGIN`, `FEEDBACK_MODE`.
