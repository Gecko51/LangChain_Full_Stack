"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { fetchTools } from "@/lib/api";
import type { ToolInfo } from "@/types/agent";

export function ToolsPanel({
  enabled,
  onToggle,
}: {
  enabled: string[];
  onToggle: (name: string, on: boolean) => void;
}) {
  const [tools, setTools] = useState<ToolInfo[]>([]);

  useEffect(() => {
    fetchTools()
      .then(setTools)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      {tools.map((t) => (
        <div key={t.name} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs">{t.name}</p>
            <p className="text-muted-foreground line-clamp-2 text-xs">{t.description}</p>
          </div>
          <Switch
            checked={enabled.includes(t.name)}
            onCheckedChange={(v) => onToggle(t.name, v)}
          />
        </div>
      ))}

      {/* MCP servers — Phase 2 (disabled placeholder so the UI tells the roadmap). */}
      <div className="rounded-md border border-dashed p-3 opacity-60">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">MCP servers</p>
          <Badge variant="outline" className="text-[10px]">
            Phase 2
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Connect filesystem, fetch, Playwright… (coming soon)
        </p>
      </div>
    </div>
  );
}
