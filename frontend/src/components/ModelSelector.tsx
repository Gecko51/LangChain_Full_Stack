"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchModels } from "@/lib/api";
import type { ModelInfo } from "@/types/agent";

export function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchModels()
      .then((m) => active && setModels(m))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Group models by provider for the dropdown.
  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const arr = map.get(m.provider) ?? [];
      arr.push(m);
      map.set(m.provider, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [models]);

  // Keep the current value selectable even if it's not in the fetched list.
  const hasValue = models.some((m) => m.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full font-mono text-xs">
        <SelectValue placeholder={loading ? "Loading models…" : "Select a model"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {!hasValue && value ? (
          <SelectItem value={value} className="font-mono text-xs">
            {value}
          </SelectItem>
        ) : null}
        {grouped.map(([provider, items]) => (
          <SelectGroup key={provider}>
            <SelectLabel className="capitalize">{provider}</SelectLabel>
            {items.map((m) => (
              <SelectItem key={m.value} value={m.value} className="font-mono text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
