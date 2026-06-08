"""Login gate with JWT sessions and multiple accounts.

Accounts (username + bcrypt password) are stored in Supabase (``app_users``) with a
local JSON mirror, so login keeps working if Supabase is paused. Anyone can create an
account (open registration) — they all share the same playground. Passwords are
bcrypt-hashed; tokens are JWTs signed with ``AUTH_SECRET``.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import bcrypt
import jwt
from fastapi import Header, HTTPException

import db

USERS_FILE = Path(__file__).parent / "auth_users.json"
_SECRET = os.environ.get("AUTH_SECRET") or "dev-insecure-secret-change-me"
_ALGO = "HS256"
_TTL = 7 * 24 * 3600  # 7 days


# ----- local mirror (offline fallback): {username: password_hash} -----


def _load_local() -> dict[str, str]:
    if USERS_FILE.exists():
        try:
            d = json.loads(USERS_FILE.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                # Support the old single-account format {username, password_hash}.
                if "username" in d and "password_hash" in d:
                    return {str(d["username"]): str(d["password_hash"])}
                return {k: v for k, v in d.items() if isinstance(v, str)}
        except Exception:
            pass
    return {}


def _save_local(users: dict[str, str]) -> None:
    try:
        USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")
    except Exception:
        pass


def _get_hash(username: str) -> str | None:
    """Password hash for a username — Supabase first, local mirror as fallback."""
    remote = db.get_user(username)
    if remote:
        users = _load_local()
        users[username] = remote["password_hash"]
        _save_local(users)
        return remote["password_hash"]
    return _load_local().get(username)


# ----- public API -----


def has_account() -> bool:
    """Whether any account exists (drives the default mode on the client)."""
    if db.first_user():
        return True
    return bool(_load_local())


def register(username: str, password: str) -> str:
    """Create a new account. Returns a session token."""
    username = (username or "").strip()
    if not username or not password:
        raise ValueError("Username and password are required")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    if _get_hash(username):
        raise ValueError("Username already taken")
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    db.insert_user(username, pw_hash)  # best-effort to Supabase
    users = _load_local()
    users[username] = pw_hash
    _save_local(users)
    return _make_token(username)


def login(username: str, password: str) -> str:
    """Verify credentials. Returns a session token or raises ValueError."""
    username = (username or "").strip()
    pw_hash = _get_hash(username)
    if not pw_hash or not bcrypt.checkpw((password or "").encode(), pw_hash.encode()):
        raise ValueError("Invalid credentials")
    return _make_token(username)


def _make_token(username: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": username, "iat": now, "exp": now + _TTL}, _SECRET, algorithm=_ALGO
    )


def verify_token(token: str) -> str | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGO])
        return payload.get("sub")
    except Exception:
        return None


# ----- FastAPI dependency -----


def require_auth(authorization: str = Header(default="")) -> str:
    """Reject requests without a valid Bearer token."""
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="unauthorized")
    return user
