"""Conversation history per session, with window trimming.

In-memory cache (a list of plain dicts per session), hydrated from Supabase
(``chat_sessions``) on first access and persisted there on every change. When Supabase
is unavailable it stays in memory (lost on restart) — the rest of the app keeps working.

Each stored message is ``{"role": "human"|"ai", "content": str, "tool_calls"?: [...]}``.
The ``tool_calls`` are kept ONLY for the UI (so a reloaded conversation can re-render its
tool bubbles). The agent's replay (``history()``) deliberately drops them and returns
text-only messages — a clean, always-valid sequence with no orphaned tool calls.
"""
from __future__ import annotations

import time

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

import db


def _to_message(d: dict) -> BaseMessage:
    """Stored dict -> a text-only LangChain message for the agent (tool_calls dropped)."""
    content = d.get("content", "")
    return AIMessage(content=content) if d.get("role") == "ai" else HumanMessage(content=content)


class SessionStore:
    """Keeps an ordered message list per (username, session_id). Private per user."""

    def __init__(self) -> None:
        self._sessions: dict[tuple[str, str], list[dict]] = {}
        self._hydrated: set[tuple[str, str]] = set()
        # key -> when it was last cleared/deleted. Lets append_turn drop a persist for
        # a turn that STARTED before the user deleted the conversation (otherwise the
        # late write would silently re-create the just-deleted row).
        self._cleared: dict[tuple[str, str], float] = {}

    def _ensure_loaded(self, username: str, session_id: str) -> None:
        """Load a session from Supabase the first time it's touched."""
        key = (username, session_id)
        if key in self._hydrated:
            return
        self._hydrated.add(key)
        if key not in self._sessions:
            stored = db.load_session(username, session_id)
            if stored:
                # Stored rows are already {role, content, tool_calls?} dicts.
                self._sessions[key] = [dict(d) for d in stored if isinstance(d, dict)]

    def history(
        self, username: str, session_id: str, window: int | None = None
    ) -> list[BaseMessage]:
        """The session as TEXT-ONLY messages for the agent, optionally trimmed to the
        last ``window`` messages. Tool calls are dropped so the replayed sequence is
        always valid (no AIMessage tool_calls without their results)."""
        self._ensure_loaded(username, session_id)
        msgs = self._sessions.get((username, session_id), [])
        if window is not None and window > 0:
            msgs = msgs[-window:]
        return [_to_message(d) for d in msgs]

    def messages_ui(self, username: str, session_id: str) -> list[dict]:
        """The full stored messages (with tool_calls) for the frontend to re-hydrate."""
        self._ensure_loaded(username, session_id)
        return [dict(d) for d in self._sessions.get((username, session_id), [])]

    def append_turn(
        self,
        username: str,
        session_id: str,
        user_text: str,
        assistant_text: str,
        tool_calls: list[dict] | None = None,
        project_id: int | None = None,
        turn_started: float | None = None,
    ) -> None:
        """Append one user+assistant turn and persist the session (best-effort).
        ``tool_calls`` is a UI list of ``{id, name, input, output}`` (display only);
        ``project_id`` assigns the conversation to a project (sidebar grouping).
        A turn whose conversation was deleted AFTER it started is dropped — its late
        persist must not resurrect the deleted row. (A normal turn after "Clear
        history" started AFTER the clear, so it persists as expected.)"""
        key = (username, session_id)
        if turn_started is not None and self._cleared.get(key, 0.0) > turn_started:
            return
        self._ensure_loaded(username, session_id)
        lst = self._sessions.setdefault(key, [])
        lst.append({"role": "human", "content": user_text})
        ai: dict = {"role": "ai", "content": assistant_text}
        if tool_calls:
            ai["tool_calls"] = tool_calls
        lst.append(ai)
        db.save_session(username, session_id, lst, project_id)

    def clear(self, username: str, session_id: str) -> None:
        """Forget a session's history (memory + Supabase)."""
        key = (username, session_id)
        self._sessions.pop(key, None)
        self._hydrated.discard(key)
        self._cleared[key] = time.time()  # tombstone: see append_turn
        db.delete_session(username, session_id)


# Module-level singleton imported across the app.
session_store = SessionStore()
