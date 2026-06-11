"use client";

// The left sidebar, Claude/ChatGPT-style: new chat, projects (folders with optional
// instructions), past conversations, plus the LLM quick-tune (model / temperature /
// max tokens) kept from the old config panel. Heavy settings live in the gear dialog.
import {
  FolderKanban,
  FolderPlus,
  Inbox,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ModelSelector } from "@/components/ModelSelector";
import { SettingsDialog } from "@/components/SettingsDialog";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useAgentConfig } from "@/hooks/useAgentConfig";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/agent";

// Project create/edit form state (null = dialog closed).
type ProjectDraft = { id?: number; name: string; instructions: string };

export function WorkspacePanel({ onNavigate }: { onNavigate?: () => void }) {
  const { config, setConfig, save, saving, dirty, error } = useAgentConfig();
  const {
    projects,
    sessions,
    activeSessionId,
    activeProjectId,
    selectProject,
    selectSession,
    newConversation,
    deleteSession,
    saveProject,
    removeProject,
  } = useWorkspace();

  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [savingProject, setSavingProject] = useState(false);

  // Conversations shown: all, or only the selected project's.
  const visibleSessions =
    activeProjectId === null
      ? sessions
      : sessions.filter((s) => s.project_id === activeProjectId);

  const openCreate = () => setDraft({ name: "", instructions: "" });
  const openEdit = (p: Project) =>
    setDraft({ id: p.id, name: p.name, instructions: p.instructions });

  const onSaveProject = async () => {
    if (!draft || !draft.name.trim()) return;
    setSavingProject(true);
    try {
      await saveProject(draft.name.trim(), draft.instructions, draft.id);
      toast.success(draft.id !== undefined ? "Project updated" : "Project created");
      setDraft(null);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setSavingProject(false);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex h-full flex-col">
      {/* ---- Header: panel label + the full Settings dialog (gear) ---- */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Workspace
        </span>
        <SettingsDialog />
      </div>

      {/* ---- New conversation ---- */}
      <div className="shrink-0 p-3 pb-2">
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            newConversation();
            onNavigate?.();
          }}
        >
          <MessageSquarePlus className="size-3.5" />
          New conversation
        </Button>
      </div>

      {/* ---- Projects + conversations (scrollable middle) ---- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {/* Projects */}
        <div className="mb-1 flex items-center justify-between pt-1">
          <p className="text-muted-foreground/70 text-[10px] font-medium tracking-wider uppercase">
            Projects
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={openCreate}
            aria-label="New project"
            title="New project"
          >
            <FolderPlus className="size-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          {/* All conversations (no project filter) */}
          <button
            type="button"
            onClick={() => selectProject(null)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
              activeProjectId === null ? "bg-primary/15" : "hover:bg-accent/50",
            )}
          >
            <Inbox className="text-muted-foreground size-3.5 shrink-0" />
            All conversations
          </button>
          {projects.map((p) => (
            <div
              key={p.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                activeProjectId === p.id ? "bg-primary/15" : "hover:bg-accent/50",
              )}
            >
              <button
                type="button"
                onClick={() => selectProject(p.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs"
                title={p.instructions || p.name}
              >
                <FolderKanban className="text-muted-foreground size-3.5 shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => openEdit(p)}
                aria-label={`Edit ${p.name}`}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() =>
                  removeProject(p.id).catch((e) =>
                    toast.error(`Failed: ${(e as Error).message}`),
                  )
                }
                aria-label={`Delete ${p.name}`}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>

        {/* Conversations (filtered by the selected project) */}
        <p className="text-muted-foreground/70 mt-3 mb-1 text-[10px] font-medium tracking-wider uppercase">
          Conversations
        </p>
        {visibleSessions.length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-xs">
            {activeProjectId === null
              ? "No conversations yet."
              : "No conversations in this project yet."}
          </p>
        ) : (
          <div className="space-y-0.5">
            {visibleSessions.map((s) => (
              <div
                key={s.session_id}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
                  s.session_id === activeSessionId
                    ? "bg-primary/15"
                    : "hover:bg-accent/50",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    selectSession(s.session_id);
                    onNavigate?.();
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs">{s.title || "New conversation"}</p>
                  <p className="text-muted-foreground text-[10px]">
                    {fmt(s.updated_at)}
                    {activeProjectId === null && s.project_id != null
                      ? ` · ${projects.find((p) => p.id === s.project_id)?.name ?? "project"}`
                      : ""}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() =>
                    deleteSession(s.session_id).catch((e) =>
                      toast.error(`Failed: ${(e as Error).message}`),
                    )
                  }
                  aria-label="Delete conversation"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- LLM quick-tune (kept from the old config panel) ---- */}
      <Accordion type="multiple" defaultValue={[]} className="shrink-0 border-t px-3">
        <AccordionItem value="model" className="border-b-0">
          <AccordionTrigger className="py-2.5 text-sm">
            <span>
              Model{" "}
              <span className="text-muted-foreground ml-1 font-mono text-[10px]">
                {config.model.split("/").pop()}
              </span>
            </span>
          </AccordionTrigger>
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
      </Accordion>

      {/* ---- Save bar (applies the agent config — here or in the Settings dialog) ---- */}
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

      {/* ---- Project create/edit dialog ---- */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft?.id !== undefined ? "Edit project" : "New project"}
            </DialogTitle>
            <DialogDescription>
              A project groups conversations. Its instructions are added to the system
              prompt of every chat inside it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={draft?.name ?? ""}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                }
                placeholder="e.g. LinkedIn content"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="project-instructions">Instructions (optional)</Label>
              <Textarea
                id="project-instructions"
                value={draft?.instructions ?? ""}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, instructions: e.target.value } : d))
                }
                placeholder="e.g. Write in French, casual tone, posts under 1300 characters…"
                className="min-h-24 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={onSaveProject} disabled={savingProject || !draft?.name.trim()}>
              {savingProject ? <Loader2 className="size-4 animate-spin" /> : null}
              {draft?.id !== undefined ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
