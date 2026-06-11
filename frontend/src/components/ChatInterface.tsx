"use client";

import { Eraser, MessageSquarePlus, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CapabilitiesStrip } from "@/components/CapabilitiesStrip";
import { MessageBubble } from "@/components/MessageBubble";
import { PromptVariablesDialog } from "@/components/PromptVariablesDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentStream } from "@/hooks/useAgentStream";
import { useSettings } from "@/hooks/useSettings";
import { useWorkspace } from "@/hooks/useWorkspace";
import { clearSession, fetchSession } from "@/lib/api";
import { parseVars } from "@/lib/promptVars";
import { cn } from "@/lib/utils";
import type { AgentStatus, ChatMessage, CustomPrompt, ToolCall } from "@/types/agent";

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
  const { settings } = useSettings();
  const prompts = settings.custom_prompts;

  // The open conversation + its project come from the shared workspace context (the
  // left sidebar drives them; we send turns to them and refresh the lists after).
  const { activeSessionId, conversationProjectId, newConversation, refreshSessions } =
    useWorkspace();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  // A saved prompt picked from the slash menu — shown as a /name chip, expanded on send.
  const [activePrompt, setActivePrompt] = useState<CustomPrompt | null>(null);
  // A picked prompt that still has {{variables}} to fill before it can become active.
  const [varPrompt, setVarPrompt] = useState<CustomPrompt | null>(null);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const assistantIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to the latest content (scrolls the ScrollArea viewport).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Re-hydrate whenever the active conversation changes (and on first load): the chat is
  // restored from the persisted session, tool-call bubbles included. Sending a message
  // does NOT re-fetch (hydratedRef already matches), it just appends. A brand-new
  // conversation simply hydrates to [] (the session doesn't exist yet).
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedRef.current === activeSessionId) return;
    hydratedRef.current = activeSessionId;
    fetchSession(activeSessionId)
      .then((msgs) =>
        setMessages(
          msgs.map((m) => ({
            id: uid(),
            role: m.role,
            content: m.content,
            toolCalls: m.tool_calls,
            timestamp: Date.now(),
          })),
        ),
      )
      .catch(() => {});
  }, [activeSessionId]);

  // ----- Slash-command menu for custom prompts -----
  const slashQuery = input.startsWith("/") ? input.slice(1).toLowerCase() : null;
  const slashMatches =
    slashQuery !== null
      ? prompts.filter((p) => p.name.toLowerCase().includes(slashQuery))
      : [];
  const showSlash = slashQuery !== null && slashMatches.length > 0;

  const selectPrompt = (prompt: CustomPrompt) => {
    setInput("");
    // If the prompt has {{variables}}, collect them first; otherwise activate it directly.
    if (parseVars(prompt.content).length > 0) {
      setVarPrompt(prompt);
    } else {
      setActivePrompt(prompt); // show a /name chip instead of pasting the full content
      inputRef.current?.focus();
    }
  };

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
    // Usage arrives just before "done", while the message id is still tracked.
    onUsage: (usage) => {
      patchAssistant((m) => ({ ...m, usage }));
    },
    onComplete: (content) => {
      patchAssistant((m) => ({ ...m, content: content || m.content, streaming: false }));
      assistantIdRef.current = null;
      setStatus("idle");
      // The session was just persisted (title / updated_at) — refresh the sidebar list.
      refreshSessions();
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
    const details = input.trim();
    if (isStreaming || (!details && !activePrompt)) return;

    // The bubble shows the compact /name; the agent receives the full prompt content.
    const displayText = activePrompt
      ? `/${activePrompt.name}${details ? `\n\n${details}` : ""}`
      : details;
    const sentText = activePrompt
      ? `${activePrompt.content}${details ? `\n\n${details}` : ""}`
      : details;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: displayText,
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
    setActivePrompt(null);
    setStatus("thinking");
    // The turn is sent to the open conversation, tagged with ITS project (whose
    // instructions the backend applies after verifying ownership).
    void send(sentText, activeSessionId, conversationProjectId);
  }, [input, activePrompt, isStreaming, send, activeSessionId, conversationProjectId]);

  // Stop streaming: abort the request AND finalize the in-flight bubble + status.
  // (cancel() alone leaves the bubble showing "streaming" and the badge on "Streaming"
  // forever, because the abort path fires no completion callback.)
  const handleStop = useCallback(() => {
    cancel();
    patchAssistant((m) => ({ ...m, streaming: false }));
    assistantIdRef.current = null;
    setStatus("idle");
  }, [cancel, patchAssistant]);

  const handleClear = useCallback(async () => {
    cancel();
    setMessages([]);
    setStatus("idle");
    assistantIdRef.current = null;
    try {
      await clearSession(activeSessionId);
    } catch {
      // ignore — clearing the local state is what matters for the user
    }
    refreshSessions();
  }, [cancel, activeSessionId, refreshSessions]);

  // Start a brand-new conversation (the sidebar drives the id via the workspace).
  const handleNewChat = useCallback(() => {
    cancel();
    setMessages([]);
    setStatus("idle");
    assistantIdRef.current = null;
    newConversation();
  }, [cancel, newConversation]);

  // When the sidebar switches conversations, abort any in-flight stream and reset the
  // status (the hydration effect above loads the new conversation's messages).
  useEffect(() => {
    cancel();
    setStatus("idle");
    assistantIdRef.current = null;
  }, [activeSessionId, cancel]);

  const statusMeta = STATUS_META[status];

  return (
    // h-full comes from the parent grid row (definite height); the three sections
    // below are: fixed header, scrollable messages (min-h-0!), fixed input.
    <div className="flex h-full flex-col">
      {/* ---- Header: conversations + status + new/clear (fixed) ---- */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Chat</span>
          <Badge className={cn("border-0 text-[10px]", statusMeta.className)}>
            {statusMeta.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            disabled={messages.length === 0}
            title="Start a new conversation"
          >
            <MessageSquarePlus className="size-3" />
            New chat
          </Button>
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
      </div>

      {/* ---- Messages (scrollable) ----
          min-h-0 lets this flex child shrink below its content so the viewport
          actually scrolls instead of pushing the input off-screen. */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 py-12 text-center">
              <div>
                <p className="mb-1 text-lg font-medium">👋 Start a conversation</p>
                <p className="text-muted-foreground text-sm">
                  I can use your connected tools, remember facts about you, and search
                  your documents. Try one of these:
                </p>
              </div>
              <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { icon: "✨", text: "What can you help me with?" },
                  { icon: "🧠", text: "Remember that my main offer is " },
                  { icon: "✍️", text: "Write a short, friendly LinkedIn connection message" },
                  { icon: "📊", text: "Help me plan a week of LinkedIn content about " },
                ].map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => {
                      setInput(s.text);
                      inputRef.current?.focus();
                    }}
                    className="hover:border-primary/50 hover:bg-accent/40 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors"
                  >
                    <span className="mr-1.5">{s.icon}</span>
                    <span className="text-muted-foreground">{s.text}</span>
                  </button>
                ))}
              </div>
              <CapabilitiesStrip />
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* ---- Input (fixed, independent of the messages area) ---- */}
      <div className="shrink-0 border-t p-3">
        <div className="relative">
          {/* Slash-command menu (custom prompts) */}
          {showSlash ? (
            <div className="bg-popover absolute bottom-full left-0 mb-2 max-h-48 w-full overflow-y-auto rounded-lg border p-1 shadow-lg">
              <p className="text-muted-foreground px-2 py-1 text-[10px] uppercase">
                Custom prompts
              </p>
              {slashMatches.map((p) => (
                <button
                  key={p.name}
                  onClick={() => selectPrompt(p)}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
                >
                  <span className="text-primary shrink-0 font-mono text-sm">/{p.name}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{p.content}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            {/* Input box: an optional /name chip + an auto-growing borderless textarea. */}
            <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex flex-1 items-start gap-1.5 rounded-lg border bg-transparent px-2.5 py-2 transition-[color,box-shadow] focus-within:ring-[3px] dark:bg-input/30">
              {activePrompt ? (
                <button
                  type="button"
                  onClick={() => setActivePrompt(null)}
                  title={`${activePrompt.content}\n\n(click to remove)`}
                  className="text-primary bg-primary/15 hover:bg-primary/25 mt-0.5 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs transition-colors"
                >
                  /{activePrompt.name}
                  <X className="size-3" />
                </button>
              ) : null}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    // If the slash menu is open, Enter picks the top prompt instead.
                    if (showSlash) {
                      selectPrompt(slashMatches[0]);
                      return;
                    }
                    handleSend();
                  }
                }}
                placeholder={
                  activePrompt
                    ? "add details (optional)…"
                    : "Type a message…  (/ for saved prompts · Shift+Enter = new line)"
                }
                rows={1}
                // Auto-grows with the typed content (up to max-h, then scrolls).
                className="placeholder:text-muted-foreground field-sizing-content max-h-44 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none"
              />
            </div>
            {isStreaming ? (
              <Button variant="secondary" size="icon" className="size-10" onClick={handleStop}>
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-10 shadow-lg shadow-primary/30"
                onClick={handleSend}
                disabled={!input.trim() && !activePrompt}
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Fill {{variables}} for a picked prompt, then activate it as a /name chip. */}
      <PromptVariablesDialog
        prompt={varPrompt}
        onResolve={(resolved) => {
          setActivePrompt(resolved);
          setVarPrompt(null);
          inputRef.current?.focus();
        }}
        onCancel={() => setVarPrompt(null)}
      />

    </div>
  );
}
