// Typed fetch helpers for the backend HTTP API.
import type {
  AgentConfig,
  AppSettings,
  CustomPrompt,
  MCPServer,
  McpServerStatus,
  ModelInfo,
  ToolInfo,
} from "@/types/agent";

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

// ----- Settings: API key + custom prompts -----

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/settings`);
  if (!res.ok) throw new Error(`GET /settings failed: ${res.status}`);
  return res.json();
}

export async function setApiKey(api_key: string): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/settings/api-key`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key }),
  });
  if (!res.ok) throw new Error(`PUT /settings/api-key failed: ${res.status}`);
  return res.json();
}

export async function clearApiKey(): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/settings/api-key`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /settings/api-key failed: ${res.status}`);
  return res.json();
}

export async function addPrompt(prompt: CustomPrompt): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prompt),
  });
  if (!res.ok) throw new Error(`POST /prompts failed: ${res.status}`);
  return res.json();
}

export async function deletePrompt(name: string): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/prompts/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /prompts failed: ${res.status}`);
  return res.json();
}

// ----- MCP servers -----

export async function addMcpServer(server: MCPServer): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/mcp/servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(server),
  });
  if (!res.ok) throw new Error(`POST /mcp/servers failed: ${res.status}`);
  return res.json();
}

export async function deleteMcpServer(name: string): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/mcp/servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /mcp/servers failed: ${res.status}`);
  return res.json();
}

export async function toggleMcpServer(name: string): Promise<AppSettings> {
  const res = await fetch(
    `${BACKEND_URL}/mcp/servers/${encodeURIComponent(name)}/toggle`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`POST /mcp/servers/toggle failed: ${res.status}`);
  return res.json();
}

export async function fetchMcpTools(): Promise<McpServerStatus[]> {
  const res = await fetch(`${BACKEND_URL}/mcp/tools`);
  if (!res.ok) throw new Error(`GET /mcp/tools failed: ${res.status}`);
  return res.json();
}
