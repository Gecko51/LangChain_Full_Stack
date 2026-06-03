// Typed fetch helpers for the backend HTTP API.
import type { AgentConfig, ModelInfo, ToolInfo } from "@/types/agent";

// Public backend URL (set at build/deploy time). Defaults to local dev.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function fetchConfig(): Promise<AgentConfig> {
  const res = await fetch(`${BACKEND_URL}/config`);
  if (!res.ok) throw new Error(`GET /config failed: ${res.status}`);
  return res.json();
}

export async function saveConfig(config: AgentConfig): Promise<AgentConfig> {
  const res = await fetch(`${BACKEND_URL}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`POST /config failed: ${res.status}`);
  return res.json();
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BACKEND_URL}/models`);
  if (!res.ok) throw new Error(`GET /models failed: ${res.status}`);
  return res.json();
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const res = await fetch(`${BACKEND_URL}/tools`);
  if (!res.ok) throw new Error(`GET /tools failed: ${res.status}`);
  return res.json();
}

export async function clearSession(sessionId: string): Promise<void> {
  await fetch(`${BACKEND_URL}/sessions/${sessionId}`, { method: "DELETE" });
}
