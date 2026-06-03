"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes only knows the real theme on the client; wait for mount to
  // avoid a hydration mismatch on the icon.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="size-9" aria-label="Toggle theme" />
    );
  }

  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
