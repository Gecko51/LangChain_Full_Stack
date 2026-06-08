// Typed fetch helpers for the backend HTTP API.
import type {
  AgentConfig,
  AppSettings,
  ChatArchive,
  CustomPrompt,
  MCPServer,
  McpServerStatus,
  ModelInfo,
  ToolInfo,
} from "@/types/agent";

type ArchiveMessage = { role: string; content: string };

// Public backend URL (set at build/deploy time). Defaults to local dev.
// Override at build time with NEXT_PUBLIC_BACKEND_URL. The fallback is the deployed
// Render backend (used by the Vercel production build); local dev points it at
// http://localhost:8000 via frontend/.env.local.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://agent-playground-api.onrender.com";

// ----- Auth token (set by the AuthProvider; sent on every protected request) -----

let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

export function getAuthHeaders(): Record<string, string> {
  return _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...getAuthHeaders() };
}

async function detail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail || `${res.status}`;
  } catch {
    return `${res.status}`;
  }
}

// ----- Config -----

export async function fetchConfig(): Promise<AgentConfig> {
  const res = await fetch(`${BACKEND_URL}/config`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET /config failed: ${res.status}`);
  return res.json();
}

export async function saveConfig(config: AgentConfig): Promise<AgentConfig> {
  const res = await fetch(`${BACKEND_URL}/config`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`POST /config failed: ${res.status}`);
  return res.json();
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BACKEND_URL}/models`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET /models failed: ${res.status}`);
  return res.json();
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const res = await fetch(`${BACKEND_URL}/tools`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET /tools failed: ${res.status}`);
  return res.json();
}

export async function clearSession(sessionId: string): Promise<void> {
  await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

// OpenRouter cost (USD) of a generation — fetched lazily when the user opens the
// metrics panel (the cost record appears a few seconds after the request).
export async function fetchGenerationCost(
  generationId: string,
): Promise<number | null> {
  const res = await fetch(
    `${BACKEND_URL}/chat/cost/${encodeURIComponent(generationId)}`,
    { headers: getAuthHeaders() },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data.cost ?? null) as number | null;
}

// ----- Chat archives (saved past conversations) -----

export async function fetchArchives(): Promise<ChatArchive[]> {
  const res = await fetch(`${BACKEND_URL}/archives`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET /archives failed: ${res.status}`);
  return (await res.json()).archives as ChatArchive[];
}

export async function createArchive(
  messages: ArchiveMessage[],
): Promise<ChatArchive[]> {
  const res = await fetch(`${BACKEND_URL}/archives`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`POST /archives failed: ${res.status}`);
  return (await res.json()).archives as ChatArchive[];
}

export async function restoreArchive(id: string): Promise<ArchiveMessage[]> {
  const res = await fetch(`${BACKEND_URL}/archives/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`restore /archives failed: ${res.status}`);
  return (await res.json()).messages as ArchiveMessage[];
}

export async function deleteArchive(id: string): Promise<ChatArchive[]> {
  const res = await fetch(`${BACKEND_URL}/archives/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE /archives failed: ${res.status}`);
  return (await res.json()).archives as ChatArchive[];
}

// ----- Settings -----

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/settings`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET /settings failed: ${res.status}`);
  return res.json();
}

export async function setApiKey(api_key: string): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/settings/api-key`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ api_key }),
  });
  if (!res.ok) throw new Error(`PUT /settings/api-key failed: ${res.status}`);
  return res.json();
}

export async function clearApiKey(): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/settings/api-key`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE /settings/api-key failed: ${res.status}`);
  return res.json();
}

export async function addPrompt(prompt: CustomPrompt): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/prompts`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(prompt),
  });
  if (!res.ok) throw new Error(`POST /prompts failed: ${res.status}`);
  return res.json();
}

export async function deletePrompt(name: string): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/prompts/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE /prompts failed: ${res.status}`);
  return res.json();
}

// ----- MCP servers -----

export async function addMcpServer(server: MCPServer): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/mcp/servers`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(server),
  });
  if (!res.ok) throw new Error(`POST /mcp/servers failed: ${res.status}`);
  return res.json();
}

export async function deleteMcpServer(name: string): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/mcp/servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE /mcp/servers failed: ${res.status}`);
  return res.json();
}

export async function toggleMcpServer(name: string): Promise<AppSettings> {
  const res = await fetch(
    `${BACKEND_URL}/mcp/servers/${encodeURIComponent(name)}/toggle`,
    { method: "POST", headers: getAuthHeaders() },
  );
  if (!res.ok) throw new Error(`POST /mcp/servers/toggle failed: ${res.status}`);
  return res.json();
}

export async function fetchMcpTools(): Promise<McpServerStatus[]> {
  const res = await fetch(`${BACKEND_URL}/mcp/tools`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET /mcp/tools failed: ${res.status}`);
  return res.json();
}

// ----- Auth -----

export async function fetchAuthStatus(): Promise<{ registered: boolean }> {
  const res = await fetch(`${BACKEND_URL}/auth/status`);
  if (!res.ok) throw new Error(`GET /auth/status failed: ${res.status}`);
  return res.json();
}

export async function register(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const res = await fetch(`${BACKEND_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await detail(res));
  return res.json();
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await detail(res));
  return res.json();
}
