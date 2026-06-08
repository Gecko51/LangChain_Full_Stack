"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AgentConfig } from "@/components/AgentConfig";
import { AuthScreen } from "@/components/AuthScreen";
import { ChatInterface } from "@/components/ChatInterface";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WarmupSplash } from "@/components/WarmupSplash";
import { Button } from "@/components/ui/button";
import { AgentConfigProvider } from "@/hooks/useAgentConfig";
import { useAuth } from "@/hooks/useAuth";
import { useBackendWarmup } from "@/hooks/useBackendWarmup";
import { ChatArchivesProvider } from "@/hooks/useChatArchives";
import { SettingsProvider } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

export default function Home() {
  const { token, ready, username, logout } = useAuth();
  // Detects a cold (sleeping) Render backend so we can show a warming splash.
  const warmup = useBackendWarmup();
  // On small screens we show one panel at a time; lg shows both side by side.
  const [tab, setTab] = useState<"config" | "chat">("chat");

  // ----- Resizable split between the config and chat panels (lg only) -----
  const [configPct, setConfigPct] = useState(33); // config panel width, in %
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Restore the saved split on mount.
  useEffect(() => {
    const saved = Number(localStorage.getItem("agentpg_config_pct"));
    if (saved >= 20 && saved <= 60) setConfigPct(saved);
  }, []);

  // Persist the split whenever it changes.
  useEffect(() => {
    localStorage.setItem("agentpg_config_pct", String(Math.round(configPct)));
  }, [configPct]);

  // While dragging, update the split from the pointer's X position.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const el = mainRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setConfigPct(Math.min(60, Math.max(20, pct))); // clamp 20%–60%
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Keep the resize cursor and suppress text selection during the drag.
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging]);

  // While the free-tier backend wakes from sleep, show a friendly splash. It only
  // appears when the server is actually cold; a warm load skips straight past it.
  if (warmup.status === "warming") {
    return <WarmupSplash elapsed={warmup.elapsed} />;
  }

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
        <ChatArchivesProvider>
          <div className="relative flex h-dvh flex-col overflow-hidden">
          {/* Subtle apple-green glow behind everything. */}
          <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_45%_at_50%_0%,oklch(0.84_0.16_124/0.12),transparent)]" />

          {/* ---- Top bar ---- */}
          <header className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Logo className="size-7 rounded-md shadow-lg shadow-lime-400/40" />
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

          {/* ---- Panels: resizable config | chat on lg; one at a time on mobile ---- */}
          <main ref={mainRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside
              style={{ "--config-w": `${configPct}%` } as React.CSSProperties}
              className={cn(
                "min-h-0 w-full shrink-0 overflow-hidden lg:block lg:w-[var(--config-w)]",
                tab === "config" ? "block" : "hidden",
              )}
            >
              <AgentConfig />
            </aside>

            {/* Drag-to-resize divider — handle appears on hover (lg only). */}
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDoubleClick={() => setConfigPct(33)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels (double-click to reset)"
              title="Drag to resize · double-click to reset"
              className="group relative z-10 hidden w-2 shrink-0 touch-none cursor-col-resize lg:-mx-1 lg:flex lg:items-center lg:justify-center"
            >
              {/* Separator line — apple green on hover/drag. */}
              <div
                className={cn(
                  "h-full w-px transition-colors",
                  dragging ? "bg-primary" : "bg-border group-hover:bg-primary/70",
                )}
              />
              {/* Grip pill — fades in on hover, solid while dragging. */}
              <div
                className={cn(
                  "absolute h-10 w-1 rounded-full transition-opacity",
                  dragging
                    ? "bg-primary opacity-100"
                    : "bg-primary opacity-0 group-hover:opacity-100",
                )}
              />
            </div>

            <section
              className={cn(
                "min-h-0 w-full overflow-hidden lg:block lg:min-w-0 lg:flex-1",
                tab === "chat" ? "block" : "hidden",
              )}
            >
              <ChatInterface />
            </section>
          </main>
          </div>
        </ChatArchivesProvider>
      </AgentConfigProvider>
    </SettingsProvider>
  );
}
