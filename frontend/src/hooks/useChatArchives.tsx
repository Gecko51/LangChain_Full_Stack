"use client";

// Context for chat archives (saved past conversations): the list, archiving the
// current conversation, restoring one into the chat, and deleting one. Shared between
// the chat (which archives/restores) and the Memory settings panel (which lists them).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  createArchive,
  deleteArchive,
  fetchArchives,
  restoreArchive,
} from "@/lib/api";
import type { ChatArchive } from "@/types/agent";

type ArchiveMessage = { role: string; content: string };

interface ArchivesContextValue {
  archives: ChatArchive[];
  refresh: () => Promise<void>;
  archiveConversation: (messages: ArchiveMessage[]) => Promise<void>;
  requestRestore: (id: string) => Promise<void>;
  removeArchive: (id: string) => Promise<void>;
  // Set when an archive is restored; ChatInterface consumes it to load the messages.
  restoreTarget: ArchiveMessage[] | null;
  consumeRestore: () => void;
}

const ArchivesContext = createContext<ArchivesContextValue | null>(null);

export function ChatArchivesProvider({ children }: { children: ReactNode }) {
  const [archives, setArchives] = useState<ChatArchive[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<ArchiveMessage[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      setArchives(await fetchArchives());
    } catch {
      // best-effort — archives degrade gracefully
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const archiveConversation = useCallback(async (messages: ArchiveMessage[]) => {
    try {
      setArchives(await createArchive(messages));
    } catch {
      /* ignore */
    }
  }, []);

  const requestRestore = useCallback(async (id: string) => {
    try {
      setRestoreTarget(await restoreArchive(id));
    } catch {
      /* ignore */
    }
  }, []);

  const removeArchive = useCallback(async (id: string) => {
    try {
      setArchives(await deleteArchive(id));
    } catch {
      /* ignore */
    }
  }, []);

  const consumeRestore = useCallback(() => setRestoreTarget(null), []);

  return (
    <ArchivesContext.Provider
      value={{
        archives,
        refresh,
        archiveConversation,
        requestRestore,
        removeArchive,
        restoreTarget,
        consumeRestore,
      }}
    >
      {children}
    </ArchivesContext.Provider>
  );
}

export function useChatArchives() {
  const ctx = useContext(ArchivesContext);
  if (!ctx)
    throw new Error("useChatArchives must be used within a ChatArchivesProvider");
  return ctx;
}
