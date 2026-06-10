"use client";

// When a saved prompt picked from the slash menu contains {{variables}}, this dialog
// asks the user to fill them, then returns the prompt with the values substituted in.
import { useEffect, useMemo, useState } from "react";

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
import { fillVars, parseVars } from "@/lib/promptVars";
import type { CustomPrompt } from "@/types/agent";

export function PromptVariablesDialog({
  prompt,
  onResolve,
  onCancel,
}: {
  prompt: CustomPrompt | null;
  onResolve: (resolved: CustomPrompt) => void;
  onCancel: () => void;
}) {
  const vars = useMemo(() => (prompt ? parseVars(prompt.content) : []), [prompt]);
  const [values, setValues] = useState<Record<string, string>>({});

  // Reset the form each time a different prompt opens it.
  useEffect(() => {
    setValues({});
  }, [prompt]);

  const insert = () => {
    if (!prompt) return;
    onResolve({ name: prompt.name, content: fillVars(prompt.content, values) });
  };

  // Humanize the variable name for its label: "first_name" -> "First name".
  const labelFor = (v: string) =>
    v.replace(/[_.-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <Dialog open={!!prompt} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">/{prompt?.name}</DialogTitle>
          <DialogDescription>Fill in the prompt variables.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {vars.map((v, i) => (
            <div key={v} className="space-y-1">
              <Label htmlFor={`var-${v}`} className="text-xs">
                {labelFor(v)}
              </Label>
              <Input
                id={`var-${v}`}
                value={values[v] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [v]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") insert();
                }}
                placeholder={`{{${v}}}`}
                className="text-sm"
                autoFocus={i === 0}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={insert}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
