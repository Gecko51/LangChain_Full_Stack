"""Optional Supabase persistence.

If ``SUPABASE_URL`` + ``SUPABASE_KEY`` are set, the stores persist to Supabase;
otherwise — or on any error (e.g. a paused free-tier project) — they fall back to
local JSON files / in-memory. Every call here is best-effort and never raises.

Per-user schema: ``agent_config`` / ``app_settings`` keep one JSONB row per username;
``chat_sessions`` keeps one row per (username, session_id) with the messages as JSONB.
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


# ----- per-user documents (agent_config, app_settings) -----


def load_doc(table: str, username: str) -> dict | None:
    """The user's document for ``table``, or None."""
    client = _get_client()
    if not client:
        return None
    try:
        resp = (
            client.table(table)
            .select("data")
            .eq("username", username)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0]["data"] if rows else None
    except Exception:
        return None


def save_doc(table: str, username: str, data: dict) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table(table).upsert(
            {"username": username, "data": data}, on_conflict="username"
        ).execute()
        return True
    except Exception:
        return False


# ----- chat sessions -----


def load_session(username: str, session_id: str) -> list | None:
    client = _get_client()
    if not client:
        return None
    try:
        resp = (
            client.table("chat_sessions")
            .select("messages")
            .eq("username", username)
            .eq("session_id", session_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0]["messages"] if rows else []
    except Exception:
        return None


def save_session(username: str, session_id: str, messages: list) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table("chat_sessions").upsert(
            {"username": username, "session_id": session_id, "messages": messages},
            on_conflict="username,session_id",
        ).execute()
        return True
    except Exception:
        return False


def delete_session(username: str, session_id: str) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table("chat_sessions").delete().eq("username", username).eq(
            "session_id", session_id
        ).execute()
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


# ----- chat archives (saved past conversations) -----


def list_archives(username: str) -> list[dict]:
    """Archive summaries (id, title, created_at) for a user, newest first."""
    client = _get_client()
    if not client:
        return []
    try:
        resp = (
            client.table("chat_archives")
            .select("id,title,created_at")
            .eq("username", username)
            .order("created_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception:
        return []


def get_archive(username: str, archive_id: str) -> dict | None:
    client = _get_client()
    if not client:
        return None
    try:
        resp = (
            client.table("chat_archives")
            .select("id,title,messages")
            .eq("username", username)
            .eq("id", archive_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def insert_archive(username: str, title: str, messages: list) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table("chat_archives").insert(
            {"username": username, "title": title, "messages": messages}
        ).execute()
        return True
    except Exception:
        return False


def delete_archive(username: str, archive_id: str) -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        client.table("chat_archives").delete().eq("username", username).eq(
            "id", archive_id
        ).execute()
        return True
    except Exception:
        return False


def prune_archives(username: str, keep: int) -> None:
    """Keep only the newest ``keep`` archives for a user; delete the older ones."""
    client = _get_client()
    if not client or keep < 0:
        return
    try:
        resp = (
            client.table("chat_archives")
            .select("id")
            .eq("username", username)
            .order("created_at", desc=True)
            .execute()
        )
        ids = [r["id"] for r in (resp.data or [])][keep:]
        if ids:
            client.table("chat_archives").delete().in_("id", ids).execute()
    except Exception:
        pass


# ----- RAG documents (pgvector semantic search over the user's knowledge) -----


def insert_rag_chunks(rows: list[dict]) -> bool:
    """Insert chunk rows {username, title, content, embedding}. Embedding = list[float]."""
    client = _get_client()
    if not client or not rows:
        return False
    try:
        client.table("rag_documents").insert(rows).execute()
        return True
    except Exception:
        return False


def match_rag(username: str, query_embedding: list[float], k: int = 5) -> list[dict]:
    """Top-k chunks for a user by cosine similarity (via the match_rag_documents RPC)."""
    client = _get_client()
    if not client:
        return []
    try:
        resp = client.rpc(
            "match_rag_documents",
            {
                "query_embedding": query_embedding,
                "match_username": username,
                "match_count": k,
            },
        ).execute()
        return resp.data or []
    except Exception:
        return []


def list_rag_sources(username: str) -> list[dict]:
    """The user's documents grouped by title, with a chunk count each."""
    client = _get_client()
    if not client:
        return []
    try:
        resp = (
            client.table("rag_documents")
            .select("title")
            .eq("username", username)
            .execute()
        )
        counts: dict[str, int] = {}
        for r in resp.data or []:
            counts[r["title"]] = counts.get(r["title"], 0) + 1
        return [{"title": t, "chunks": n} for t, n in sorted(counts.items())]
    except Exception:
        return []


def delete_rag_source(username: str, title: str) -> bool:
    """Delete all chunks of one document (by title) for a user."""
    client = _get_client()
    if not client:
        return False
    try:
        client.table("rag_documents").delete().eq("username", username).eq(
            "title", title
        ).execute()
        return True
    except Exception:
        return False
