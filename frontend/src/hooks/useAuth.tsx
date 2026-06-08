"use client";

// Auth context: the login gate. Holds the JWT (persisted in localStorage), tells the
// app whether an account exists yet (register vs login), and exposes login/register/logout.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  fetchAuthStatus,
  login as apiLogin,
  register as apiRegister,
  setAuthToken,
} from "@/lib/api";

const TOKEN_KEY = "agentpg_token";
const USER_KEY = "agentpg_user";

interface AuthContextValue {
  token: string | null;
  username: string | null;
  /** Initial hydrate (localStorage + /auth/status) finished. */
  ready: boolean;
  /** Whether an account exists on the server (null while loading). */
  registered: boolean | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    // Hydrate token from localStorage and check whether an account exists.
    const t = localStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY);
    if (t) {
      setToken(t);
      setAuthToken(t);
    }
    if (u) setUsername(u);
    fetchAuthStatus()
      .then((s) => setRegistered(s.registered))
      .catch(() => setRegistered(null))
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((tok: string, user: string) => {
    setToken(tok);
    setUsername(user);
    setAuthToken(tok);
    setRegistered(true);
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(USER_KEY, user);
  }, []);

  const login = useCallback(
    async (u: string, p: string) => {
      const r = await apiLogin(u, p);
      persist(r.token, r.username);
    },
    [persist],
  );

  const register = useCallback(
    async (u: string, p: string) => {
      const r = await apiRegister(u, p);
      persist(r.token, r.username);
    },
    [persist],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUsername(null);
    setAuthToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, username, ready, registered, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
