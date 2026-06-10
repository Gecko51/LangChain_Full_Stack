"""Login gate with JWT sessions and multiple accounts.

Accounts (username + bcrypt password) are stored in Supabase (``app_users``) with a
local JSON mirror, so login keeps working if Supabase is paused. Anyone can create an
account (open registration); each account gets its own private, isolated namespace
(config, settings, sessions, archives keyed by username). Passwords are bcrypt-hashed;
tokens are JWTs signed with ``AUTH_SECRET`` (required — see ``_resolve_secret``).
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
_DEV_DEFAULT = "dev-insecure-secret-change-me"
_ALGO = "HS256"
_TTL = 7 * 24 * 3600  # 7 days


# Obvious placeholder/weak secrets we refuse even if explicitly set — these are the
# values people copy from examples (the .env.example used to ship "change-me").
_WEAK_SECRETS = {
    _DEV_DEFAULT,
    "change-me",
    "changeme",
    "secret",
    "password",
    "your-secret-here",
    "sk-or-...",
}


def _resolve_secret() -> str:
    """The HS256 signing secret. Fail closed: refuse to run with a guessable secret.

    A missing, default, weak (a known placeholder) or too-short ``AUTH_SECRET`` means
    tokens could be forged for any username. We raise at import time so a misconfigured
    deploy crashes loudly instead of running wide open. ``ALLOW_INSECURE_AUTH=1`` is an
    explicit escape hatch for local dev/tests (render.yaml injects a generated, strong
    AUTH_SECRET in production, so prod is unaffected).
    """
    secret = (os.environ.get("AUTH_SECRET") or "").strip()
    strong = len(secret) >= 16 and secret.lower() not in _WEAK_SECRETS
    if strong:
        return secret
    if os.environ.get("ALLOW_INSECURE_AUTH"):
        return secret or _DEV_DEFAULT
    raise RuntimeError(
        "AUTH_SECRET is unset or too weak (need a random value of at least 16 chars; "
        "placeholders like 'change-me' are rejected). Generate one with:\n"
        '  python -c "import secrets; print(secrets.token_urlsafe(48))"\n'
        "or set ALLOW_INSECURE_AUTH=1 for local development only."
    )


_SECRET = _resolve_secret()


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
