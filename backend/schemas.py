"""Request/response models for the HTTP API (separate from the agent config)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Body of POST /chat."""

    message: str = Field(min_length=1, max_length=32000)
    # Conversation id; lets several chats keep independent histories.
    session_id: str = Field(default="default", max_length=128)


class ToolInfo(BaseModel):
    """One built-in tool, as returned by GET /tools."""

    name: str
    description: str
    enabled: bool


class ModelInfo(BaseModel):
    """One selectable model, as returned by GET /models."""

    value: str  # OpenRouter id, e.g. "anthropic/claude-sonnet-4-5"
    label: str
    provider: str
