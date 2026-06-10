"use client";

// A slide-out left drawer listing the user's conversations (sessions). Click to switch,
// "New" to start a fresh one, trash to delete. Replaces the old archive workflow.
import { MessagesSquare, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { clearSession, fetchSessions } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SessionSummary } from "@/types/agent";

export function ConversationsSidebar({
  open,
  onClose,
  activeId,
  onSelect,
  onNew,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number; // bump from the parent to force a refetch (e.g. after a new turn)
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const refresh = useCallback(() => {
    fetchSessions()
      .then(setSessions)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (open) refresh();
  }, [open, refreshKey, refresh]);

  const onDelete = async (id: string) => {
    try {
      await clearSession(id);
      if (id === activeId) onNew(); // deleted the open one → start fresh
      refresh();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
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
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <div
        className={cn(
          "bg-background fixed top-0 left-0 z-50 flex h-dvh w-72 flex-col border-r shadow-xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <MessagesSquare className="size-4" /> Conversations
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Close conversations"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="p-2">
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              onNew();
              onClose();
            }}
          >
            <Plus className="size-3.5" /> New conversation
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {sessions.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-center text-xs">
              No conversations yet.
            </p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.session_id}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
                  s.session_id === activeId ? "bg-primary/15" : "hover:bg-accent/50",
                )}
              >
                <button
                  onClick={() => {
                    onSelect(s.session_id);
                    onClose();
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium">
                    {s.title || "New conversation"}
                  </p>
                  <p className="text-muted-foreground text-[10px]">{fmt(s.updated_at)}</p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onDelete(s.session_id)}
                  aria-label="Delete conversation"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
