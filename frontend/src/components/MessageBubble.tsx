"use client";

import { BarChart3, Check, Copy } from "lucide-react";
import { useState } from "react";

import { Markdown } from "@/components/Markdown";
import { ToolCallChip } from "@/components/ToolCallChip";
import { TypingDots } from "@/components/TypingDots";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchGenerationCost } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/agent";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  // Cost is fetched lazily when the metrics popover opens (undefined = not yet).
  const [cost, setCost] = useState<number | null | undefined>(undefined);
  const [loadingCost, setLoadingCost] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (e.g. insecure context) — ignore
    }
  };

  const usage = message.usage;

  // Fetch the cost the first time the panel opens (retry while still null).
  const onMetricsOpen = async (open: boolean) => {
    const genId = usage?.generation_id;
    if (open && (cost === undefined || cost === null) && genId && !loadingCost) {
      setLoadingCost(true);
      try {
        setCost(await fetchGenerationCost(genId));
      } finally {
        setLoadingCost(false);
      }
    }
  };

  const tokenRows: [string, number | null | undefined][] = usage
    ? [
        ["Prompt tokens", usage.prompt_tokens],
        ["Completion tokens", usage.completion_tokens],
        ["Total tokens", usage.total_tokens],
        ["Reasoning tokens", usage.reasoning_tokens],
      ]
    : [];

  return (
    <div
      className={cn(
        "flex animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "group relative min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "rounded-br-sm bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20"
            : "bg-card rounded-bl-sm border",
        )}
      >
        {/* Intermediate tool calls (assistant only). */}
        {message.toolCalls?.map((t) => <ToolCallChip key={t.id} tool={t} />)}

        {message.content ? (
          isUser ? (
            <p className="break-words whitespace-pre-wrap">{message.content}</p>
          ) : (
            <Markdown>{message.content}</Markdown>
          )
        ) : !isUser && message.streaming ? (
          <TypingDots />
        ) : null}

        {/* Usage metrics — small icon that opens a metrics panel (assistant only). */}
        {!isUser && usage && !message.streaming ? (
          <Popover onOpenChange={onMetricsOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="Usage metrics"
                title="Usage metrics"
                className="text-muted-foreground hover:text-foreground mt-1.5 inline-flex items-center gap-1 text-[11px] transition-colors"
              >
                <BarChart3 className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60">
              <p className="mb-2 text-xs font-semibold">OpenRouter usage</p>
              <div className="space-y-1">
                {tokenRows.map(([label, val]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono">{val ?? "—"}</span>
                  </div>
                ))}
                <div className="border-border my-1.5 border-t" />
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-muted-foreground">Cost</span>
                  <span className="font-mono">
                    {loadingCost ? "…" : cost == null ? "—" : `$${cost.toFixed(6)}`}
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        {/* Copy button — appears on hover over a finished assistant message. */}
        {!isUser && message.content && !message.streaming ? (
          <button
            onClick={copy}
            aria-label="Copy message"
            className="bg-background absolute -top-2 -right-2 rounded-md border p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          >
            {copied ? (
              <Check className="size-3 text-emerald-500" />
            ) : (
              <Copy className="text-muted-foreground size-3" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
