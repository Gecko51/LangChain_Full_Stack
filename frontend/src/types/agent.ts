// Shared types mirroring the backend API (backend/config.py, schemas.py, agent.py).

export type OutputParser = "str" | "json";

export interface AgentConfig {
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  output_parser: OutputParser;
  tools_enabled: string[];
  memory_enabled: boolean;
  memory_window: number;
  longterm_memory: boolean; // durable cross-session facts + the `remember` tool
  rag_enabled: boolean; // search_knowledge_base over uploaded documents
  streaming: boolean;
}

// A document in the RAG knowledge base, grouped by title with its chunk count.
export interface RagDocument {
  title: string;
  chunks: number;
}

// A long-term memory: a durable fact the agent recalls across sessions.
export interface Memory {
  id: string;
  content: string;
  created_at: string;
}

// A conversation in the sidebar (one chat_sessions row).
export interface SessionSummary {
  session_id: string;
  title: string | null;
  updated_at: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  enabled: boolean;
}

export interface ModelInfo {
  value: string; // OpenRouter id, e.g. "anthropic/claude-sonnet-4-5"
  label: string;
  provider: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: unknown;
  output?: string;
}

export type ChatRole = "user" | "assistant";

// OpenRouter usage metrics for an assistant message.
export interface MessageUsage {
  prompt_tokens?: number | null; // tokens sent to the model
  completion_tokens?: number | null; // tokens generated
  total_tokens?: number | null;
  reasoning_tokens?: number | null; // when the model exposes reasoning
  generation_id?: string | null; // OpenRouter generation id (for the cost lookup)
  cost?: number | null; // USD — fetched lazily; undefined = not fetched yet
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  usage?: MessageUsage;
  // Set while the assistant message is still streaming in.
  streaming?: boolean;
  timestamp: number;
}

// A saved past conversation (auto-named, capped to the memory window).
export interface ChatArchive {
  id: string;
  title: string;
  created_at: string;
}

// Agent lifecycle status shown in the chat header.
export type AgentStatus = "idle" | "thinking" | "streaming" | "error";

// ----- Settings (API key + custom prompts) -----

export interface CustomPrompt {
  name: string; // invoked from the chat with /<name>
  content: string;
}

export type McpTransport = "stdio" | "sse" | "http";

export interface MCPServer {
  name: string;
  transport: McpTransport;
  command?: string | null; // stdio
  args?: string[]; // stdio
  url?: string | null; // sse / http
  enabled: boolean;
  // Credentials — write-only. We SEND env/headers (real values) when adding a server;
  // the server never returns the values, only the key names (env_keys/header_keys).
  env?: Record<string, string>; // stdio: env vars (e.g. NOTION_TOKEN)
  headers?: Record<string, string>; // sse/http: request headers (e.g. Authorization)
  env_keys?: string[]; // read-only: which env keys are set
  header_keys?: string[]; // read-only: which header keys are set
  allowed_tools?: string[] | null; // per-tool allowlist (namespaced); null = all
}

// ----- Connector catalog (one-click MCP setup) -----

export interface ConnectorInput {
  key: string;
  label: string;
  kind: "env" | "header" | "arg";
  secret?: boolean;
  default?: string;
  help_url?: string;
}

export interface Connector {
  id: string;
  label: string;
  category: string;
  description: string;
  transport: McpTransport;
  command?: string | null;
  base_args: string[];
  url?: string | null;
  inputs: ConnectorInput[];
  help_url: string;
}

// Discovery result from GET /mcp/tools (one entry per server).
export interface McpServerStatus {
  name: string;
  enabled: boolean;
  tools: string[];
  error: string | null;
}

export interface AppSettings {
  has_api_key: boolean;
  api_key_hint: string | null; // e.g. "…74a4" — never the full key
  api_key_source: "settings" | "env" | null;
  custom_prompts: CustomPrompt[];
  mcp_servers: MCPServer[];
}
