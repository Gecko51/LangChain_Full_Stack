import { cn } from "@/lib/utils";

// Each dot has its own gradient + colored glow, so the three together read as a
// violet → fuchsia → pink sweep while they bounce (keyframes in globals.css).
const DOTS = [
  { grad: "from-violet-500 to-purple-500", glow: "rgba(139, 92, 246, 0.7)" },
  { grad: "from-purple-500 to-fuchsia-500", glow: "rgba(192, 38, 211, 0.7)" },
  { grad: "from-fuchsia-500 to-pink-500", glow: "rgba(236, 72, 153, 0.7)" },
];

// Animated thinking indicator shown before the assistant's first token.
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-1">
      {DOTS.map((d, i) => (
        <span
          key={i}
          className={cn(
            "size-2 animate-[thinking-dot_0.9s_ease-in-out_infinite] rounded-full bg-gradient-to-br",
            d.grad,
          )}
          style={{ animationDelay: `${i * 0.16}s`, boxShadow: `0 0 10px ${d.glow}` }}
        />
      ))}
    </span>
  );
}
