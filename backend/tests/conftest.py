"""Shared pytest config.

Allow the insecure dev JWT secret in the test environment so importing auth.py
(transitively, via ``from main import app``) doesn't fail-closed. Production sets a
real ``AUTH_SECRET`` (render.yaml generates one); this only affects tests/local dev.
"""
import os

os.environ.setdefault("ALLOW_INSECURE_AUTH", "1")
