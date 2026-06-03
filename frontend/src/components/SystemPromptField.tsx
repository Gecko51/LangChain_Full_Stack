"use client";

import { Maximize2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// System prompt editor: a compact inline textarea for quick edits, plus an
// "expand" button that opens a roomy dialog for writing long prompts.
export function SystemPromptField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="resize-none pr-9 font-mono text-xs"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 size-7"
            aria-label="Expand the system prompt editor"
            title="Expand editor"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>System Prompt</DialogTitle>
            <DialogDescription>
              Write a longer prompt here. Changes apply when you click “Save &amp; Apply”.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="max-h-[60vh] min-h-[55vh] resize-none font-mono text-sm"
            autoFocus
          />
          <DialogFooter className="sm:justify-between">
            <span className="text-muted-foreground self-center text-xs">
              {value.length} characters
            </span>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
