"use client";

// Detects a cold (sleeping) backend on load. Render's free tier spins the server
// down after ~15 min of inactivity, so the first request can take ~30-60s to wake
// it. We poll /health and expose a status the UI uses to show a "warming up" splash
// ONLY when the backend is actually slow — on a warm backend it never appears.
import { useEffect, useRef, useState } from "react";

import { checkHealth } from "@/lib/api";

export type WarmupStatus = "checking" | "warming" | "ready";

// Show the splash if the backend hasn't answered within this delay (ms).
const REVEAL_AFTER_MS = 2500;
// Per-probe timeout and the pause between retries (ms).
const PROBE_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 2000;

export function useBackendWarmup() {
  const [status, setStatus] = useState<WarmupStatus>("checking");
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    startRef.current = Date.now();

    // Reveal the splash only if the backend is still silent after a short delay.
    const revealTimer = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "ready" ? s : "warming"));
    }, REVEAL_AFTER_MS);

    // Tick a seconds counter while we wait (shown on the splash).
    const ticker = setInterval(() => {
      if (!cancelled) {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      }
    }, 1000);

    const finish = () => {
      clearTimeout(revealTimer);
      clearInterval(ticker);
      if (!cancelled) setStatus("ready");
    };

    // Poll /health until the server answers — the first hit wakes it from sleep.
    (async () => {
      while (!cancelled) {
        if (await checkHealth(PROBE_TIMEOUT_MS)) {
          finish();
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(revealTimer);
      clearInterval(ticker);
    };
  }, []);

  return { status, elapsed };
}
