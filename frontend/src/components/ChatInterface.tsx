"use client";

import { Eraser, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MessageBubble } from "@/components/MessageBubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAgentStream } from "@/hooks/useAgentStream";
import { clearSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AgentStatus, ChatMessage, ToolCall } from "@/types/agent";

const SESSION_ID = "default";

// Small random id for messages (no crypto needed here).
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const STATUS_META: Record<AgentStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "bg-muted text-muted-foreground" },
  thinking: { label: "Thinking", className: "bg-amber-500/15 text-amber-500" },
  streaming: { label: "Streaming", className: "bg-primary/15 text-primary" },
  error: { label: "Error", className: "bg-destructive/15 text-destructive" },
};

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<AgentStatus>("idle");
  const assistantIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the latest content.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Patch the in-flight assistant message by id.
  const patchAssistant = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    const id = assistantIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const { send, cancel, isStreaming } = useAgentStream({
    onToken: (text) => {
      setStatus("streaming");
      patchAssistant((m) => ({ ...m, content: m.content + text }));
    },
    onToolStart: (t) => {
      const call: ToolCall = { id: t.id, name: t.name, input: t.input };
      patchAssistant((m) => ({ ...m, toolCalls: [...(m.toolCalls ?? []), call] }));
    },
    onToolEnd: (t) => {
      patchAssistant((m) => ({
        ...m,
        toolCalls: (m.toolCalls ?? []).map((c) =>
          c.id === t.id ? { ...c, output: t.output } : c,
        ),
      }));
    },
    onComplete: (content) => {
      patchAssistant((m) => ({ ...m, content: content || m.content, streaming: false }));
      assistantIdRef.current = null;
      setStatus("idle");
    },
    onError: (err) => {
      patchAssistant((m) => ({
        ...m,
        content: m.content || `⚠️ ${err.detail || err.error}`,
        streaming: false,
      }));
      assistantIdRef.current = null;
      setStatus("error");
    },
  });

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      toolCalls: [],
      streaming: true,
      timestamp: Date.now(),
    };
    assistantIdRef.current = assistantMsg.id;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStatus("thinking");
    void send(text, SESSION_ID);
  }, [input, isStreaming, send]);

  const handleClear = useCallback(async () => {
    cancel();
    setMessages([]);
    setStatus("idle");
    assistantIdRef.current = null;
    try {
      await clearSession(SESSION_ID);
    } catch {
      // ignore — clearing local state is what matters for the user
    }
  }, [cancel]);

  const statusMeta = STATUS_META[status];

  return (
    <div className="flex h-full flex-col">
      {/* ---- Header: status + clear ---- */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Chat</span>
          <Badge className={cn("border-0 text-[10px]", statusMeta.className)}>
            {statusMeta.label}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={messages.length === 0}
        >
          <Eraser className="size-3" />
          Clear history
        </Button>
      </div>

      {/* ---- Messages ---- */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {messages.length === 0 ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center py-20 text-center text-sm">
              <p className="mb-1 text-base">👋 Start a conversation</p>
              <p>Tune the agent, then send a message.</p>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* ---- Input ---- */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a newline.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
            rows={1}
            className="max-h-40 min-h-10 flex-1 resize-none"
          />
          {isStreaming ? (
            <Button variant="secondary" size="icon" className="size-10" onClick={cancel}>
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-10 shadow-lg shadow-primary/30"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
