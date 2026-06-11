"use client";

import { Loader2, Save } from "lucide-react";

import { ModelSelector } from "@/components/ModelSelector";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useAgentConfig } from "@/hooks/useAgentConfig";

// The left panel is the LLM quick-tune (model / temperature / max tokens). Everything
// else — system prompt, tools, memory, knowledge, schedules, API key, prompts, MCP —
// lives in the Settings dialog (the gear), which edits the same shared config.
export function AgentConfig() {
  const { config, setConfig, save, saving, dirty, error } = useAgentConfig();

  return (
    <div className="flex h-full flex-col">
      {/* Header: panel label + the full Settings dialog (gear) */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Configuration
        </span>
        <SettingsDialog />
      </div>

      {/* LLM quick-tune */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <div className="space-y-2">
          <Label>Model</Label>
          <ModelSelector
            value={config.model}
            onChange={(v) => setConfig({ model: v })}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Temperature</Label>
            <span className="text-muted-foreground font-mono text-xs">
              {config.temperature.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[config.temperature]}
            min={0}
            max={2}
            step={0.1}
            onValueChange={(v) => setConfig({ temperature: v[0] })}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Max tokens</Label>
            <span className="text-muted-foreground font-mono text-xs">
              {config.max_tokens}
            </span>
          </div>
          <Slider
            value={[config.max_tokens]}
            min={256}
            max={8192}
            step={256}
            onValueChange={(v) => setConfig({ max_tokens: v[0] })}
          />
        </div>
        <p className="text-muted-foreground border-t pt-3 text-[11px]">
          System prompt, tools, memory, knowledge & schedules live in{" "}
          <span className="text-foreground font-medium">Settings</span> (the gear above).
        </p>
      </div>

      {/* Save bar (applies the agent config — edited here or in the Settings dialog) */}
      <div className="shrink-0 border-t p-3">
        {error ? <p className="text-destructive mb-2 text-xs">{error}</p> : null}
        <Button className="w-full" onClick={save} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {dirty ? "Save & Apply" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
