# Backend image: FastAPI + LangChain, with Node.js so MCP (npx) servers work.
# Build context = ./backend (see render.yaml / DEPLOY.md).
FROM python:3.13-slim

# System deps + Node.js 20 (needed by npx-based MCP servers).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code (local .json data + venv are excluded via .dockerignore).
COPY . ./

# Render injects $PORT; default to 8000 for local runs.
ENV PORT=8000
EXPOSE 8000

# Bind to 0.0.0.0 so the platform can reach it.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
