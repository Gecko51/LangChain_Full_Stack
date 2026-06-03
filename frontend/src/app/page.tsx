import { AgentConfig } from "@/components/AgentConfig";
import { ChatInterface } from "@/components/ChatInterface";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {/* Subtle violet glow behind everything. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_45%_at_50%_0%,oklch(0.62_0.23_292/0.10),transparent)]" />

      {/* ---- Top bar ---- */}
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40" />
          <h1 className="text-sm font-semibold">Agent Playground</h1>
          <span className="text-muted-foreground hidden text-xs sm:inline">
            · LangChain × OpenRouter
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* ---- Two columns: config (1/3) · chat (2/3) ---- */}
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        <aside className="min-h-0 overflow-hidden border-b lg:col-span-1 lg:border-r lg:border-b-0">
          <AgentConfig />
        </aside>
        <section className="min-h-0 overflow-hidden lg:col-span-2">
          <ChatInterface />
        </section>
      </main>
    </div>
  );
}
