"""Optional Supabase persistence.

If ``SUPABASE_URL`` + ``SUPABASE_KEY`` are set, the stores persist to Supabase;
otherwise — or on any error (e.g. a paused free-tier project) — they fall back to
local JSON files / in-memory. Every call here is best-effort and never raises.

Document-style schema: ``agent_config`` / ``app_settings`` keep a single JSONB row
(id = 1); ``chat_sessions`` keeps one row per session with the messages as JSONB.
"""
from __future__ import annotations

import os

_client = None
_init_done = False


def _get_client():
    """Lazily build the Supabase client (no network at creation). None if unconfigured."""
    global _client, _init_done
    if _init_done:
        return _client
    _init_done = True
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        return None
    try:
        from supabase import ClientOptions, create_client

        # Short timeout so a paused/unreachable project never hangs the app.
        _client = create_client(
            url, key, options=ClientOptions(postgrest_client_timeout=8)
        )
    except Exception:
        try:
            from supabase import create_client

            _client = create_client(url, key)
        except Exception:
            _client = None
    return _client


def enabled() -> bool:
    return _get_client() is not None


# ----- single-row documents (agent_config, app_settings) -----


def load_doc(table: str) -> dict | None:
    client = _get_client()
    if not client:
        return None
    try:
        resp = client.table(table).select("data").eq("id", 1).limit(1).execute()
        rows = resp.data or []
        return rows[0]["data"] if rows else None
    except Exception:
        return None


def save_doc(table: str, data: dict) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table(table).upsert({"id": 1, "data": data}).execute()
        return True
    except Exception:
        return False


# ----- chat sessions -----


def load_session(session_id: str) -> list | None:
    client = _get_client()
    if not client:
        return None
    try:
        resp = (
            client.table("chat_sessions")
            .select("messages")
            .eq("session_id", session_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0]["messages"] if rows else []
    except Exception:
        return None


def save_session(session_id: str, messages: list) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table("chat_sessions").upsert(
            {"session_id": session_id, "messages": messages}
        ).execute()
        return True
    except Exception:
        return False


def delete_session(session_id: str) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table("chat_sessions").delete().eq("session_id", session_id).execute()
        return True
    except Exception:
        return False


# ----- auth users -----


def first_user() -> dict | None:
    """The single admin account (oldest user), or None."""
    client = _get_client()
    if not client:
        return None
    try:
        resp = (
            client.table("app_users")
            .select("username,password_hash")
            .order("created_at")
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def get_user(username: str) -> dict | None:
    """One user by username (for login / uniqueness checks)."""
    client = _get_client()
    if not client:
        return None
    try:
        resp = (
            client.table("app_users")
            .select("username,password_hash")
            .eq("username", username)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def insert_user(username: str, password_hash: str) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table("app_users").insert(
            {"username": username, "password_hash": password_hash}
        ).execute()
        return True
    except Exception:
        return False
