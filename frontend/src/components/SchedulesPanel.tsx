"use client";

// Scheduled background runs: a prompt the agent runs automatically on a cron (UTC).
// Each run uses the user's config/tools/memory/RAG; the latest result is shown here.
import { Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  toggleSchedule,
} from "@/lib/api";
import type { ScheduledTask } from "@/types/agent";

// Friendly presets → cron (UTC). The cron field stays editable for power users.
const PRESETS = [
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Daily 8am", cron: "0 8 * * *" },
  { label: "Daily 6pm", cron: "0 18 * * *" },
  { label: "Mon 9am", cron: "0 9 * * 1" },
];

export function SchedulesPanel() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cron, setCron] = useState("0 8 * * *");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    fetchSchedules()
      .then(setTasks)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<ScheduledTask[]>) => {
    try {
      setTasks(await fn());
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  const onAdd = async () => {
    if (!name.trim() || !prompt.trim() || !cron.trim()) return;
    setAdding(true);
    try {
      setTasks(await createSchedule({ name: name.trim(), prompt, cron: cron.trim() }));
      setName("");
      setPrompt("");
      toast.success("Schedule created");
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <div className="space-y-2">
      <Label>Scheduled runs</Label>
      <p className="text-muted-foreground text-[11px]">
        Run a prompt automatically on a schedule (e.g. a daily summary). Times are UTC; each
        run uses your tools, memory and documents.
      </p>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Morning lead summary)"
        className="text-xs"
      />
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="The prompt to run on schedule…"
        className="min-h-16 text-xs"
      />
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.cron}
            variant={cron === p.cron ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setCron(p.cron)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <Input
        value={cron}
        onChange={(e) => setCron(e.target.value)}
        placeholder="cron (UTC) — e.g. 0 8 * * *"
        className="font-mono text-xs"
      />
      <Button
        size="sm"
        className="w-full"
        onClick={onAdd}
        disabled={adding || !name.trim() || !prompt.trim() || !cron.trim()}
      >
        {adding ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        Add schedule
      </Button>

      {tasks.length > 0 ? (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pt-1">
          {tasks.map((t) => (
            <div key={t.id} className="space-y-1 rounded-md border px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <Clock className="text-muted-foreground size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {t.name}
                </span>
                <Switch
                  checked={t.enabled}
                  onCheckedChange={() => run(() => toggleSchedule(t.id))}
                  className="scale-75"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => run(() => deleteSchedule(t.id))}
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
              <p className="text-muted-foreground font-mono text-[10px]">
                {t.cron} · next {fmt(t.next_run_at)}
              </p>
              {t.last_error ? (
                <p className="text-destructive text-[10px]">⚠ {t.last_error}</p>
              ) : t.last_result ? (
                <p
                  className="text-muted-foreground line-clamp-3 text-[10px]"
                  title={t.last_result}
                >
                  Last ({fmt(t.last_run_at)}): {t.last_result}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground pt-1 text-center text-xs">
          No schedules yet — add one above to run a prompt automatically.
        </p>
      )}
    </div>
  );
}
