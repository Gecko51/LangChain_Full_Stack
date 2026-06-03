"""FastAPI entrypoint: routes, CORS, and app wiring.

The agent is rebuilt from ``config_store`` on every /chat request, so config changes
apply immediately without a restart.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

# Load env FIRST, before importing modules (agent.py) that read the API key from the
# environment at import time. Loads the backend dir and the project-root .env.
load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

import httpx  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sse_starlette.sse import EventSourceResponse  # noqa: E402

from agent import stream_chat  # noqa: E402
from config import AgentConfig, config_store  # noqa: E402
from schemas import ChatRequest  # noqa: E402
from sessions import session_store  # noqa: E402
from settings import CustomPrompt, settings_store  # noqa: E402
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


def _public_settings() -> dict:
    """Settings safe to expose to the client (never the raw API key)."""
    s = settings_store.get()
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
    }


@app.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/config")
def get_config() -> AgentConfig:
    """Return the current agent config."""
    return config_store.get()


@app.post("/config")
def update_config(config: AgentConfig) -> AgentConfig:
    """Update the agent config (hot-reload, no restart)."""
    return config_store.update(config)


@app.get("/tools")
def get_tools() -> list[dict]:
    """List built-in tools, flagging which are enabled in the current config."""
    return list_tools(config_store.get().tools_enabled)


@app.get("/models")
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
        # Network/API issue -> fall back to the curated list.
        return CURATED_MODELS


# ----- Settings: API key + custom prompts -----


@app.get("/settings")
def get_settings() -> dict:
    """Return non-secret settings (API-key presence + custom prompts)."""
    return _public_settings()


@app.put("/settings/api-key")
def set_api_key(body: ApiKeyBody) -> dict:
    """Set (or clear, if empty) the OpenRouter API key used by the agent."""
    settings_store.set_api_key(body.api_key)
    if body.api_key.strip():
        os.environ["OPENROUTER_API_KEY"] = body.api_key.strip()
    return _public_settings()


@app.delete("/settings/api-key")
def clear_api_key() -> dict:
    """Clear the UI-provided key (falls back to the .env key, if any)."""
    settings_store.set_api_key(None)
    return _public_settings()


@app.post("/prompts")
def add_prompt(prompt: CustomPrompt) -> dict:
    """Create or update a custom prompt (invoked from the chat with /<name>)."""
    settings_store.upsert_prompt(prompt)
    return _public_settings()


@app.delete("/prompts/{name}")
def delete_prompt(name: str) -> dict:
    """Delete a custom prompt by name."""
    settings_store.delete_prompt(name)
    return _public_settings()


@app.post("/chat")
async def chat(req: ChatRequest):
    """Stream the agent's response to a message as Server-Sent Events."""
    config = config_store.get()
    return EventSourceResponse(stream_chat(config, req.message, req.session_id))


@app.delete("/sessions/{session_id}")
def clear_session(session_id: str) -> dict:
    """Clear a session's conversation history (the 'Clear history' button)."""
    session_store.clear(session_id)
    return {"status": "cleared", "session_id": session_id}
