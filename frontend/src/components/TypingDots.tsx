// Three bouncing dots shown while the assistant is thinking (before first token).
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/70 size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
