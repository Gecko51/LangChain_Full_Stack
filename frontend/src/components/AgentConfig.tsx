"use client";

import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react";

import { KnowledgePanel } from "@/components/KnowledgePanel";
import { MemoriesPanel } from "@/components/MemoriesPanel";
import { ModelSelector } from "@/components/ModelSelector";
import { ToolsPanel } from "@/components/ToolsPanel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SystemPromptField } from "@/components/SystemPromptField";
import { useAgentConfig } from "@/hooks/useAgentConfig";
import { useChatArchives } from "@/hooks/useChatArchives";
import type { OutputParser } from "@/types/agent";

const DEFAULT_SYSTEM_PROMPT =
  "You are an expert AI assistant. Answer clearly, concisely, and in a structured way.";

const PARSERS: { value: OutputParser; label: string }[] = [
  { value: "str", label: "String" },
  { value: "json", label: "JSON" },
];

export function AgentConfig() {
  const { config, setConfig, save, saving, dirty, error } = useAgentConfig();
  const { archives, requestRestore, removeArchive } = useChatArchives();

  const toggleTool = (name: string, on: boolean) => {
    const set = new Set(config.tools_enabled);
    if (on) set.add(name);
    else set.delete(name);
    setConfig({ tools_enabled: [...set] });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Settings: API key, custom prompts, MCP (soon) */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Configuration
        </span>
        <SettingsDialog />
      </div>
      <Accordion
        type="multiple"
        defaultValue={["llm", "prompt"]}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      >
        {/* ---- LLM settings ---- */}
        <AccordionItem value="llm">
          <AccordionTrigger>LLM Settings</AccordionTrigger>
          <AccordionContent className="space-y-4">
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
          </AccordionContent>
        </AccordionItem>

        {/* ---- System prompt ---- */}
        <AccordionItem value="prompt">
          <AccordionTrigger>System Prompt</AccordionTrigger>
          <AccordionContent className="space-y-2">
            <SystemPromptField
              value={config.system_prompt}
              onChange={(v) => setConfig({ system_prompt: v })}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig({ system_prompt: DEFAULT_SYSTEM_PROMPT })}
            >
              <RotateCcw className="size-3" />
              Reset to default
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* ---- Output parser ---- */}
        <AccordionItem value="parser">
          <AccordionTrigger>Output Parser</AccordionTrigger>
          <AccordionContent>
            <div className="flex gap-2">
              {PARSERS.map((p) => (
                <Button
                  key={p.value}
                  variant={config.output_parser === p.value ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfig({ output_parser: p.value })}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 opacity-50"
                disabled
                title="Coming in Phase 2"
              >
                Pydantic
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ---- Memory ---- */}
        <AccordionItem value="memory">
          <AccordionTrigger>Memory</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Enable memory</Label>
              <Switch
                checked={config.memory_enabled}
                onCheckedChange={(v) => setConfig({ memory_enabled: v })}
              />
            </div>
            {config.memory_enabled ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Window (messages)</Label>
                  <span className="text-muted-foreground font-mono text-xs">
                    {config.memory_window}
                  </span>
                </div>
                <Slider
                  value={[config.memory_window]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={(v) => setConfig({ memory_window: v[0] })}
                />
              </div>
            ) : null}

            {/* ---- Saved conversations (archives) — capped to the window ---- */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label>Saved conversations</Label>
                <span className="text-muted-foreground font-mono text-xs">
                  {archives.length} / {config.memory_window}
                </span>
              </div>
              {archives.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  None yet — “New chat” archives the current conversation.
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {archives.map((a) => (
                    <div
                      key={a.id}
                      className="hover:border-primary/50 flex items-center gap-1 rounded-md border px-2 py-1.5 transition-colors"
                    >
                      <button
                        onClick={() => requestRestore(a.id)}
                        title="Restore this conversation"
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-xs">{a.title}</p>
                        <p className="text-muted-foreground text-[10px]">
                          {new Date(a.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => removeArchive(a.id)}
                        aria-label={`Delete ${a.title}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ---- Long-term memory (durable facts recalled across every chat) ---- */}
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <Label>Long-term memory</Label>
                <p className="text-muted-foreground text-[11px]">
                  Remember facts across every chat
                </p>
              </div>
              <Switch
                checked={config.longterm_memory}
                onCheckedChange={(v) => setConfig({ longterm_memory: v })}
              />
            </div>
            {config.longterm_memory ? <MemoriesPanel /> : null}
          </AccordionContent>
        </AccordionItem>

        {/* ---- Knowledge (RAG over the user's uploaded documents) ---- */}
        <AccordionItem value="knowledge">
          <AccordionTrigger>Knowledge</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Knowledge base (RAG)</Label>
                <p className="text-muted-foreground text-[11px]">
                  Let the agent search your documents
                </p>
              </div>
              <Switch
                checked={config.rag_enabled}
                onCheckedChange={(v) => setConfig({ rag_enabled: v })}
              />
            </div>
            {config.rag_enabled ? <KnowledgePanel /> : null}
          </AccordionContent>
        </AccordionItem>

        {/* ---- Tools ---- */}
        <AccordionItem value="tools">
          <AccordionTrigger>Tools</AccordionTrigger>
          <AccordionContent>
            <ToolsPanel enabled={config.tools_enabled} onToggle={toggleTool} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* ---- Save bar ---- */}
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
