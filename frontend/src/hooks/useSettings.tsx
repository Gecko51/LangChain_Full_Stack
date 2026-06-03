"use client";

// React context for app settings (API key status + custom prompts), shared by the
// SettingsDialog (which mutates them) and the ChatInterface (slash-command menu).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  addPrompt as apiAddPrompt,
  clearApiKey as apiClearApiKey,
  deletePrompt as apiDeletePrompt,
  fetchSettings as apiFetchSettings,
  setApiKey as apiSetApiKey,
} from "@/lib/api";
import type { AppSettings, CustomPrompt } from "@/types/agent";

const EMPTY: AppSettings = {
  has_api_key: false,
  api_key_hint: null,
  api_key_source: null,
  custom_prompts: [],
};

interface SettingsContextValue {
  settings: AppSettings;
  refresh: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  savePrompt: (prompt: CustomPrompt) => Promise<void>;
  removePrompt: (name: string) => Promise<void>;
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

  return (
    <SettingsContext.Provider
      value={{ settings, refresh, saveApiKey, clearApiKey, savePrompt, removePrompt }}
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
