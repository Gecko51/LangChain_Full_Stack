"""In-memory conversation history per session, with window trimming.

History is process memory only (lost on restart) — enough for a demo. Persisting
conversations is a Phase 2 item.
"""
from __future__ import annotations

from langchain_core.messages import BaseMessage


class SessionStore:
    """Keeps an ordered message list per session id."""

    def __init__(self) -> None:
        self._sessions: dict[str, list[BaseMessage]] = {}

    def history(self, session_id: str, window: int | None = None) -> list[BaseMessage]:
        """Return the session's messages, optionally trimmed to the last ``window``."""
        msgs = self._sessions.get(session_id, [])
        if window is not None and window > 0:
            return msgs[-window:]
        return list(msgs)

    def append(self, session_id: str, *messages: BaseMessage) -> None:
        """Append one or more messages to the session history."""
        self._sessions.setdefault(session_id, []).extend(messages)

    def clear(self, session_id: str) -> None:
        """Forget a session's history."""
        self._sessions.pop(session_id, None)


# Module-level singleton imported across the app.
session_store = SessionStore()
