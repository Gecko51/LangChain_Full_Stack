"""Conversation history per session, with window trimming.

In-memory cache, hydrated from Supabase (``chat_sessions``) on first access and
persisted there on every append. When Supabase is unavailable it stays in memory
(lost on restart) — the rest of the app keeps working.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

import db


def _serialize(m: BaseMessage) -> dict:
    role = "ai" if isinstance(m, AIMessage) else "human"
    content = m.content if isinstance(m.content, str) else str(m.content)
    return {"role": role, "content": content}


def _deserialize(d: dict) -> BaseMessage:
    content = d.get("content", "")
    return AIMessage(content=content) if d.get("role") == "ai" else HumanMessage(content=content)


class SessionStore:
    """Keeps an ordered message list per session id."""

    def __init__(self) -> None:
        self._sessions: dict[str, list[BaseMessage]] = {}
        self._hydrated: set[str] = set()

    def _ensure_loaded(self, session_id: str) -> None:
        """Load a session from Supabase the first time it's touched."""
        if session_id in self._hydrated:
            return
        self._hydrated.add(session_id)
        if session_id not in self._sessions:
            stored = db.load_session(session_id)
            if stored:
                self._sessions[session_id] = [_deserialize(d) for d in stored]

    def history(self, session_id: str, window: int | None = None) -> list[BaseMessage]:
        """Return the session's messages, optionally trimmed to the last ``window``."""
        self._ensure_loaded(session_id)
        msgs = self._sessions.get(session_id, [])
        if window is not None and window > 0:
            return msgs[-window:]
        return list(msgs)

    def append(self, session_id: str, *messages: BaseMessage) -> None:
        """Append messages and persist the session (best-effort)."""
        self._ensure_loaded(session_id)
        self._sessions.setdefault(session_id, []).extend(messages)
        db.save_session(session_id, [_serialize(m) for m in self._sessions[session_id]])

    def clear(self, session_id: str) -> None:
        """Forget a session's history (memory + Supabase)."""
        self._sessions.pop(session_id, None)
        self._hydrated.discard(session_id)
        db.delete_session(session_id)


# Module-level singleton imported across the app.
session_store = SessionStore()
