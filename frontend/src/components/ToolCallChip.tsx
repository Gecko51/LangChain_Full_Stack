import { Wrench } from "lucide-react";

import type { ToolCall } from "@/types/agent";

// Renders an intermediate tool call (name + input + optional output) in the chat.
export function ToolCallChip({ tool }: { tool: ToolCall }) {
  return (
    <div className="border-primary/30 bg-primary/5 my-1 rounded-md border px-2 py-1 text-xs">
      <div className="text-primary flex items-center gap-1.5 font-mono">
        <Wrench className="size-3 shrink-0" />
        <span className="font-medium">{tool.name}</span>
        {tool.input ? (
          <span className="text-muted-foreground truncate">
            ({JSON.stringify(tool.input)})
          </span>
        ) : null}
      </div>
      {tool.output ? (
        <p className="text-muted-foreground mt-1 line-clamp-3 italic">{tool.output}</p>
      ) : null}
    </div>
  );
}
