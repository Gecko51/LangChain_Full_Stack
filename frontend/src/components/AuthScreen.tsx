"use client";

import { Loader2, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export function AuthScreen() {
  const { registered, login, register } = useAuth();
  // No account yet -> first connection (register); otherwise log in.
  const isRegister = registered === false;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      {/* Violet glow background */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.62_0.23_292/0.12),transparent)]" />

      <form
        onSubmit={submit}
        className="bg-card w-full max-w-sm space-y-4 rounded-2xl border p-6 shadow-xl"
      >
        <div className="flex items-center gap-2">
          <Logo className="size-8 rounded-md shadow-lg shadow-violet-500/40" />
          <div>
            <h1 className="text-sm font-semibold">Agent Playground</h1>
            <p className="text-muted-foreground text-xs">LangChain × OpenRouter</p>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {isRegister ? "Create your account" : "Welcome back"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isRegister
              ? "Set a username and password — this is your first connection."
              : "Log in to access the playground."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="auth-username">Username</Label>
          <Input
            id="auth-username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your-username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? "at least 6 characters" : "••••••••"}
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={busy || !username.trim() || !password}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isRegister ? (
            <UserPlus className="size-4" />
          ) : (
            <LogIn className="size-4" />
          )}
          {isRegister ? "Create account" : "Log in"}
        </Button>
      </form>
    </div>
  );
}
