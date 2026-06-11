"use client";

import { Check, KeyRound, Loader2, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MCPPanel } from "@/components/MCPPanel";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpandableTextarea } from "@/components/ExpandableTextarea";
import { useSettings } from "@/hooks/useSettings";

export function SettingsDialog() {
  const { settings, saveApiKey, clearApiKey, savePrompt, removePrompt } = useSettings();
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [promptName, setPromptName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  // Name of the prompt being edited (null = creating a new one).
  const [editingName, setEditingName] = useState<string | null>(null);

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
        <Button variant="ghost" size="icon" className="size-8" aria-label="Settings" title="Settings">
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            OpenRouter API key, reusable prompts, and MCP tool servers.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: this is a grid child of DialogContent; without it a long, non-wrapping
            prompt line forces the dialog wider than its max-width. */}
        <Tabs defaultValue="api-key" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="api-key" className="flex-1">
              API Key
            </TabsTrigger>
            <TabsTrigger value="prompts" className="flex-1">
              Custom Prompts
            </TabsTrigger>
            <TabsTrigger value="mcp" className="flex-1">
              MCP
            </TabsTrigger>
          </TabsList>

          {/* ---- API key ---- */}
          <TabsContent
            value="api-key"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto pt-2"
          >
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
              <Button variant="outline" onClick={onClearKey} disabled={!settings.has_api_key}>
                Clear
              </Button>
            </div>
          </TabsContent>

          {/* ---- Custom prompts ---- */}
          <TabsContent
            value="prompts"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto pt-2"
          >
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
                      <p className="text-muted-foreground truncate text-xs">{p.content}</p>
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
          </TabsContent>

          {/* ---- MCP servers ---- */}
          <TabsContent value="mcp" className="min-h-0 flex-1 overflow-y-auto pt-1">
            <MCPPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
