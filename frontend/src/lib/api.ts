// Typed fetch helpers for the backend HTTP API.
import type {
  AgentConfig,
  AppSettings,
  ChatArchive,
  Connector,
  CustomPrompt,
  MCPServer,
  McpServerStatus,
  Memory,
  ModelInfo,
  RagDocument,
  ScheduledTask,
  SessionSummary,
  ToolCall,
  ToolInfo,
} from "@/types/agent";

// One message of a persisted session, as returned by GET /sessions/{id}.
export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls: ToolCall[];
}

type ArchiveMessage = { role: string; content: string };

// Public backend URL (set at build/deploy time). Defaults to local dev.
// Override at build time with NEXT_PUBLIC_BACKEND_URL. The fallback is the deployed
// Render backend (used by the Vercel production build); local dev points it at
// http://localhost:8000 via frontend/.env.local.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://agent-playground-api.onrender.com";

const JSON_CT = { "Content-Type": "application/json" };

// Liveness probe (public, no auth). Used by the warmup splash to detect a cold
// (sleeping) Render backend and dismiss the splash as soon as it answers.
export async function checkHealth(timeoutMs = 10000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ----- Auth token (set by the AuthProvider; sent on every protected request) -----

let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

export function getAuthHeaders(): Record<string, string> {
  return _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
}

// The AuthProvider registers a logout handler here. Any authenticated call that comes
// back 401 (expired or invalid token) fires it so the app returns to the login screen
// instead of leaving the user stuck in a broken app with every request failing.
let _onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: (() => void) | null): void {
  _onUnauthorized = cb;
}

// All authenticated backend calls go through this: it injects the auth header and, on
// a 401, fires the logout handler before the caller sees the failure. Returns the raw
// Response (so streaming callers like useAgentStream can read .body).
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...((init.headers as Record<string, string>) ?? {}) },
  });
  if (res.status === 401) _onUnauthorized?.();
  return res;
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
  const res = await apiFetch("/config");
  if (!res.ok) throw new Error(`GET /config failed: ${res.status}`);
  return res.json();
}

export async function saveConfig(config: AgentConfig): Promise<AgentConfig> {
  const res = await apiFetch("/config", {
    method: "POST",
    headers: JSON_CT,
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`POST /config failed: ${res.status}`);
  return res.json();
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await apiFetch("/models");
  if (!res.ok) throw new Error(`GET /models failed: ${res.status}`);
  return res.json();
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const res = await apiFetch("/tools");
  if (!res.ok) throw new Error(`GET /tools failed: ${res.status}`);
  return res.json();
}

export async function clearSession(sessionId: string): Promise<void> {
  await apiFetch(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

// The user's conversations (for the sidebar), most recent first.
export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await apiFetch("/sessions");
  if (!res.ok) throw new Error(`GET /sessions failed: ${res.status}`);
  return (await res.json()).sessions as SessionSummary[];
}

// The session's messages (with tool calls) — used to re-hydrate the chat on reload.
export async function fetchSession(sessionId: string): Promise<SessionMessage[]> {
  const res = await apiFetch(`/sessions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`GET /sessions failed: ${res.status}`);
  return (await res.json()).messages as SessionMessage[];
}

// OpenRouter cost (USD) of a generation — fetched lazily when the user opens the
// metrics panel (the cost record appears a few seconds after the request).
export async function fetchGenerationCost(
  generationId: string,
): Promise<number | null> {
  const res = await apiFetch(`/chat/cost/${encodeURIComponent(generationId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return (data.cost ?? null) as number | null;
}

// ----- Chat archives (saved past conversations) -----

export async function fetchArchives(): Promise<ChatArchive[]> {
  const res = await apiFetch("/archives");
  if (!res.ok) throw new Error(`GET /archives failed: ${res.status}`);
  return (await res.json()).archives as ChatArchive[];
}

export async function createArchive(
  messages: ArchiveMessage[],
): Promise<ChatArchive[]> {
  const res = await apiFetch("/archives", {
    method: "POST",
    headers: JSON_CT,
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`POST /archives failed: ${res.status}`);
  return (await res.json()).archives as ChatArchive[];
}

export async function restoreArchive(id: string): Promise<ArchiveMessage[]> {
  const res = await apiFetch(`/archives/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`restore /archives failed: ${res.status}`);
  return (await res.json()).messages as ArchiveMessage[];
}

export async function deleteArchive(id: string): Promise<ChatArchive[]> {
  const res = await apiFetch(`/archives/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /archives failed: ${res.status}`);
  return (await res.json()).archives as ChatArchive[];
}

// ----- Settings -----

export async function fetchSettings(): Promise<AppSettings> {
  const res = await apiFetch("/settings");
  if (!res.ok) throw new Error(`GET /settings failed: ${res.status}`);
  return res.json();
}

export async function setApiKey(api_key: string): Promise<AppSettings> {
  const res = await apiFetch("/settings/api-key", {
    method: "PUT",
    headers: JSON_CT,
    body: JSON.stringify({ api_key }),
  });
  if (!res.ok) throw new Error(`PUT /settings/api-key failed: ${res.status}`);
  return res.json();
}

export async function clearApiKey(): Promise<AppSettings> {
  const res = await apiFetch("/settings/api-key", { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /settings/api-key failed: ${res.status}`);
  return res.json();
}

export async function addPrompt(prompt: CustomPrompt): Promise<AppSettings> {
  const res = await apiFetch("/prompts", {
    method: "POST",
    headers: JSON_CT,
    body: JSON.stringify(prompt),
  });
  if (!res.ok) throw new Error(`POST /prompts failed: ${res.status}`);
  return res.json();
}

export async function deletePrompt(name: string): Promise<AppSettings> {
  const res = await apiFetch(`/prompts/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /prompts failed: ${res.status}`);
  return res.json();
}

// ----- MCP servers -----

export async function addMcpServer(server: MCPServer): Promise<AppSettings> {
  const res = await apiFetch("/mcp/servers", {
    method: "POST",
    headers: JSON_CT,
    body: JSON.stringify(server),
  });
  if (!res.ok) throw new Error(`POST /mcp/servers failed: ${res.status}`);
  return res.json();
}

export async function deleteMcpServer(name: string): Promise<AppSettings> {
  const res = await apiFetch(`/mcp/servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /mcp/servers failed: ${res.status}`);
  return res.json();
}

export async function toggleMcpServer(name: string): Promise<AppSettings> {
  const res = await apiFetch(`/mcp/servers/${encodeURIComponent(name)}/toggle`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`POST /mcp/servers/toggle failed: ${res.status}`);
  return res.json();
}

export async function setMcpAllowedTools(
  name: string,
  allowed: string[] | null,
): Promise<AppSettings> {
  const res = await apiFetch(`/mcp/servers/${encodeURIComponent(name)}/tools`, {
    method: "PUT",
    headers: JSON_CT,
    body: JSON.stringify({ allowed_tools: allowed }),
  });
  if (!res.ok) throw new Error(`PUT /mcp/servers/tools failed: ${res.status}`);
  return res.json();
}

export async function fetchMcpTools(): Promise<McpServerStatus[]> {
  const res = await apiFetch("/mcp/tools");
  if (!res.ok) throw new Error(`GET /mcp/tools failed: ${res.status}`);
  return res.json();
}

export async function fetchConnectors(): Promise<Connector[]> {
  const res = await apiFetch("/connectors");
  if (!res.ok) throw new Error(`GET /connectors failed: ${res.status}`);
  return res.json();
}

// ----- Long-term memory -----

export async function fetchMemories(): Promise<Memory[]> {
  const res = await apiFetch("/memories");
  if (!res.ok) throw new Error(`GET /memories failed: ${res.status}`);
  return (await res.json()).memories as Memory[];
}

export async function addMemory(content: string): Promise<Memory[]> {
  const res = await apiFetch("/memories", {
    method: "POST",
    headers: JSON_CT,
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`POST /memories failed: ${res.status}`);
  return (await res.json()).memories as Memory[];
}

export async function deleteMemory(id: string): Promise<Memory[]> {
  const res = await apiFetch(`/memories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /memories failed: ${res.status}`);
  return (await res.json()).memories as Memory[];
}

export async function clearMemories(): Promise<Memory[]> {
  const res = await apiFetch("/memories", { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /memories failed: ${res.status}`);
  return (await res.json()).memories as Memory[];
}

// ----- RAG knowledge base -----

export async function fetchRagDocuments(): Promise<RagDocument[]> {
  const res = await apiFetch("/rag/documents");
  if (!res.ok) throw new Error(`GET /rag/documents failed: ${res.status}`);
  return (await res.json()).documents as RagDocument[];
}

export async function addRagDocument(
  title: string,
  content: string,
): Promise<RagDocument[]> {
  const res = await apiFetch("/rag/documents", {
    method: "POST",
    headers: JSON_CT,
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) throw new Error(await detail(res));
  return (await res.json()).documents as RagDocument[];
}

export async function deleteRagDocument(title: string): Promise<RagDocument[]> {
  // Title goes in a query param (not the path) so slashes/special chars survive routing.
  const res = await apiFetch(`/rag/documents?title=${encodeURIComponent(title)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /rag/documents failed: ${res.status}`);
  return (await res.json()).documents as RagDocument[];
}

// ----- Scheduled tasks -----

export async function fetchSchedules(): Promise<ScheduledTask[]> {
  const res = await apiFetch("/scheduled");
  if (!res.ok) throw new Error(`GET /scheduled failed: ${res.status}`);
  return (await res.json()).tasks as ScheduledTask[];
}

export async function createSchedule(body: {
  name: string;
  prompt: string;
  cron: string;
  enabled?: boolean;
}): Promise<ScheduledTask[]> {
  const res = await apiFetch("/scheduled", {
    method: "POST",
    headers: JSON_CT,
    body: JSON.stringify({ enabled: true, ...body }),
  });
  if (!res.ok) throw new Error(await detail(res));
  return (await res.json()).tasks as ScheduledTask[];
}

export async function toggleSchedule(id: number): Promise<ScheduledTask[]> {
  const res = await apiFetch(`/scheduled/${id}/toggle`, { method: "POST" });
  if (!res.ok) throw new Error(`POST /scheduled/toggle failed: ${res.status}`);
  return (await res.json()).tasks as ScheduledTask[];
}

export async function deleteSchedule(id: number): Promise<ScheduledTask[]> {
  const res = await apiFetch(`/scheduled/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /scheduled failed: ${res.status}`);
  return (await res.json()).tasks as ScheduledTask[];
}

// ----- Auth (public — no token yet) -----

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
    headers: JSON_CT,
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
    headers: JSON_CT,
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await detail(res));
  return res.json();
}
