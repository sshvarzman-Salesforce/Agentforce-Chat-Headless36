# Agentforce Chat — Deploy Your Agent on Any Website

A ready-to-use **React web app** that lets your customers chat with a **Salesforce
Agentforce** agent, in real time, on your own site. It's a "bring your own channel"
template: plug in your org's details and your agent is live on a third-party website.

It uses the official [Agentforce Agent API](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-examples.html)
and demonstrates the full lifecycle: **OAuth → create session → streaming messages →
end session → submit feedback**.

![flow](https://img.shields.io/badge/browser-%E2%86%92%20proxy%20%E2%86%92%20Agent%20API-0d6efd)

---

## How it works

```
Browser (React chat UI)  ──►  Proxy (Node/Express)  ──►  api.salesforce.com (Agent API)
        ◄──────── streamed reply (Server-Sent Events) relayed back ───────┘
```

**Why the proxy?** The Agent API uses an OAuth **client secret** and is **not
CORS-enabled for browsers**. So a static website can't (and shouldn't) call it
directly — the secret would be exposed and the request blocked. The included proxy
keeps your secret on the server, runs OAuth, and relays the streaming response to the
browser. This is the secure, production-correct pattern.

---

## What you need (one-time Salesforce setup)

Anyone with Salesforce + Agentforce can run this. You need **four values** from your
org, which come from two pieces of setup:

### 1. An API-enabled Agentforce agent
- Build/activate an agent in **Agent Builder**.
- Make sure it's **connected to the Agent API** (API channel enabled) and **published**.
- → gives you the **Agent ID** (`0Xx…`).

### 2. A Connected App using the Client Credentials flow
- **Setup → App Manager → New Connected App** (or External Client App).
- Enable **OAuth Settings** → enable the **Client Credentials Flow**.
- OAuth scopes: include the Agent API scopes (e.g. **`sfap_api`** and **`chatbot_api`**).
- Set a **Run-As user** for the Client Credentials flow (a user with access to the agent).
- → gives you the **Consumer Key** and **Consumer Secret**.

### 3. Your My Domain
- **Setup → My Domain** → e.g. `acme.my.salesforce.com`.

### Get your values — summary

| Value                 | Where to find it                                                        |
| --------------------- | ----------------------------------------------------------------------- |
| `SF_MY_DOMAIN_URL`    | Setup → My Domain (host only, no `https://`)                            |
| `SF_AGENT_ID`         | Agent Builder URL / Agents setup page (18-char ID starting `0Xx`)       |
| `SF_CLIENT_ID`        | App Manager → your Connected App → Manage Consumer Details (Consumer Key)|
| `SF_CLIENT_SECRET`    | Same screen (Consumer Secret)                                           |

> Plus **Node.js 18+** installed on the machine that runs the proxy.

---

## Run it locally (≈ 3 minutes)

```bash
# 1. Get the code
git clone https://github.com/sshvarzman-Salesforce/agentforce-chat-demo.git
cd agentforce-chat-demo

# 2. Install dependencies (one time)
npm install

# 3. Create your config file
cp .env.example .env        # Windows: copy .env.example .env

# 4. Edit .env and fill in YOUR four values:
#    SF_MY_DOMAIN_URL, SF_AGENT_ID, SF_CLIENT_ID, SF_CLIENT_SECRET

# 5. Start it
npm start
```

Then open **http://localhost:8787** and click **Start chat**.

> **Windows / PowerShell:** if `npm` is blocked by the script-execution policy, use
> `npm.cmd install` and `npm.cmd start` instead (or run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

`npm start` runs a single service that serves both the UI and the proxy from one URL.
For development with hot-reload, use `npm run dev` (UI on `:5173`, proxy on `:8787`).

---

## Features

- **Full-page chat UI** — the agent lives natively in the page (not a corner widget).
- **Real-time streaming** — replies type in live via Server-Sent Events:
  - `ProgressIndicator` → a "Thinking…" indicator
  - `TextChunk` → incremental text (typewriter effect)
  - `Inform` → the complete message · `EndOfTurn` → done
- **End chat** + **star-rating feedback** (1–5 → Bad … Amazing) with an optional comment.
- **Fully config-driven** — point `.env` at any org + agent; no code changes needed.

### Feedback mapping

| Stars | Label     |
| ----- | --------- |
| 1     | Bad       |
| 2     | Not Well  |
| 3     | Good      |
| 4     | Very Good |
| 5     | Amazing   |

With `FEEDBACK_MODE=enum` (default), the proxy sends the API-safe `GOOD`/`BAD` value
and stores `"[5/5 — Amazing] <comment>"` in the feedback `text`. Set
`FEEDBACK_MODE=label` to send the descriptive word as the feedback value instead
(only if your org accepts those values).

---

## Deploy to a public URL

For a link anyone can open (no terminal, no setup on their end), host the **whole repo
as one Node service**. Example with [Render](https://render.com):

1. **New → Web Service** → connect this repo.
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm start`
4. **Environment** → add the variables from `.env.example` (your real values).
   Set `ALLOWED_ORIGIN=*` (or your domain).
5. Deploy → you get `https://<your-app>.onrender.com` serving UI + proxy from one
   origin (no CORS to configure). Share that link.

> **GitHub Pages note:** Pages can host the static UI but **cannot run the proxy**,
> and it's unavailable for private repos on free plans. A single Node host (above) is
> the simplest path to a working public demo. The manual `.github/workflows/deploy-pages.yml`
> is included for the UI-only case if you make the repo public and host the proxy separately.

---

## Configuration reference

All settings live in `.env` (see [`.env.example`](.env.example)):

| Variable           | Required | Description                                            |
| ------------------ | :------: | ------------------------------------------------------ |
| `SF_MY_DOMAIN_URL` |   yes    | Your My Domain host (no `https://`)                    |
| `SF_API_HOST`      |   no     | `api.salesforce.com` (default) or `api.gov.salesforce.com` |
| `SF_AGENT_ID`      |   yes    | The Agentforce agent ID (`0Xx…`)                       |
| `SF_CLIENT_ID`     |   yes    | Connected App consumer key                             |
| `SF_CLIENT_SECRET` |   yes    | Connected App consumer secret                          |
| `PORT`             |   no     | Proxy port (default `8787`)                            |
| `ALLOWED_ORIGIN`   |   no     | CORS origin for a separately-hosted frontend (`*` for dev) |
| `FEEDBACK_MODE`    |   no     | `enum` (default) or `label`                            |

To switch environments/agents, just change the four `SF_*` values and restart.

---

## Project layout

| Path        | What it is                                              |
| ----------- | ------------------------------------------------------- |
| `client/`   | Vite + React chat UI                                    |
| `server/`   | Express streaming proxy (holds the secret, calls the API)|
| `.env`      | Your org's values (gitignored — copy from `.env.example`)|

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `invalid_client` on Start chat | `SF_CLIENT_ID`/`SF_CLIENT_SECRET` wrong, or Client Credentials flow not enabled on the Connected App. Restart after editing `.env`. |
| Session creation fails (4xx) | Agent not API-enabled/published, or the Run-As user lacks access, or `SF_AGENT_ID` is wrong. |
| "Cannot reach the proxy server" | The proxy isn't running, or the frontend's proxy URL (⚙) is wrong. |
| Changes to `.env` not taking effect | The proxy reads env at boot — stop (`Ctrl+C`) and start again. |
