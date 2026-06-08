"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Markdown } from "@/components/Markdown";
import { ToolCallChip } from "@/components/ToolCallChip";
import { TypingDots } from "@/components/TypingDots";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/agent";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (e.g. insecure context) — ignore
    }
  };

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
