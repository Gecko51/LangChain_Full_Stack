# Backend image — FastAPI + LangChain agent
FROM python:3.11-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code.
COPY . .

EXPOSE 8000

# Default command (docker-compose overrides this with --reload for development).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
