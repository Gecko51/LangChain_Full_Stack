import { ToolCallChip } from "@/components/ToolCallChip";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/agent";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "rounded-br-sm bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"
            : "bg-card rounded-bl-sm border",
        )}
      >
        {/* Intermediate tool calls (assistant only). */}
        {message.toolCalls?.map((t) => <ToolCallChip key={t.id} tool={t} />)}

        {message.content ? (
          <p className="break-words whitespace-pre-wrap">{message.content}</p>
        ) : !isUser && message.streaming ? (
          // Blinking placeholder while the first token is pending.
          <span className="text-muted-foreground animate-pulse">▍</span>
        ) : null}
      </div>
    </div>
  );
}
