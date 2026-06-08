"""FastAPI entrypoint: routes, CORS, auth gate, and app wiring.

Public routes: /health and /auth/*. Everything else is behind a JWT login gate
(see auth.py). The agent is rebuilt from ``config_store`` on every /chat request.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

# Load env FIRST, before importing modules (agent.py, auth.py) that read env at import.
load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

import httpx  # noqa: E402
from fastapi import APIRouter, Depends, FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sse_starlette.sse import EventSourceResponse  # noqa: E402

import auth  # noqa: E402
from agent import stream_chat  # noqa: E402
from config import AgentConfig, config_store  # noqa: E402
from mcp_manager import discover  # noqa: E402
from schemas import ChatRequest  # noqa: E402
from sessions import session_store  # noqa: E402
from settings import CustomPrompt, MCPServer, settings_store  # noqa: E402
from tools import list_tools  # noqa: E402

app = FastAPI(title="Agent Playground API", version="1.0.0")

# --- CORS: allow the local frontend and the configured FRONTEND_URL ---
_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list({"http://localhost:3000", _frontend_url}),
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


def _public_settings(user: str) -> dict:
    """A user's settings, safe to expose to the client (never the raw API key)."""
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
        "mcp_servers": [m.model_dump() for m in s.mcp_servers],
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


@protected.get("/mcp/tools")
async def mcp_tools(user: str = Depends(auth.require_auth)) -> list[dict]:
    """Connect to each of the user's enabled MCP servers and report its tools."""
    return await discover(settings_store.get(user).mcp_servers)


# ----- Chat -----


@protected.post("/chat")
async def chat(req: ChatRequest, user: str = Depends(auth.require_auth)):
    """Stream the agent's response to a message as Server-Sent Events."""
    config = config_store.get(user)
    settings = settings_store.get(user)
    return EventSourceResponse(
        stream_chat(config, settings, req.message, req.session_id, user)
    )


@protected.delete("/sessions/{session_id}")
def clear_session(session_id: str, user: str = Depends(auth.require_auth)) -> dict:
    """Clear one of the user's session conversation histories."""
    session_store.clear(user, session_id)
    return {"status": "cleared", "session_id": session_id}


app.include_router(protected)
