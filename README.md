# Headless360 — Agentforce Chat on Any Website

A ready-to-use **React web app** that lets your customers chat with a **Salesforce
Agentforce** agent, in real time, on your own site. It's a "bring your own channel"
template: plug in your org's details and your agent is live on a third-party website.

It uses the official [Agentforce Agent API](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html)
and demonstrates the full lifecycle: **OAuth → create session → streaming messages →
end session → submit feedback**.

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

Anyone with Salesforce + Agentforce can run this. You need **four values** from your org:

1. **An API-enabled Agentforce agent** — built/activated in Agent Builder and connected
   to the Agent API. → gives you the **Agent ID** (`0Xx…`).
2. **An External Client App** using the **OAuth 2.0 Client Credentials flow**, with a
   run-as user and the Agent API scopes (`sfap_api`, `chatbot_api`).
   → gives you the **Consumer Key** and **Consumer Secret**.
   Follow the official guide: [Get Started with the Agent API](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-get-started.html).
3. **Your My Domain** — e.g. `acme.my.salesforce.com`.

Plus **Node.js 18+** on the machine that runs the proxy.

### Where to find each value

| Value              | Where to find it                                                                 |
| ------------------ | -------------------------------------------------------------------------------- |
| `SF_MY_DOMAIN_URL` | Setup → **My Domain** → the domain ending in `.my.salesforce.com` (no `https://`)|
| `SF_AGENT_ID`      | Run the SOQL below → use the returned `Id` (starts with `0Xx`)                   |
| `SF_CLIENT_ID`     | Setup → **External Client App Manager** → your app → Settings → OAuth Settings → Consumer Key |
| `SF_CLIENT_SECRET` | Same screen → Consumer Secret                                                    |

Get your Agent ID with SOQL (replace the developer name with your agent's):
```sql
SELECT Id, DeveloperName FROM BotDefinition WHERE DeveloperName = 'YOUR_AGENT_DEVELOPER_NAME'
```

---

## Run it locally

> **Windows / PowerShell:** use `npm.cmd` instead of `npm` (PowerShell blocks the
> `npm` script by default). On **Mac/Linux** use `npm` and `cp` instead of `copy`.

**1. Get the code** (one time)
```bash
git clone https://github.com/sshvarzman-Salesforce/Agentforce-Chat-Headless36.git
```

**2. Go into the folder** (run everything from here)
```bash
cd Agentforce-Chat-Headless36
```

**3. Install the project's dependencies** (run once per fresh clone — downloads the packages the app needs)
```bash
npm.cmd install
```

**4. Create your config file** (one time)
```bash
copy .env.example .env
```

**5. Open the `.env` file you just created and fill in YOUR four values:**
```ini
SF_MY_DOMAIN_URL=your-domain.my.salesforce.com
SF_AGENT_ID=0Xx...
SF_CLIENT_ID=your-consumer-key
SF_CLIENT_SECRET=your-consumer-secret
```
See **"Where to find each value"** above. Save the file after replacing all four placeholders.

**6. Start it** (from inside the folder)
```bash
npm.cmd start
```
Wait for: `Agentforce proxy listening on http://localhost:8787`
_(The UI builds automatically the first time — give it a few seconds.)_

**7. Open** http://localhost:8787 → click **Start chat**. 🎉

**Stop:** `Ctrl+C`. Run steps 3–6 from *inside* the `Agentforce-Chat-Headless36` folder.

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
> the simplest path to a working public demo.

---

## Configuration reference

All settings live in `.env` (see [`.env.example`](.env.example)):

| Variable           | Required | Description                                            |
| ------------------ | :------: | ------------------------------------------------------ |
| `SF_MY_DOMAIN_URL` |   yes    | Your My Domain host (no `https://`)                    |
| `SF_API_HOST`      |   no     | `api.salesforce.com` (default) or `api.gov.salesforce.com` |
| `SF_AGENT_ID`      |   yes    | The Agentforce agent ID (`0Xx…`)                       |
| `SF_CLIENT_ID`     |   yes    | External Client App consumer key                       |
| `SF_CLIENT_SECRET` |   yes    | External Client App consumer secret                    |
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

Full Agent API documentation:
[Salesforce Developer Guide for Agentforce Agent APIs](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html)

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `Cannot find package '…'` (e.g. express) | You skipped step 3 — run `npm.cmd install` in the project folder. |
| `invalid_client` on Start chat | `SF_CLIENT_ID`/`SF_CLIENT_SECRET` wrong, or Client Credentials flow not enabled on the External Client App. Fix `.env`, then restart. |
| Session creation fails (4xx) | Agent not API-enabled/published, the run-as user lacks access, or `SF_AGENT_ID` is wrong. |
| Page is blank / UI won't load | Run `npm.cmd run build`, then `npm.cmd start`. |
| "Cannot reach the proxy server" | The proxy isn't running — `cd` into the folder and `npm.cmd start` again. |
| Changes to `.env` not taking effect | The proxy reads env at boot — stop (`Ctrl+C`) and start again. |
