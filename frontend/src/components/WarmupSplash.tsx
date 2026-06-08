"use client";

// Full-screen splash shown only while the (free-tier) Render backend is waking
// from sleep. It explains the wait instead of leaving the user on a silent spinner,
// and disappears automatically once the server answers (see useBackendWarmup). If it
// drags on (e.g. the server is mid-redeploy), it offers a manual reload so the user
// is never stuck without an action.
import { RefreshCw } from "lucide-react";

import { Logo } from "@/components/Logo";
import { TypingDots } from "@/components/TypingDots";
import { Button } from "@/components/ui/button";

export function WarmupSplash({ elapsed }: { elapsed: number }) {
  // A normal cold start is ~50s; past that, reassure + offer a manual reload.
  const takingLong = elapsed >= 45;

  return (
    <div className="bg-background fixed inset-0 z-50 flex items-center justify-center">
      {/* Apple-green glow, matching the auth screen. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_40%_at_50%_35%,oklch(0.84_0.16_124/0.14),transparent)]" />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 px-6 text-center">
        <Logo className="size-16 animate-pulse rounded-2xl shadow-lg shadow-lime-400/40" />

        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Waking up the server…</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The free server sleeps after 15&nbsp;minutes of inactivity. This first
            request wakes it up — it usually takes about a minute, and won&apos;t
            happen again while you keep using the app.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <TypingDots />
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {elapsed}s
          </span>
        </div>

        {takingLong ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-muted-foreground/70 text-xs leading-relaxed">
              This is taking longer than usual — the server may be restarting.
              It will load on its own, or you can retry.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-3" />
              Reload
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
