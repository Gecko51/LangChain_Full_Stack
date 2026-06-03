"use client";

import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/useSettings";
import { fetchMcpTools } from "@/lib/api";
import type { McpServerStatus, McpTransport } from "@/types/agent";

export function MCPPanel() {
  const { settings, addMcpServer, removeMcpServer, toggleMcpServer } = useSettings();
  const servers = settings.mcp_servers;

  const [status, setStatus] = useState<McpServerStatus[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  // Add-form state.
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("npx");
  const [argsText, setArgsText] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  // Connecting to MCP servers spawns processes, so we fetch on demand (mount + after
  // mutations + manual refresh), never on every render.
  const refreshTools = useCallback(async () => {
    setLoadingTools(true);
    try {
      setStatus(await fetchMcpTools());
    } catch {
      // ignore — per-server errors come back inline
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    refreshTools();
  }, [refreshTools]);

  const statusFor = (n: string) => status.find((s) => s.name === n);

  const onRemove = async (n: string) => {
    await removeMcpServer(n);
    refreshTools();
  };
  const onToggle = async (n: string) => {
    await toggleMcpServer(n);
    refreshTools();
  };

  const onAdd = async () => {
    const cleanName = name.trim().replace(/\s+/g, "-");
    if (!cleanName) return;
    const args = argsText
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);
    setAdding(true);
    try {
      await addMcpServer({
        name: cleanName,
        transport,
        command: transport === "stdio" ? command.trim() : null,
        args: transport === "stdio" ? args : [],
        url: transport === "stdio" ? null : url.trim(),
        enabled: true,
      });
      setName("");
      setArgsText("");
      setUrl("");
      toast.success(`Added MCP server "${cleanName}"`);
      refreshTools();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          MCP servers add tools to the agent. <span className="font-mono">stdio</span> runs a
          local command (needs Node for <span className="font-mono">npx</span>).
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={refreshTools}
          disabled={loadingTools}
        >
          {loadingTools ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>

      {/* ---- Server list ---- */}
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {servers.length === 0 ? (
          <p className="text-muted-foreground text-xs">No MCP servers yet. Add one below.</p>
        ) : (
          servers.map((s) => {
            const st = statusFor(s.name);
            return (
              <div key={s.name} className="rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs">
                      {s.name}{" "}
                      <span className="text-muted-foreground">· {s.transport}</span>
                    </p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      {s.transport === "stdio"
                        ? `${s.command ?? ""} ${(s.args ?? []).join(" ")}`
                        : s.url}
                    </p>
                  </div>
                  <Switch checked={s.enabled} onCheckedChange={() => onToggle(s.name)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => onRemove(s.name)}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {s.enabled && st ? (
                  st.error ? (
                    <p className="text-destructive mt-1 line-clamp-2 text-[11px]">
                      {st.error}
                    </p>
                  ) : st.tools.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {st.tools.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      {loadingTools ? "Connecting…" : "No tools discovered."}
                    </p>
                  )
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* ---- Add form ---- */}
      <div className="space-y-2 border-t pt-3">
        <Label>Add server</Label>
        <div className="flex gap-2">
          <Input
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono text-xs"
          />
          <Select value={transport} onValueChange={(v) => setTransport(v as McpTransport)}>
            <SelectTrigger className="w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="sse">sse</SelectItem>
              <SelectItem value="http">http</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {transport === "stdio" ? (
          <>
            <Input
              placeholder="command (e.g. npx)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="font-mono text-xs"
            />
            <Textarea
              placeholder={"args, one per line:\n-y\n@modelcontextprotocol/server-filesystem\n."}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={3}
              className="resize-none font-mono text-xs"
            />
          </>
        ) : (
          <Input
            placeholder="https://server/sse"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono text-xs"
          />
        )}
        <Button onClick={onAdd} disabled={adding || !name.trim()}>
          {adding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add server
        </Button>
      </div>
    </div>
  );
}
