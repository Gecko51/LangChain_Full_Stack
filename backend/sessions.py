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
    """Keeps an ordered message list per (username, session_id). Private per user."""

    def __init__(self) -> None:
        self._sessions: dict[tuple[str, str], list[BaseMessage]] = {}
        self._hydrated: set[tuple[str, str]] = set()

    def _ensure_loaded(self, username: str, session_id: str) -> None:
        """Load a session from Supabase the first time it's touched."""
        key = (username, session_id)
        if key in self._hydrated:
            return
        self._hydrated.add(key)
        if key not in self._sessions:
            stored = db.load_session(username, session_id)
            if stored:
                self._sessions[key] = [_deserialize(d) for d in stored]

    def history(
        self, username: str, session_id: str, window: int | None = None
    ) -> list[BaseMessage]:
        """Return the session's messages, optionally trimmed to the last ``window``."""
        self._ensure_loaded(username, session_id)
        msgs = self._sessions.get((username, session_id), [])
        if window is not None and window > 0:
            return msgs[-window:]
        return list(msgs)

    def append(self, username: str, session_id: str, *messages: BaseMessage) -> None:
        """Append messages and persist the session (best-effort)."""
        self._ensure_loaded(username, session_id)
        key = (username, session_id)
        self._sessions.setdefault(key, []).extend(messages)
        db.save_session(
            username, session_id, [_serialize(m) for m in self._sessions[key]]
        )

    def clear(self, username: str, session_id: str) -> None:
        """Forget a session's history (memory + Supabase)."""
        key = (username, session_id)
        self._sessions.pop(key, None)
        self._hydrated.discard(key)
        db.delete_session(username, session_id)


# Module-level singleton imported across the app.
session_store = SessionStore()
