# Agent Playground — Design Spec

- **Date:** 2026-06-03
- **Status:** Architecture approved — implementation in progress
- **Repo:** https://github.com/Gecko51/LangChain_Full_Stack

## 1. Summary

A polished, easily deployable **"agent playground"** (portfolio piece). A web UI lets the
user tune **every** parameter of a LangChain agent live — system prompt, LLM model,
temperature, max tokens, output parser, memory, enabled tools — and chat with it, with
**token-by-token streaming** and visible **tool calls**, **without restarting the server**.

## 2. Goals & non-goals

**Goals**
- Live, hot-reloadable agent configuration (no server restart).
- Real-time streaming chat (tokens + tool calls) over SSE.
- Built-in tool calling to showcase agentic behavior.
- Strong visual polish (Modern Dark + Violet theme, dark/light toggle).
- Easy deployment (frontend on Vercel, backend on a long-running host).

**Non-goals (v1) — deferred to Phase 2**
- MCP servers (architecture is kept ready, but not wired in v1).
- `pydantic` structured output parser (needs a custom schema UI).
- Auth / multi-tenant / user accounts.
- Persistent database (in-memory + JSON file is enough for a demo).

## 3. Locked decisions

| Topic | Decision | Rationale |
|---|---|---|
| Purpose | Demo / portfolio | Drives polish + easy deploy, no auth |
| Tools | Built-in Python tools in v1; MCP in Phase 2 | Best "impressive / deployable" ratio |
| LangChain stack | **Modern**: `create_agent` + native OpenRouter provider | Future-proof, no deprecated APIs |
| Streaming | `agent.astream(stream_mode=["messages","updates"])` → SSE | Tokens **and** tool calls in one loop |
| Client transport | `fetch` + `ReadableStream` (not `EventSource`) | `EventSource` can't POST a body |
| Output parser | `str` \| `json` only (v1) | `pydantic` needs a schema UI → Phase 2 |
| Memory | Explicit history per session, trimmed to `memory_window` | Simple, debuggable, the slider visibly works |
| Persistence | Config singleton in memory + `config.json` file | Survives restarts without a DB |
| Visual | Modern Dark + Violet, dark/light toggle (default dark) | Memorable for a portfolio |
| Language | 100% English code/comments/UI | Project requirement |

## 4. Architecture

Two services communicating over HTTP + SSE:

```
┌─────────────────────────┐        HTTP + SSE          ┌──────────────────────────┐
│  frontend/  (Next.js 15) │ ─────────────────────────► │  backend/  (FastAPI)      │
│  React 19 · TS · Tailwind│   POST /chat, /config, ... │  Python 3.11 · LangChain  │
│  shadcn/ui · dark/light  │ ◄───────────────────────── │  create_agent (OpenRouter)│
└─────────────────────────┘    token + tool stream      └──────────────────────────┘
        Vercel                                            Render / Railway / Fly.io
```

**Central principle — the agent is rebuilt on every request** from the current config,
which lives in a backend singleton and is mirrored to `config.json`. Updating config via
`POST /config` mutates the singleton; the next chat request picks it up. No restart.
This is cheap because `create_agent` is just wiring.

**Chat request flow**

1. UI sends `POST /chat { message, session_id }`.
2. Backend loads `AgentConfig`, builds the agent (model `openrouter:<provider/model>`,
   system prompt, enabled tools), loads the session history (trimmed to `memory_window`
   when memory is ON).
3. Backend runs `agent.astream(..., stream_mode=["messages","updates"])` and emits SSE
   events: `token`, `tool_start`, `tool_end`, `done`, `error`.
4. `useAgentStream` reads the response body as a stream, parses SSE frames, and calls
   `onToken / onToolCall / onComplete / onError` → UI renders live.
5. Backend appends the user message + final assistant message to the session history.

## 5. SSE event contract (integration source of truth)

`POST /chat` responds with `text/event-stream`. Each event:

```
event: token
data: {"text": "Le"}

event: tool_start
data: {"id": "call_1", "name": "web_search", "input": {"query": "RAG"}}

event: tool_end
data: {"id": "call_1", "name": "web_search", "output": "..."}

event: done
data: {"finish_reason": "stop", "content": "...full assistant text..."}

event: error
data: {"error": "model_error", "detail": "human readable message"}
```

- `token` — incremental assistant text deltas (the only event for `output_parser: "str"`).
- `tool_start` / `tool_end` — surfaced as italic chips in the chat.
- `done` — terminal success; carries the full assembled content (used for `json` mode
  validation/pretty-print, and to store history).
- `error` — terminal failure; UI shows an error state. Always the last event on failure.

## 6. Backend design (`backend/`)

**Modules**

| File | Responsibility |
|---|---|
| `main.py` | FastAPI app, CORS, lifespan, route wiring |
| `config.py` | `AgentConfig` (Pydantic v2), `DEFAULT_CONFIG`, in-memory `ConfigStore` + JSON persistence |
| `agent.py` | `build_agent(config)` and `stream_chat(...)` async generator (SSE events) |
| `tools.py` | Built-in tool registry + `get_enabled_tools(names)` |
| `sessions.py` | In-memory `dict[session_id, list[BaseMessage]]` + window trimming |
| `schemas.py` | Request/response models (`ChatRequest`, `ServerInfo`, ...) |
| `mcp_manager.py` | **Phase 2 stub** — documented, not wired in v1 |
| `requirements.txt`, `Dockerfile` | Deps + container |

**`AgentConfig` (Pydantic v2)**

```python
class AgentConfig(BaseModel):
    system_prompt: str
    model: str                      # OpenRouter id, e.g. "anthropic/claude-sonnet-4-5"
    temperature: float = Field(ge=0.0, le=2.0)
    max_tokens: int = Field(ge=256, le=8192)
    output_parser: Literal["str", "json"]   # "pydantic" -> Phase 2
    tools_enabled: list[str]
    memory_enabled: bool
    memory_window: int = Field(ge=1, le=20)
    streaming: bool
```

`DEFAULT_CONFIG`: system prompt = "You are an expert AI assistant. Answer clearly,
concisely, and in a structured way.", model = `anthropic/claude-sonnet-4-5`,
temperature 0.7, max_tokens 2048, parser `str`, no tools, memory on (window 10),
streaming on.

**Agent construction (modern stack)**

```python
# Inject temperature/max_tokens on the model, then build the agent.
model = init_chat_model(
    f"openrouter:{config.model}",
    temperature=config.temperature,
    max_tokens=config.max_tokens,
)
agent = create_agent(model=model, tools=get_enabled_tools(config.tools_enabled),
                     system_prompt=config.system_prompt)
```

> Build-time check: confirm the exact kwargs (`system_prompt` vs `prompt`) and that the
> `langchain-openrouter` provider is installed so `openrouter:` resolves. `OPENROUTER_API_KEY`
> is read from the environment.

**Built-in tools (v1):** `web_search` (DuckDuckGo, no API key), `calculator`,
`current_datetime`, `http_get` (fetch text from a URL). Each is a `@tool`; the registry
maps name → tool and exposes metadata for `GET /tools`.

**Memory:** for each `session_id`, keep an ordered message list. On a request, if
`memory_enabled`, prepend the last `memory_window` messages; otherwise send only the new
message. Append user + final assistant messages after completion.

**Endpoints**

| Method + path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET /config` | Current config |
| `POST /config` | Update config (hot-reload) + persist to JSON |
| `GET /models` | Model list — live proxy of OpenRouter `/api/v1/models` with a curated fallback |
| `POST /chat` | SSE streaming chat (see §5) |
| `GET /tools` | List built-in tools (name, description, enabled) |
| `DELETE /sessions/{id}` | Clear a session's history ("Clear history" button) |
| `GET/POST/DELETE /mcp/*` | **Phase 2** |

**Error handling:** wrap every LangChain call in try/except. Streaming failures emit an
`error` SSE event then stop. Non-streaming failures return `{ "error": ..., "detail": ... }`
with an appropriate HTTP status.

**CORS:** allow `http://localhost:3000` and `FRONTEND_URL`.

## 7. Frontend design (`frontend/`)

Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, lucide-react,
`next-themes` (dark/light, default dark).

**Layout (`app/page.tsx`)** — header (logo + `ThemeToggle`); two columns: left 1/3
`AgentConfig`, right 2/3 `ChatInterface`. Stacks vertically on mobile.

**Components**

| Component | Role |
|---|---|
| `AgentConfig` | Collapsible sections: LLM settings, system prompt, output parser, memory, tools; "Save & Apply" → `POST /config` |
| `ModelSelector` | Select grouped by provider, fed by `GET /models` |
| `ChatInterface` | ScrollArea history, input (Enter to send), live streaming, status (Idle/Thinking/Streaming/Error), Clear history |
| `MessageBubble` | One user/assistant message |
| `ToolCallChip` | Italic, accent-colored chip for a tool call |
| `ToolsPanel` | Built-in tools with enable toggles; MCP add-form shown disabled ("Phase 2") |
| `ThemeToggle` | Dark/light switch |

**Hooks**

- `useAgentStream` — `fetch` + `ReadableStream` SSE parser; emits
  `onToken / onToolCall / onComplete / onError`; `cancel()` via `AbortController`.
- `useAgentConfig` — React context holding config **in memory** (per requirement);
  `GET /config` on mount, `POST /config` on save.

**Types (`types/agent.ts`)** — `AgentConfig`, `ToolInfo`, `ChatMessage`, `ToolCall`,
`StreamEvent` (mirrors §5). **`lib/api.ts`** — typed fetch helpers; backend URL from
`NEXT_PUBLIC_BACKEND_URL`.

> Note on `localStorage`: the original brief banned it for a sandboxed preview. Here the
> **agent config** stays in React state (synced to the backend). Only the **theme** uses
> `next-themes` (localStorage), which is fine on a normal Vercel deployment and avoids a
> flash of the wrong theme.

## 8. Project structure

```
LangChain_Full_Stack/
├── docker-compose.yml
├── .env.example
├── README.md
├── docs/superpowers/specs/2026-06-03-agent-playground-design.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── config.py
│   ├── agent.py
│   ├── tools.py
│   ├── sessions.py
│   ├── schemas.py
│   ├── mcp_manager.py          # Phase 2 stub
│   └── tests/
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.ts
    ├── src/
    │   ├── app/ (layout.tsx, page.tsx, globals.css)
    │   ├── components/ (AgentConfig, ChatInterface, ModelSelector,
    │   │               MessageBubble, ToolCallChip, ToolsPanel, ThemeToggle, ui/)
    │   ├── hooks/ (useAgentStream.ts, useAgentConfig.ts)
    │   ├── lib/ (api.ts, utils.ts)
    │   └── types/ (agent.ts)
    └── ...
```

## 9. Implementation plan (ordered)

1. **Repo foundation** — spec, README, `.gitignore`, `.env.example`, `docker-compose.yml`. *(this commit)*
2. **Backend core** — `config.py`, `schemas.py`, `main.py` with `/health`, `/config`; run with uvicorn.
3. **Agent + streaming** — `tools.py`, `agent.py`, `POST /chat` SSE, `sessions.py`, `GET /tools`, `GET /models`.
4. **Backend tests** — pytest for config store, tools, `/health`, mocked stream.
5. **Frontend scaffold** — Next.js 15 + Tailwind v4 + shadcn/ui, theme provider, layout.
6. **Frontend config panel** — `AgentConfig` + `ModelSelector` + `ToolsPanel` + `useAgentConfig`.
7. **Frontend chat** — `ChatInterface` + `useAgentStream` + tool chips + status.
8. **Polish** — Modern Dark + Violet theme, responsive, empty/error states.
9. **Dockerization + deploy docs** — Dockerfiles, compose, Vercel + backend-host notes.

Each step is a logical commit. Backend is verified with uvicorn before the frontend starts.

## 10. Phase 2 roadmap

- MCP servers via `langchain-mcp-adapters` `MultiServerMCPClient` (stdio + SSE), lifespan-managed.
- `pydantic` output parser with a schema editor in the UI.
- Optional: conversation persistence, request rate limiting, model cost display.

## 11. Testing

- **Backend:** pytest — config store round-trip + persistence, tool registry, `/health`,
  a mocked streaming run asserting the SSE event sequence.
- **Frontend:** light — render sanity for `ChatInterface`/`AgentConfig`, SSE parser unit
  test for `useAgentStream`. Not over-engineered (portfolio scope).
