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
  streaming: boolean;
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

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  // Set while the assistant message is still streaming in.
  streaming?: boolean;
  timestamp: number;
}

// Agent lifecycle status shown in the chat header.
export type AgentStatus = "idle" | "thinking" | "streaming" | "error";
