# 🦎 Agent Playground

A full-stack **AI agent playground**: tune every parameter of a LangChain agent live from
a web UI — system prompt, LLM model, temperature, output parser, memory, tools — and chat
with it in real time, with **token-by-token streaming** and visible **tool calls**, all
**without restarting the server**.

> Built with the modern LangChain stack (`create_agent` + native OpenRouter provider) and a
> Next.js 15 / React 19 frontend. Dark-first UI with a light/dark toggle.

---

## ✨ Features

- **Live config hot-reload** — change the agent's settings and the next message uses them, no restart.
- **Real-time streaming** — tokens and tool calls stream over SSE.
- **Built-in tools** — web search, calculator, current date/time, HTTP fetch (MCP support planned).
- **Any model via OpenRouter** — Anthropic, OpenAI, Google, Meta, Mistral… with one API key.
- **Conversation memory** — toggleable, with an adjustable window.
- **Polished UI** — Modern Dark + Violet theme, light/dark toggle, responsive.

## 🧱 Tech stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11 · FastAPI · LangChain (`create_agent`) · OpenRouter · sse-starlette |
| Frontend | Next.js 15 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · lucide-react |
| Infra | Docker Compose · Vercel (frontend) · Render / Railway / Fly.io (backend) |

## 🏗️ Architecture

```
┌─────────────────────────┐        HTTP + SSE          ┌──────────────────────────┐
│  frontend/  (Next.js 15) │ ─────────────────────────► │  backend/  (FastAPI)      │
│  React 19 · TS · Tailwind│   POST /chat, /config, ... │  LangChain create_agent   │
│  shadcn/ui · dark/light  │ ◄───────────────────────── │  OpenRouter provider      │
└─────────────────────────┘    token + tool stream      └──────────────────────────┘
```

The agent is **rebuilt on every request** from the current config (held in memory and
mirrored to `config.json`), so updates apply instantly.

See the full design in
[`docs/superpowers/specs/2026-06-03-agent-playground-design.md`](docs/superpowers/specs/2026-06-03-agent-playground-design.md).

## 🚀 Quick start

### Option A — Docker (everything at once)

```bash
cp .env.example .env          # then add your OPENROUTER_API_KEY
docker compose up --build
# Frontend: http://localhost:3000  ·  Backend: http://localhost:8000
```

### Option B — Manual (two terminals)

```bash
# Terminal 1 — backend
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

## 🔑 Environment

Copy `.env.example` to `.env` and set:

- `OPENROUTER_API_KEY` — your OpenRouter key ([get one](https://openrouter.ai/keys))
- `BACKEND_PORT` — backend port (default `8000`)
- `FRONTEND_URL` — allowed CORS origin (default `http://localhost:3000`)
- `NEXT_PUBLIC_BACKEND_URL` — backend URL the browser uses (default `http://localhost:8000`)

## 🗺️ Roadmap

- **Phase 2** — MCP servers (filesystem, fetch, Playwright…), `pydantic` structured output
  parser with a schema editor, optional conversation persistence.

## 📄 License

See [LICENSE](LICENSE).
