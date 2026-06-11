"""FastAPI entrypoint: routes, CORS, auth gate, and app wiring.

Public routes: /health and /auth/*. Everything else is behind a JWT login gate
(see auth.py). The agent is rebuilt from ``config_store`` on every /chat request.
"""
from __future__ import annotations

import asyncio
import hmac
import os
from datetime import datetime, timezone

from dotenv import load_dotenv

# Load env FIRST, before importing modules (agent.py, auth.py) that read env at import.
load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

import httpx  # noqa: E402
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from sse_starlette.sse import EventSourceResponse  # noqa: E402

import auth  # noqa: E402
import db  # noqa: E402
import scheduled  # noqa: E402
from agent import fetch_generation_cost, run_once, stream_chat  # noqa: E402
from config import AgentConfig, config_store  # noqa: E402
from connectors import CONNECTOR_CATALOG  # noqa: E402
from mcp_manager import discover  # noqa: E402
import rag  # noqa: E402
from memory_store import memory_store  # noqa: E402
from schemas import ChatRequest  # noqa: E402
from sessions import session_store  # noqa: E402
from settings import CustomPrompt, MCPServer, settings_store  # noqa: E402
from tools import list_tools  # noqa: E402

app = FastAPI(title="Agent Playground API", version="1.1.0")

# --- CORS: allow the local frontend + the configured FRONTEND_URL(s) ---
# FRONTEND_URL may be a comma-separated list (e.g. prod + preview domains).
_frontend_urls = [
    u.strip()
    for u in os.getenv("FRONTEND_URL", "http://localhost:3000").split(",")
    if u.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list({"http://localhost:3000", *_frontend_urls}),
    # Allow any Vercel deployment (prod + previews) without re-setting FRONTEND_URL.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Curated fallback used when the live OpenRouter model list can't be fetched.
CURATED_MODELS = [
    {"value": "anthropic/claude-sonnet-4-5", "label": "Claude Sonnet 4.5", "provider": "Anthropic"},
    {"value": "anthropic/claude-opus-4.1", "label": "Claude Opus 4.1", "provider": "Anthropic"},
    {"value": "anthropic/claude-haiku-4-5", "label": "Claude Haiku 4.5", "provider": "Anthropic"},
    {"value": "openai/gpt-4o", "label": "GPT-4o", "provider": "OpenAI"},
    {"value": "openai/gpt-4o-mini", "label": "GPT-4o Mini", "provider": "OpenAI"},
    {"value": "openai/o3", "label": "o3", "provider": "OpenAI"},
    {"value": "google/gemini-2.5-pro", "label": "Gemini 2.5 Pro", "provider": "Google"},
    {"value": "google/gemini-2.0-flash", "label": "Gemini 2.0 Flash", "provider": "Google"},
    {"value": "meta-llama/llama-3.3-70b-instruct", "label": "Llama 3.3 70B", "provider": "Meta"},
    {"value": "mistralai/mistral-large", "label": "Mistral Large", "provider": "Mistral"},
]


class ApiKeyBody(BaseModel):
    api_key: str = ""


class AuthBody(BaseModel):
    username: str
    password: str


class AllowedToolsBody(BaseModel):
    allowed_tools: list[str] | None = None  # None = all tools enabled


class MemoryBody(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class RagBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=100_000)


class ProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    instructions: str = Field(default="", max_length=8000)


def _public_mcp_server(m: MCPServer) -> dict:
    """An MCP server, safe to send to the client: credential VALUES are stripped, only
    the key names are exposed (write-only credential pattern, like the API key hint)."""
    return {
        "name": m.name,
        "transport": m.transport,
        "command": m.command,
        "args": m.args,
        "url": m.url,
        "enabled": m.enabled,
        "env_keys": list(m.env.keys()),
        "header_keys": list(m.headers.keys()),
        "allowed_tools": m.allowed_tools,
    }


def _public_settings(user: str) -> dict:
    """A user's settings, safe to expose to the client (never raw API key / MCP secrets)."""
    s = settings_store.get(user)
    key = s.openrouter_api_key or os.environ.get("OPENROUTER_API_KEY")
    hint = None
    if key:
        hint = f"…{key[-4:]}" if len(key) >= 4 else "set"
    return {
        "has_api_key": bool(key),
        "api_key_hint": hint,
        "api_key_source": (
            "settings"
            if s.openrouter_api_key
            else ("env" if os.environ.get("OPENROUTER_API_KEY") else None)
        ),
        "custom_prompts": [p.model_dump() for p in s.custom_prompts],
        "mcp_servers": [_public_mcp_server(m) for m in s.mcp_servers],
    }


# ======================= Public routes =======================


@app.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/auth/status")
def auth_status() -> dict:
    """Whether an account exists yet (drives register vs login on the client)."""
    return {"registered": auth.has_account()}


@app.post("/auth/register")
def auth_register(body: AuthBody) -> dict:
    """Create the single account on first connection."""
    try:
        token = auth.register(body.username, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"token": token, "username": body.username.strip()}


@app.post("/auth/login")
def auth_login(body: AuthBody) -> dict:
    """Log in with the account credentials."""
    try:
        token = auth.login(body.username, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return {"token": token, "username": body.username.strip()}


# ==================== Protected routes (JWT) ====================

protected = APIRouter(dependencies=[Depends(auth.require_auth)])


@protected.get("/config")
def get_config(user: str = Depends(auth.require_auth)) -> AgentConfig:
    """Return the current user's agent config."""
    return config_store.get(user)


@protected.post("/config")
def update_config(
    config: AgentConfig, user: str = Depends(auth.require_auth)
) -> AgentConfig:
    """Update the user's agent config (hot-reload, no restart)."""
    return config_store.update(user, config)


@protected.get("/tools")
def get_tools(user: str = Depends(auth.require_auth)) -> list[dict]:
    """List built-in tools, flagging which are enabled in the user's config."""
    return list_tools(config_store.get(user).tools_enabled)


@protected.get("/models")
async def get_models() -> list[dict]:
    """Return available models — live from OpenRouter, with a curated fallback."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://openrouter.ai/api/v1/models")
            resp.raise_for_status()
            data = resp.json().get("data", [])
        models = []
        for m in data:
            mid = m.get("id", "")
            provider = mid.split("/")[0] if "/" in mid else "other"
            models.append({"value": mid, "label": m.get("name", mid), "provider": provider})
        return models or CURATED_MODELS
    except Exception:
        return CURATED_MODELS


# ----- Settings: API key + custom prompts -----


@protected.get("/settings")
def get_settings(user: str = Depends(auth.require_auth)) -> dict:
    """Return the user's non-secret settings (key presence, prompts, MCP servers)."""
    return _public_settings(user)


@protected.put("/settings/api-key")
def set_api_key(body: ApiKeyBody, user: str = Depends(auth.require_auth)) -> dict:
    """Set (or clear, if empty) this user's OpenRouter API key."""
    settings_store.set_api_key(user, body.api_key)
    return _public_settings(user)


@protected.delete("/settings/api-key")
def clear_api_key(user: str = Depends(auth.require_auth)) -> dict:
    """Clear the user's key (falls back to the .env key, if any)."""
    settings_store.set_api_key(user, None)
    return _public_settings(user)


@protected.post("/prompts")
def add_prompt(prompt: CustomPrompt, user: str = Depends(auth.require_auth)) -> dict:
    """Create or update one of the user's custom prompts (invoked with /<name>)."""
    settings_store.upsert_prompt(user, prompt)
    return _public_settings(user)


@protected.delete("/prompts/{name}")
def delete_prompt(name: str, user: str = Depends(auth.require_auth)) -> dict:
    """Delete one of the user's custom prompts by name."""
    settings_store.delete_prompt(user, name)
    return _public_settings(user)


# ----- MCP servers -----


@protected.get("/mcp/servers")
def list_mcp_servers(user: str = Depends(auth.require_auth)) -> dict:
    return _public_settings(user)


@protected.post("/mcp/servers")
def upsert_mcp_server(server: MCPServer, user: str = Depends(auth.require_auth)) -> dict:
    settings_store.upsert_mcp_server(user, server)
    return _public_settings(user)


@protected.delete("/mcp/servers/{name}")
def delete_mcp_server(name: str, user: str = Depends(auth.require_auth)) -> dict:
    settings_store.delete_mcp_server(user, name)
    return _public_settings(user)


@protected.post("/mcp/servers/{name}/toggle")
def toggle_mcp_server(name: str, user: str = Depends(auth.require_auth)) -> dict:
    settings_store.toggle_mcp_server(user, name)
    return _public_settings(user)


@protected.put("/mcp/servers/{name}/tools")
def set_mcp_allowed_tools(
    name: str, body: AllowedToolsBody, user: str = Depends(auth.require_auth)
) -> dict:
    """Set a server's per-tool allowlist (namespaced names; None = all enabled).
    Credentials are untouched (write-only)."""
    settings_store.set_allowed_tools(user, name, body.allowed_tools)
    return _public_settings(user)


@protected.get("/mcp/tools")
async def mcp_tools(user: str = Depends(auth.require_auth)) -> list[dict]:
    """Connect to each of the user's enabled MCP servers and report its tools."""
    return await discover(settings_store.get(user).mcp_servers)


@protected.get("/connectors")
def list_connectors(user: str = Depends(auth.require_auth)) -> list[dict]:
    """Curated MCP connector catalog — templates for one-click 'Connect <tool>' cards."""
    return CONNECTOR_CATALOG


# ----- Long-term memory (durable facts the agent recalls across sessions) -----


@protected.get("/memories")
def list_memories(user: str = Depends(auth.require_auth)) -> dict:
    """The user's saved long-term memories (newest first)."""
    return {"memories": list(reversed(memory_store.get(user)))}


@protected.post("/memories")
def add_memory(body: MemoryBody, user: str = Depends(auth.require_auth)) -> dict:
    """Manually add a memory (the agent also adds them via its `remember` tool)."""
    memory_store.add(user, body.content)
    return {"memories": list(reversed(memory_store.get(user)))}


@protected.delete("/memories/{mem_id}")
def delete_memory(mem_id: str, user: str = Depends(auth.require_auth)) -> dict:
    """Forget one memory by id."""
    memory_store.delete(user, mem_id)
    return {"memories": list(reversed(memory_store.get(user)))}


@protected.delete("/memories")
def clear_memories(user: str = Depends(auth.require_auth)) -> dict:
    """Forget all of the user's memories."""
    memory_store.clear(user)
    return {"memories": []}


# ----- RAG knowledge base (semantic search over the user's documents) -----


@protected.get("/rag/documents")
def list_rag_documents(user: str = Depends(auth.require_auth)) -> dict:
    """The user's uploaded documents (title + chunk count)."""
    return {"documents": db.list_rag_sources(user)}


@protected.post("/rag/documents")
def add_rag_document(body: RagBody, user: str = Depends(auth.require_auth)) -> dict:
    """Chunk + embed + store a document so the agent can search it."""
    s = settings_store.get(user)
    key = s.openrouter_api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="No OpenRouter API key configured (needed to embed documents).",
        )
    # Per-user cap: bound embedding spend + DB growth (registration is open). A re-upload
    # of an existing title is a replace, so it doesn't count against the new-doc budget.
    title = body.title.strip()
    docs = db.list_rag_sources(user)
    is_replace = any(d["title"] == title for d in docs)
    total_chunks = sum(d["chunks"] for d in docs)
    if not is_replace and (
        len(docs) >= rag.MAX_DOCS or total_chunks >= rag.MAX_TOTAL_CHUNKS
    ):
        raise HTTPException(
            status_code=429,
            detail="Knowledge base is full — delete some documents before adding more.",
        )
    try:
        chunks = rag.ingest(user, title, body.content, key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not add document: {exc}")
    return {"chunks": chunks, "documents": db.list_rag_sources(user)}


@protected.delete("/rag/documents")
def delete_rag_document(title: str, user: str = Depends(auth.require_auth)) -> dict:
    """Delete a document (all its chunks) by title. Title is a query param so it can
    safely contain slashes / special characters (a path param can't)."""
    db.delete_rag_source(user, title)
    return {"documents": db.list_rag_sources(user)}


# ----- Scheduled tasks (background agent runs) -----


def _validate_cron(body: scheduled.ScheduledTaskIn) -> None:
    if not scheduled.is_valid_cron(body.cron):
        raise HTTPException(status_code=400, detail="Invalid cron expression.")
    if not scheduled.interval_ok(body.cron):
        raise HTTPException(
            status_code=400, detail="Schedule is too frequent (minimum is hourly)."
        )


@protected.get("/scheduled")
def list_scheduled(user: str = Depends(auth.require_auth)) -> dict:
    """The user's scheduled tasks (with their latest run result)."""
    return {"tasks": db.list_scheduled_tasks(user)}


@protected.post("/scheduled")
def create_scheduled(
    body: scheduled.ScheduledTaskIn, user: str = Depends(auth.require_auth)
) -> dict:
    """Create a scheduled task (validates the cron + per-user cap)."""
    _validate_cron(body)
    if len(db.list_scheduled_tasks(user)) >= scheduled.MAX_TASKS_PER_USER:
        raise HTTPException(
            status_code=429, detail="Too many scheduled tasks — delete one first."
        )
    db.insert_scheduled_task(
        {
            "username": user,
            "name": body.name.strip(),
            "prompt": body.prompt,
            "cron": body.cron.strip(),
            "enabled": body.enabled,
            "next_run_at": scheduled.next_run(body.cron).isoformat(),
        }
    )
    return {"tasks": db.list_scheduled_tasks(user)}


@protected.put("/scheduled/{task_id}")
def update_scheduled(
    task_id: int,
    body: scheduled.ScheduledTaskIn,
    user: str = Depends(auth.require_auth),
) -> dict:
    """Edit a task (re-validates cron + recomputes the next run)."""
    _validate_cron(body)
    db.update_scheduled_task(
        user,
        task_id,
        {
            "name": body.name.strip(),
            "prompt": body.prompt,
            "cron": body.cron.strip(),
            "enabled": body.enabled,
            "next_run_at": scheduled.next_run(body.cron).isoformat(),
        },
    )
    return {"tasks": db.list_scheduled_tasks(user)}


@protected.post("/scheduled/{task_id}/toggle")
def toggle_scheduled(task_id: int, user: str = Depends(auth.require_auth)) -> dict:
    """Enable / disable a task without editing it."""
    cur = next((t for t in db.list_scheduled_tasks(user) if t["id"] == task_id), None)
    if cur is not None:
        db.update_scheduled_task(user, task_id, {"enabled": not cur["enabled"]})
    return {"tasks": db.list_scheduled_tasks(user)}


@protected.delete("/scheduled/{task_id}")
def delete_scheduled(task_id: int, user: str = Depends(auth.require_auth)) -> dict:
    db.delete_scheduled_task(user, task_id)
    return {"tasks": db.list_scheduled_tasks(user)}


# ----- Chat -----


@protected.post("/chat")
async def chat(req: ChatRequest, user: str = Depends(auth.require_auth)):
    """Stream the agent's response to a message as Server-Sent Events."""
    config = config_store.get(user)
    settings = settings_store.get(user)
    return EventSourceResponse(
        stream_chat(
            config, settings, req.message, req.session_id, user, req.project_id
        )
    )


@protected.get("/chat/cost/{generation_id}")
async def chat_cost(generation_id: str, user: str = Depends(auth.require_auth)) -> dict:
    """OpenRouter cost (USD) for a generation — fetched on demand from the UI."""
    cost = await fetch_generation_cost(
        generation_id, settings_store.get(user).openrouter_api_key
    )
    return {"cost": cost}


@protected.get("/sessions")
def get_sessions(user: str = Depends(auth.require_auth)) -> dict:
    """The user's conversations (session_id, title, updated_at) for the sidebar."""
    return {"sessions": db.list_sessions(user)}


# ----- Projects (group conversations, like Claude/ChatGPT projects) -----


@protected.get("/projects")
def list_projects(user: str = Depends(auth.require_auth)) -> dict:
    """The user's projects (newest first)."""
    return {"projects": db.list_projects(user)}


MAX_PROJECTS_PER_USER = 50  # bound DB growth — registration is open


@protected.post("/projects")
def create_project(body: ProjectBody, user: str = Depends(auth.require_auth)) -> dict:
    """Create a project (a folder of conversations, with optional instructions)."""
    if len(db.list_projects(user)) >= MAX_PROJECTS_PER_USER:
        raise HTTPException(
            status_code=429, detail="Too many projects — delete one first."
        )
    db.insert_project(user, body.name.strip(), body.instructions.strip())
    return {"projects": db.list_projects(user)}


@protected.put("/projects/{project_id}")
def update_project(
    project_id: int, body: ProjectBody, user: str = Depends(auth.require_auth)
) -> dict:
    """Rename a project / edit its instructions (scoped to the owner)."""
    db.update_project(user, project_id, body.name.strip(), body.instructions.strip())
    return {"projects": db.list_projects(user)}


@protected.delete("/projects/{project_id}")
def delete_project(project_id: int, user: str = Depends(auth.require_auth)) -> dict:
    """Delete a project; its conversations survive, just unassigned."""
    if not db.delete_project(user, project_id):
        raise HTTPException(status_code=502, detail="Could not delete the project.")
    return {"projects": db.list_projects(user)}


@protected.get("/sessions/{session_id}")
def get_session(session_id: str, user: str = Depends(auth.require_auth)) -> dict:
    """The session's messages (with tool calls) so the UI can re-hydrate on reload."""
    out = [
        {
            "role": "assistant" if m.get("role") == "ai" else "user",
            "content": m.get("content", ""),
            "tool_calls": m.get("tool_calls", []),
        }
        for m in session_store.messages_ui(user, session_id)
    ]
    return {"messages": out}


@protected.delete("/sessions/{session_id}")
def clear_session(session_id: str, user: str = Depends(auth.require_auth)) -> dict:
    """Clear one of the user's session conversation histories."""
    session_store.clear(user, session_id)
    return {"status": "cleared", "session_id": session_id}


# ----- Scheduler tick (called by the external keep-alive cron, not a logged-in user) -----

# Serialises overlapping ticks (defence in depth on top of the per-task DB claim) and
# caps how many agent runs execute at once on the small free dyno.
_scheduler_lock = asyncio.Lock()
_SCHED_CONCURRENCY = 4


async def _run_scheduled_task(task: dict, now_iso: str) -> bool:
    """Claim a due task (advance next_run_at FIRST, atomically) and, if we won the claim,
    run it. Returns whether it actually ran (vs already claimed by an overlapping tick)."""
    try:
        new_next = scheduled.next_run(task["cron"]).isoformat()
    except Exception:  # noqa: BLE001
        db.mark_task_run(task["id"], {"enabled": False, "last_error": "invalid cron"})
        return False
    # Atomic compare-and-swap: only one tick advances next_run_at past now → only one runs.
    if not db.claim_due_task(task["id"], new_next, now_iso):
        return False
    now = datetime.now(timezone.utc)
    fields: dict = {"last_run_at": now.isoformat()}
    try:
        cfg = config_store.get(task["username"])
        s = settings_store.get(task["username"])
        result = await asyncio.wait_for(
            run_once(cfg, s, task["prompt"], task["username"]), timeout=120
        )
        fields["last_result"] = (result or "")[: scheduled.MAX_RESULT_LEN]
        fields["last_error"] = None
    except Exception as exc:  # noqa: BLE001
        fields["last_error"] = str(exc)[:500]
    db.mark_task_run(task["id"], fields)  # next_run_at was already advanced by the claim
    return True


@app.post("/scheduled/run-due")
async def run_due(request: Request) -> dict:
    """Run every due scheduled task. Gated by a shared secret (the cron sends it) so it
    can't be triggered by just anyone — running tasks costs the users' API credits."""
    secret = os.environ.get("SCHEDULER_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Scheduler not configured.")
    provided = request.headers.get("X-Scheduler-Secret", "")
    if not hmac.compare_digest(provided, secret):
        raise HTTPException(status_code=401, detail="Bad scheduler secret.")
    # A second tick that overlaps a still-running one returns immediately (no double-run).
    if _scheduler_lock.locked():
        return {"ran": 0, "busy": True}
    async with _scheduler_lock:
        now_iso = datetime.now(timezone.utc).isoformat()
        due = db.list_due_tasks(25)
        sem = asyncio.Semaphore(_SCHED_CONCURRENCY)

        async def _guarded(t: dict) -> bool:
            async with sem:
                return await _run_scheduled_task(t, now_iso)

        results = await asyncio.gather(
            *[_guarded(t) for t in due], return_exceptions=True
        )
        return {"ran": sum(1 for r in results if r is True), "due": len(due)}


app.include_router(protected)
