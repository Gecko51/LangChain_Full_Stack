"use client";

// A compact "what is my agent equipped with" strip, shown on the empty chat screen:
// tools, long-term memory, documents (RAG), and scheduled runs — at a glance.
import { Brain, Clock, FileText, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { useAgentConfig } from "@/hooks/useAgentConfig";
import { useSettings } from "@/hooks/useSettings";
import { fetchMemories, fetchRagDocuments, fetchSchedules } from "@/lib/api";
import { cn } from "@/lib/utils";

export function CapabilitiesStrip() {
  const { config } = useAgentConfig();
  const { settings } = useSettings();
  const [counts, setCounts] = useState({ memories: 0, docs: 0, schedules: 0 });

  // Pull the live counts once (cheap GETs; only on the empty screen).
  useEffect(() => {
    Promise.allSettled([fetchMemories(), fetchRagDocuments(), fetchSchedules()]).then(
      ([m, d, s]) =>
        setCounts({
          memories: m.status === "fulfilled" ? m.value.length : 0,
          docs: d.status === "fulfilled" ? d.value.length : 0,
          schedules: s.status === "fulfilled" ? s.value.length : 0,
        }),
    );
  }, []);

  const tools =
    config.tools_enabled.length + settings.mcp_servers.filter((s) => s.enabled).length;

  const chips = [
    { icon: Wrench, label: `${tools} tool${tools === 1 ? "" : "s"}`, active: tools > 0 },
    {
      icon: Brain,
      label: config.longterm_memory ? `${counts.memories} memories` : "memory off",
      active: config.longterm_memory,
    },
    {
      icon: FileText,
      label: config.rag_enabled ? `${counts.docs} docs` : "docs off",
      active: config.rag_enabled,
    },
    {
      icon: Clock,
      label: `${counts.schedules} scheduled`,
      active: counts.schedules > 0,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
            c.active
              ? "border-primary/30 text-foreground"
              : "text-muted-foreground/60",
          )}
        >
          <c.icon className="size-3" />
          {c.label}
        </span>
      ))}
    </div>
  );
}
