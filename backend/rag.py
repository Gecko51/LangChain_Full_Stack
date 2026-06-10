"""RAG: turn the user's documents into searchable knowledge.

Documents are chunked, embedded via OpenRouter's OpenAI-compatible ``/embeddings``
endpoint (using the user's existing key — no extra provider), and stored in Supabase
``rag_documents`` (pgvector). At query time we embed the question and fetch the top-k
nearest chunks. The agent reaches this via the ``search_knowledge_base`` tool.
"""
from __future__ import annotations

import httpx

import db

# OpenRouter embeddings (OpenAI-compatible). text-embedding-3-small = 1536 dims, cheap.
_EMBED_MODEL = "openai/text-embedding-3-small"
_EMBED_URL = "https://openrouter.ai/api/v1/embeddings"
_EMBED_DIMS = 1536

_CHUNK_SIZE = 1000  # characters per chunk
_CHUNK_OVERLAP = 150  # carry-over so facts on a boundary aren't split away
_MAX_CHARS = 100_000  # cap a single document (defense against huge pastes)
_EMBED_BATCH = 64  # inputs per embeddings request

# Per-user aggregate caps (the route enforces them before ingesting). These bound the
# embedding spend + pgvector growth a single account can cause — important because
# registration is open and keyless accounts embed on the server's shared key.
MAX_DOCS = 50  # documents per user
MAX_TOTAL_CHUNKS = 1000  # total chunks per user (~7 MB of vectors)


def _chunk(text: str) -> list[str]:
    """Split text into overlapping ~1000-char chunks."""
    text = (text or "").strip()
    if not text:
        return []
    chunks: list[str] = []
    step = _CHUNK_SIZE - _CHUNK_OVERLAP
    i = 0
    while i < len(text):
        chunks.append(text[i : i + _CHUNK_SIZE])
        i += step
    return chunks


def embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    """Embed a list of strings via OpenRouter, batched. Raises on HTTP error."""
    out: list[list[float]] = []
    for start in range(0, len(texts), _EMBED_BATCH):
        group = texts[start : start + _EMBED_BATCH]
        resp = httpx.post(
            _EMBED_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": _EMBED_MODEL, "input": group},
            timeout=60,
        )
        resp.raise_for_status()
        data = sorted(resp.json()["data"], key=lambda d: d.get("index", 0))
        out.extend(d["embedding"] for d in data)
    return out


def ingest(username: str, title: str, text: str, api_key: str) -> int:
    """Chunk + embed + store a document. Returns the number of chunks stored.

    Idempotent per (username, title): any existing version of the same title is removed
    first, so re-uploading REPLACES it instead of silently duplicating chunks. Raises if
    the chunks can't be persisted (so the caller doesn't report a false success).
    """
    chunks = _chunk(text[:_MAX_CHARS])
    if not chunks:
        return 0
    embeddings = embed_texts(chunks, api_key)
    rows = [
        {"username": username, "title": title, "content": c, "embedding": e}
        for c, e in zip(chunks, embeddings)
    ]
    db.delete_rag_source(username, title)  # replace, don't duplicate
    if not db.insert_rag_chunks(rows):
        raise RuntimeError("could not store document chunks (storage unavailable)")
    return len(rows)


def search(username: str, query: str, api_key: str, k: int = 5) -> list[dict]:
    """Embed the query and return the top-k matching chunks ({title, content, similarity})."""
    vecs = embed_texts([query], api_key)
    if not vecs:
        return []
    return db.match_rag(username, vecs[0], k)
