"use client";

// React context holding the agent config in memory (synced to the backend).
// The config is NOT persisted in the browser — the backend is the source of truth.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { fetchConfig, saveConfig } from "@/lib/api";
import type { AgentConfig } from "@/types/agent";

// Used until the backend responds (mirrors backend DEFAULT_CONFIG).
const FALLBACK_CONFIG: AgentConfig = {
  system_prompt:
    "You are an expert AI assistant. Answer clearly, concisely, and in a structured way.",
  model: "anthropic/claude-sonnet-4-5",
  temperature: 0.7,
  max_tokens: 2048,
  output_parser: "str",
  tools_enabled: [],
  memory_enabled: true,
  memory_window: 10,
  streaming: true,
};

interface ConfigContextValue {
  config: AgentConfig;
  /** Patch the config locally (marks it dirty until saved). */
  setConfig: (patch: Partial<AgentConfig>) => void;
  /** Push the local config to the backend (POST /config). */
  save: () => Promise<void>;
  /** Reload the config from the backend (GET /config). */
  reload: () => Promise<void>;
  saving: boolean;
  dirty: boolean;
  error: string | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function AgentConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<AgentConfig>(FALLBACK_CONFIG);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setConfigState(await fetchConfig());
      setDirty(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Load the backend config on mount.
  useEffect(() => {
    reload();
  }, [reload]);

  const setConfig = useCallback((patch: Partial<AgentConfig>) => {
    setConfigState((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      setConfigState(await saveConfig(config));
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [config]);

  return (
    <ConfigContext.Provider
      value={{ config, setConfig, save, reload, saving, dirty, error }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useAgentConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useAgentConfig must be used within an AgentConfigProvider");
  }
  return ctx;
}
