"use client";

// One-click connector catalog: cards for popular MCP tools (Notion, GitHub, Slack…).
// Clicking a card opens a small dialog that asks only for the needed credential(s) and
// builds the MCP server — no more pasting npx commands or raw JSON.
import { ExternalLink, Loader2, Plug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { fetchConnectors } from "@/lib/api";
import type { Connector, MCPServer } from "@/types/agent";

export function ConnectorCatalog({
  onConnect,
}: {
  onConnect: (server: MCPServer) => Promise<void>;
}) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [active, setActive] = useState<Connector | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchConnectors()
      .then(setConnectors)
      .catch(() => {});
  }, []);

  const open = (c: Connector) => {
    setActive(c);
    setValues(Object.fromEntries(c.inputs.map((i) => [i.key, i.default ?? ""])));
  };

  const connect = async () => {
    if (!active) return;
    const env: Record<string, string> = {};
    const headers: Record<string, string> = {};
    const extraArgs: string[] = [];
    for (const inp of active.inputs) {
      const v = (values[inp.key] ?? inp.default ?? "").trim();
      if (inp.kind === "env") env[inp.key] = v;
      else if (inp.kind === "header") headers[inp.key] = v;
      else if (inp.kind === "arg") extraArgs.push(v);
    }
    const server: MCPServer = {
      name: active.id,
      transport: active.transport,
      command: active.command ?? null,
      args: [...active.base_args, ...extraArgs],
      url: active.url ?? null,
      enabled: true,
      env,
      headers,
    };
    setConnecting(true);
    try {
      await onConnect(server);
      toast.success(`Connected ${active.label}`);
      setActive(null);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setConnecting(false);
    }
  };

  if (connectors.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>Connect a tool</Label>
      <div className="grid grid-cols-2 gap-2">
        {connectors.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => open(c)}
            className="hover:border-primary/50 hover:bg-accent/40 flex flex-col gap-0.5 rounded-md border p-2 text-left transition-colors"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-xs font-medium">{c.label}</span>
              <Badge variant="secondary" className="shrink-0 text-[9px]">
                {c.category}
              </Badge>
            </div>
            <span className="text-muted-foreground line-clamp-2 text-[11px]">
              {c.description}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="size-4" />
              Connect {active?.label}
            </DialogTitle>
            <DialogDescription>{active?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {active?.inputs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No credentials needed — connect right away.
              </p>
            ) : (
              active?.inputs.map((inp) => (
                <div key={inp.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{inp.label}</Label>
                    {inp.help_url ? (
                      <a
                        href={inp.help_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex shrink-0 items-center gap-0.5 text-[11px] hover:underline"
                      >
                        Get it <ExternalLink className="size-2.5" />
                      </a>
                    ) : null}
                  </div>
                  <Input
                    type={inp.secret ? "password" : "text"}
                    value={values[inp.key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [inp.key]: e.target.value }))
                    }
                    placeholder={inp.kind === "arg" ? (inp.default ?? "") : "paste here"}
                    className="font-mono text-xs"
                  />
                </div>
              ))
            )}
            {active?.help_url ? (
              <a
                href={active.help_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground inline-flex items-center gap-0.5 text-[11px] hover:underline"
              >
                Setup docs <ExternalLink className="size-2.5" />
              </a>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={connect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plug className="size-4" />
              )}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
