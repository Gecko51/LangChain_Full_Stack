"use client";

// Workspace context: the user's projects + conversations and which one is open.
// Shared by the left sidebar (lists, selection) and the ChatInterface (the open
// conversation's id + project, refreshed after each turn).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  clearSession,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  fetchProjects,
  fetchSessions,
  updateProject as apiUpdateProject,
} from "@/lib/api";
import type { Project, SessionSummary } from "@/types/agent";

// Small random id for new conversations (same shape as the chat's message ids).
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface WorkspaceContextValue {
  projects: Project[];
  sessions: SessionSummary[];
  /** The open conversation. */
  activeSessionId: string;
  /** Sidebar filter: which project's conversations are listed (null = all). */
  activeProjectId: number | null;
  /** The project the OPEN conversation belongs to (sent with each chat turn). */
  conversationProjectId: number | null;
  selectProject: (id: number | null) => void;
  selectSession: (id: string) => void;
  /** Start a fresh conversation (assigned to the current project filter). */
  newConversation: () => void;
  deleteSession: (id: string) => Promise<void>;
  refreshSessions: () => void;
  saveProject: (name: string, instructions: string, id?: number) => Promise<void>;
  removeProject: (id: number) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("agentpg_session") || "default"
      : "default",
  );
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [conversationProjectId, setConversationProjectId] = useState<number | null>(
    null,
  );

  // Persist the open conversation so a reload restores it.
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("agentpg_session", activeSessionId);
  }, [activeSessionId]);

  const refreshSessions = useCallback(() => {
    fetchSessions()
      .then(setSessions)
      .catch(() => {});
  }, []);
  const refreshProjects = useCallback(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshSessions();
    refreshProjects();
  }, [refreshSessions, refreshProjects]);

  // The stored session row is the source of truth for an EXISTING conversation's
  // project (covers reload). A brand-new conversation isn't in the list yet, so the
  // locally chosen project sticks until its first turn is persisted. A project id
  // that no longer exists (deleted mid-stream race) is treated as unassigned.
  useEffect(() => {
    const s = sessions.find((x) => x.session_id === activeSessionId);
    if (!s) return;
    const pid = s.project_id ?? null;
    setConversationProjectId(
      pid !== null && projects.some((p) => p.id === pid) ? pid : null,
    );
  }, [sessions, projects, activeSessionId]);

  const selectProject = useCallback((id: number | null) => {
    setActiveProjectId(id);
  }, []);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const newConversation = useCallback(() => {
    const id = uid();
    setConversationProjectId(activeProjectId); // new chat joins the filtered project
    setActiveSessionId(id);
  }, [activeProjectId]);

  const deleteSession = useCallback(
    async (id: string) => {
      await clearSession(id);
      if (id === activeSessionId) {
        const fresh = uid();
        setConversationProjectId(activeProjectId);
        setActiveSessionId(fresh);
      }
      refreshSessions();
    },
    [activeSessionId, activeProjectId, refreshSessions],
  );

  const saveProject = useCallback(
    async (name: string, instructions: string, id?: number) => {
      setProjects(
        id !== undefined
          ? await apiUpdateProject(id, name, instructions)
          : await apiCreateProject(name, instructions),
      );
    },
    [],
  );

  const removeProject = useCallback(
    async (id: number) => {
      setProjects(await apiDeleteProject(id));
      if (activeProjectId === id) setActiveProjectId(null);
      if (conversationProjectId === id) setConversationProjectId(null);
      refreshSessions(); // its conversations became unassigned
    },
    [activeProjectId, conversationProjectId, refreshSessions],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        projects,
        sessions,
        activeSessionId,
        activeProjectId,
        conversationProjectId,
        selectProject,
        selectSession,
        newConversation,
        deleteSession,
        refreshSessions,
        saveProject,
        removeProject,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
