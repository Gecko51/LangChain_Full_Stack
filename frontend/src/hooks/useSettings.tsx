"use client";

// React context for app settings (API key status, custom prompts, MCP servers),
// shared by the SettingsDialog (mutations) and the ChatInterface (slash menu).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  addMcpServer as apiAddMcpServer,
  addPrompt as apiAddPrompt,
  clearApiKey as apiClearApiKey,
  deleteMcpServer as apiDeleteMcpServer,
  deletePrompt as apiDeletePrompt,
  fetchSettings as apiFetchSettings,
  setApiKey as apiSetApiKey,
  toggleMcpServer as apiToggleMcpServer,
} from "@/lib/api";
import type { AppSettings, CustomPrompt, MCPServer } from "@/types/agent";

const EMPTY: AppSettings = {
  has_api_key: false,
  api_key_hint: null,
  api_key_source: null,
  custom_prompts: [],
  mcp_servers: [],
};

interface SettingsContextValue {
  settings: AppSettings;
  refresh: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  savePrompt: (prompt: CustomPrompt) => Promise<void>;
  removePrompt: (name: string) => Promise<void>;
  addMcpServer: (server: MCPServer) => Promise<void>;
  removeMcpServer: (name: string) => Promise<void>;
  toggleMcpServer: (name: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      setSettings(await apiFetchSettings());
    } catch {
      // keep current settings on failure
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveApiKey = useCallback(async (key: string) => {
    setSettings(await apiSetApiKey(key));
  }, []);
  const clearApiKey = useCallback(async () => {
    setSettings(await apiClearApiKey());
  }, []);
  const savePrompt = useCallback(async (prompt: CustomPrompt) => {
    setSettings(await apiAddPrompt(prompt));
  }, []);
  const removePrompt = useCallback(async (name: string) => {
    setSettings(await apiDeletePrompt(name));
  }, []);
  const addMcpServer = useCallback(async (server: MCPServer) => {
    setSettings(await apiAddMcpServer(server));
  }, []);
  const removeMcpServer = useCallback(async (name: string) => {
    setSettings(await apiDeleteMcpServer(name));
  }, []);
  const toggleMcpServer = useCallback(async (name: string) => {
    setSettings(await apiToggleMcpServer(name));
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        refresh,
        saveApiKey,
        clearApiKey,
        savePrompt,
        removePrompt,
        addMcpServer,
        removeMcpServer,
        toggleMcpServer,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
