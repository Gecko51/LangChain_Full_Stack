import { cn } from "@/lib/utils";

// Each dot has its own gradient + colored glow, so the three together read as an
// apple-green → emerald → teal sweep while they bounce (keyframes in globals.css).
const DOTS = [
  { grad: "from-lime-300 to-lime-400", glow: "rgba(163, 230, 53, 0.7)" },
  { grad: "from-lime-400 to-emerald-400", glow: "rgba(52, 211, 153, 0.7)" },
  { grad: "from-emerald-400 to-teal-400", glow: "rgba(45, 212, 191, 0.7)" },
];

// Animated thinking indicator shown before the assistant's first token.
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-1">
      {DOTS.map((d, i) => (
        <span
          key={i}
          className={cn(
            "thinking-dot size-2 rounded-full bg-gradient-to-br",
            d.grad,
          )}
          style={{ animationDelay: `${i * 0.16}s`, boxShadow: `0 0 10px ${d.glow}` }}
        />
      ))}
    </span>
  );
}
