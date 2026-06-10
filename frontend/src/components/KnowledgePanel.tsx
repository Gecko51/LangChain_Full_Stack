"use client";

// RAG knowledge base manager: paste documents, which get chunked + embedded (via the
// user's OpenRouter key) so the agent's search_knowledge_base tool can retrieve them.
// Self-contained (its own state + the /rag/documents API).
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addRagDocument,
  deleteRagDocument,
  fetchRagDocuments,
} from "@/lib/api";
import type { RagDocument } from "@/types/agent";

export function KnowledgePanel() {
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    fetchRagDocuments()
      .then(setDocs)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const onAdd = async () => {
    const t = title.trim();
    if (!t || !content.trim()) return;
    setAdding(true);
    try {
      setDocs(await addRagDocument(t, content));
      setTitle("");
      setContent("");
      toast.success(`Added "${t}" to your knowledge base`);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  const onDelete = async (t: string) => {
    try {
      setDocs(await deleteRagDocument(t));
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <Label>Documents</Label>
      <p className="text-muted-foreground text-[11px]">
        Paste notes, docs or FAQs. The agent searches them to answer questions about your
        own data (embedded via your OpenRouter key).
      </p>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Pricing FAQ)"
        className="text-xs"
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste the document text…"
        className="min-h-20 text-xs"
      />
      <Button
        size="sm"
        className="w-full"
        onClick={onAdd}
        disabled={adding || !title.trim() || !content.trim()}
      >
        {adding ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Embedding…
          </>
        ) : (
          <>
            <Plus className="size-3.5" /> Add document
          </>
        )}
      </Button>

      {docs.length > 0 ? (
        <div className="max-h-40 space-y-1 overflow-y-auto pt-1">
          {docs.map((d) => (
            <div
              key={d.title}
              className="hover:border-primary/50 flex items-center gap-1 rounded-md border px-2 py-1.5 transition-colors"
            >
              <FileText className="text-muted-foreground size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs">{d.title}</span>
              <span className="text-muted-foreground shrink-0 text-[10px]">
                {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => onDelete(d.title)}
                aria-label={`Delete ${d.title}`}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground pt-1 text-center text-xs">
          No documents yet — paste one above so the agent can answer from it.
        </p>
      )}
    </div>
  );
}
