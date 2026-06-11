"use client";

import {
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { KnowledgePanel } from "@/components/KnowledgePanel";
import { MCPPanel } from "@/components/MCPPanel";
import { MemoriesPanel } from "@/components/MemoriesPanel";
import { SchedulesPanel } from "@/components/SchedulesPanel";
import { SystemPromptField } from "@/components/SystemPromptField";
import { ToolsPanel } from "@/components/ToolsPanel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ExpandableTextarea } from "@/components/ExpandableTextarea";
import { useAgentConfig } from "@/hooks/useAgentConfig";
import { useSettings } from "@/hooks/useSettings";
import type { OutputParser } from "@/types/agent";

const DEFAULT_SYSTEM_PROMPT =
  "You are an expert AI assistant. Answer clearly, concisely, and in a structured way.";

const PARSERS: { value: OutputParser; label: string }[] = [
  { value: "str", label: "String" },
  { value: "json", label: "JSON" },
];

// A subtle uppercase divider that groups the accordion sections.
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground/70 mt-2 px-1 pt-1 pb-0.5 text-[10px] font-medium tracking-wider uppercase first:mt-0">
      {children}
    </p>
  );
}

export function SettingsDialog() {
  const { settings, saveApiKey, clearApiKey, savePrompt, removePrompt } = useSettings();
  const { config, setConfig, save, saving, dirty, error } = useAgentConfig();

  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [promptName, setPromptName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  // Name of the prompt being edited (null = creating a new one).
  const [editingName, setEditingName] = useState<string | null>(null);

  const toggleTool = (name: string, on: boolean) => {
    const set = new Set(config.tools_enabled);
    if (on) set.add(name);
    else set.delete(name);
    setConfig({ tools_enabled: [...set] });
  };

  const onSaveKey = async () => {
    if (!keyInput.trim()) return;
    setSavingKey(true);
    try {
      await saveApiKey(keyInput.trim());
      setKeyInput("");
      toast.success("API key saved");
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setSavingKey(false);
    }
  };

  const onClearKey = async () => {
    try {
      await clearApiKey();
      toast.success("API key cleared");
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  // Load a saved prompt into the form for editing.
  const startEdit = (p: { name: string; content: string }) => {
    setEditingName(p.name);
    setPromptName(p.name);
    setPromptContent(p.content);
  };

  const cancelEdit = () => {
    setEditingName(null);
    setPromptName("");
    setPromptContent("");
  };

  const onSavePrompt = async () => {
    // Normalise the name into a slash-friendly token (no leading slash, no spaces).
    const name = promptName.trim().replace(/^\/+/, "").replace(/\s+/g, "-");
    if (!name || !promptContent.trim()) return;
    setSavingPrompt(true);
    try {
      await savePrompt({ name, content: promptContent.trim() });
      // Editing + renamed → remove the old entry so it's a rename, not a copy.
      if (editingName && editingName !== name) {
        await removePrompt(editingName);
      }
      setPromptName("");
      setPromptContent("");
      setEditingName(null);
      toast.success(editingName ? `Updated /${name}` : `Saved /${name}`);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setSavingPrompt(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Settings"
          title="Settings"
        >
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Agent behaviour, capabilities, and connections.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: long, non-wrapping prompt lines mustn't force the dialog wider. */}
        <Accordion
          type="multiple"
          defaultValue={["prompt"]}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1"
        >
          {/* ============ Agent ============ */}
          <GroupLabel>Agent</GroupLabel>

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

          {/* ---- Tools ---- */}
          <AccordionItem value="tools">
            <AccordionTrigger>Tools</AccordionTrigger>
            <AccordionContent>
              <ToolsPanel enabled={config.tools_enabled} onToggle={toggleTool} />
            </AccordionContent>
          </AccordionItem>

          {/* ============ Capabilities ============ */}
          <GroupLabel>Capabilities</GroupLabel>

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

              {/* Long-term memory (durable facts recalled across every chat) */}
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

          {/* ---- Knowledge (RAG over uploaded documents) ---- */}
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

          {/* ---- Schedules (background agent runs) ---- */}
          <AccordionItem value="schedules">
            <AccordionTrigger>Schedules</AccordionTrigger>
            <AccordionContent>
              <SchedulesPanel />
            </AccordionContent>
          </AccordionItem>

          {/* ============ Connections ============ */}
          <GroupLabel>Connections</GroupLabel>

          {/* ---- API key ---- */}
          <AccordionItem value="api-key">
            <AccordionTrigger>API Key</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <KeyRound className="size-3.5 shrink-0" />
                {settings.has_api_key ? (
                  <span>
                    Key set <span className="font-mono">{settings.api_key_hint}</span>{" "}
                    (source: {settings.api_key_source})
                  </span>
                ) : (
                  <span>No key set</span>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key-input">OpenRouter API key</Label>
                <Input
                  id="api-key-input"
                  type="password"
                  placeholder="sk-or-..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-muted-foreground text-xs">
                  Stored on the server, never shown again. Overrides the .env key.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={onSaveKey} disabled={savingKey || !keyInput.trim()}>
                  {savingKey ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Save key
                </Button>
                <Button
                  variant="outline"
                  onClick={onClearKey}
                  disabled={!settings.has_api_key}
                >
                  Clear
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ---- Custom prompts ---- */}
          <AccordionItem value="prompts">
            <AccordionTrigger>Custom Prompts</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {settings.custom_prompts.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No custom prompts yet. Add one below, then type{" "}
                    <span className="font-mono">/name</span> in the chat.
                  </p>
                ) : (
                  settings.custom_prompts.map((p) => (
                    <div
                      key={p.name}
                      className={`flex items-center gap-2 rounded-md border p-2 ${
                        editingName === p.name ? "ring-primary ring-1" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-primary font-mono text-xs">/{p.name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {p.content}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => startEdit(p)}
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => removePrompt(p.name)}
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="prompt-name">
                  {editingName ? `Edit /${editingName}` : "New prompt"}
                </Label>
                <Input
                  id="prompt-name"
                  placeholder="name (e.g. summarize)"
                  value={promptName}
                  onChange={(e) => setPromptName(e.target.value)}
                  className="font-mono text-xs"
                />
                <ExpandableTextarea
                  title="Prompt content"
                  description="Write a longer prompt here. It runs when you type /name in the chat."
                  placeholder="Prompt content…"
                  value={promptContent}
                  onChange={setPromptContent}
                  rows={3}
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={onSavePrompt}
                    disabled={savingPrompt || !promptName.trim() || !promptContent.trim()}
                  >
                    {savingPrompt ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : editingName ? (
                      <Check className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {editingName ? "Save changes" : "Add prompt"}
                  </Button>
                  {editingName ? (
                    <Button variant="outline" onClick={cancelEdit} disabled={savingPrompt}>
                      <X className="size-4" />
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ---- MCP servers ---- */}
          <AccordionItem value="mcp">
            <AccordionTrigger>MCP servers</AccordionTrigger>
            <AccordionContent>
              <MCPPanel />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* ---- Save bar (applies the agent-config changes above) ---- */}
        <div className="shrink-0 border-t pt-3">
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
      </DialogContent>
    </Dialog>
  );
}
