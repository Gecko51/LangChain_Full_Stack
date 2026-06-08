"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { AgentConfig } from "@/components/AgentConfig";
import { AuthScreen } from "@/components/AuthScreen";
import { ChatInterface } from "@/components/ChatInterface";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { AgentConfigProvider } from "@/hooks/useAgentConfig";
import { useAuth } from "@/hooks/useAuth";
import { SettingsProvider } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

export default function Home() {
  const { token, ready, username, logout } = useAuth();
  // On small screens we show one panel at a time; lg shows both side by side.
  const [tab, setTab] = useState<"config" | "chat">("chat");

  // Avoid a flash of the login screen before the token is hydrated.
  if (!ready) {
    return (
      <div className="text-muted-foreground flex h-dvh items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  // Login gate: no token -> show the auth screen (register on first connection).
  if (!token) {
    return <AuthScreen />;
  }

  // Authenticated: mount the config/settings providers + the playground.
  return (
    <SettingsProvider>
      <AgentConfigProvider>
        <div className="relative flex h-dvh flex-col overflow-hidden">
          {/* Subtle violet glow behind everything. */}
          <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_45%_at_50%_0%,oklch(0.62_0.23_292/0.10),transparent)]" />

          {/* ---- Top bar ---- */}
          <header className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Logo className="size-7 rounded-md shadow-lg shadow-violet-500/40" />
              <h1 className="text-sm font-semibold">Agent Playground</h1>
              <span className="text-muted-foreground hidden text-xs sm:inline">
                · LangChain × OpenRouter
              </span>
            </div>
            <div className="flex items-center gap-1">
              {username ? (
                <span className="text-muted-foreground hidden px-1 text-xs sm:inline">
                  {username}
                </span>
              ) : null}
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={logout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>

          {/* ---- Mobile tab switch (hidden on lg) ---- */}
          <div className="flex border-b lg:hidden">
            {(["config", "chat"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium capitalize transition-colors",
                  tab === t
                    ? "border-primary text-foreground border-b-2"
                    : "text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* ---- Panels: config 1/3 · chat 2/3 on lg; one at a time on mobile ---- */}
          <main className="grid min-h-0 flex-1 grid-rows-1 grid-cols-1 lg:grid-cols-3">
            <aside
              className={cn(
                "min-h-0 overflow-hidden lg:col-span-1 lg:block lg:border-r",
                tab === "config" ? "block" : "hidden",
              )}
            >
              <AgentConfig />
            </aside>
            <section
              className={cn(
                "min-h-0 overflow-hidden lg:col-span-2 lg:block",
                tab === "chat" ? "block" : "hidden",
              )}
            >
              <ChatInterface />
            </section>
          </main>
        </div>
      </AgentConfigProvider>
    </SettingsProvider>
  );
}
