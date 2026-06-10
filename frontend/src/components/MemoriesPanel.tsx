"use client";

// Long-term memory manager: the durable facts the agent recalls across every chat.
// The agent writes them itself via its `remember` tool; the user can also add/remove
// them here. Self-contained (its own state + the /memories API) — not part of settings.
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addMemory,
  clearMemories,
  deleteMemory,
  fetchMemories,
} from "@/lib/api";
import type { Memory } from "@/types/agent";

export function MemoriesPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchMemories()
      .then(setMemories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Wrap a mutation so any failure surfaces a toast instead of silently dropping.
  const run = async (fn: () => Promise<Memory[]>) => {
    try {
      setMemories(await fn());
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  const onAdd = async () => {
    const c = draft.trim();
    if (!c) return;
    await run(() => addMemory(c));
    setDraft("");
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <Label>Saved memories</Label>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground font-mono text-xs">
            {memories.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={refresh}
            aria-label="Refresh memories"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {memories.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => run(clearMemories)}
              aria-label="Clear all memories"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground text-[11px]">
        Durable facts the agent recalls across every chat. It saves them itself via its{" "}
        <span className="font-mono">remember</span> tool — or add your own.
      </p>

      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          placeholder="e.g. I run a B2B prospecting agency"
          className="text-xs"
        />
        <Button
          size="icon"
          className="size-9 shrink-0"
          onClick={onAdd}
          disabled={!draft.trim()}
          aria-label="Add memory"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {memories.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {loading ? "Loading…" : "No memories yet."}
        </p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {memories.map((m) => (
            <div
              key={m.id}
              className="hover:border-primary/50 flex items-start gap-1 rounded-md border px-2 py-1.5 transition-colors"
            >
              <p className="min-w-0 flex-1 text-xs">{m.content}</p>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => run(() => deleteMemory(m.id))}
                aria-label="Delete memory"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
