"""Login gate: a single admin account (username + bcrypt password) with JWT sessions.

The account is created on first connection (register), then it's login-only. It's stored
in Supabase (``app_users``) with a local JSON mirror, so login keeps working if Supabase
is paused. Passwords are bcrypt-hashed; tokens are JWTs signed with ``AUTH_SECRET``.
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


# ----- local mirror (offline fallback) -----


def _load_local() -> dict | None:
    if USERS_FILE.exists():
        try:
            d = json.loads(USERS_FILE.read_text(encoding="utf-8"))
            if d.get("username") and d.get("password_hash"):
                return d
        except Exception:
            pass
    return None


def _save_local(account: dict) -> None:
    try:
        USERS_FILE.write_text(json.dumps(account, indent=2), encoding="utf-8")
    except Exception:
        pass


def _account() -> dict | None:
    """The single admin account — Supabase first, local mirror as fallback."""
    remote = db.first_user()
    if remote:
        acc = {"username": remote["username"], "password_hash": remote["password_hash"]}
        _save_local(acc)
        return acc
    return _load_local()


# ----- public API -----


def has_account() -> bool:
    return _account() is not None


def register(username: str, password: str) -> str:
    """Create the single account (first connection). Returns a session token."""
    if has_account():
        raise ValueError("An account already exists")
    username = (username or "").strip()
    if not username or not password:
        raise ValueError("Username and password are required")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    db.insert_user(username, pw_hash)  # best-effort to Supabase
    _save_local({"username": username, "password_hash": pw_hash})
    return _make_token(username)


def login(username: str, password: str) -> str:
    """Verify credentials. Returns a session token or raises ValueError."""
    acc = _account()
    username = (username or "").strip()
    if not acc or acc["username"] != username:
        raise ValueError("Invalid credentials")
    if not bcrypt.checkpw((password or "").encode(), acc["password_hash"].encode()):
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
