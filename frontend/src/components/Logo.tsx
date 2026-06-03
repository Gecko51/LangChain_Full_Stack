// App logo — same design as the favicon (app/icon.svg): a violet→fuchsia rounded
// square with a white chat bubble and three dots. Rendered inline so it scales crisply.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Agent Playground logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="logo-gradient"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#D946EF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-gradient)" />
      <rect x="7.5" y="9" width="17" height="11.5" rx="3.5" fill="white" fillOpacity="0.95" />
      <path d="M11 20 v4 l4.2 -3.6 z" fill="white" fillOpacity="0.95" />
      <circle cx="12.5" cy="14.7" r="1.4" fill="#7C3AED" />
      <circle cx="16" cy="14.7" r="1.4" fill="#9333EA" />
      <circle cx="19.5" cy="14.7" r="1.4" fill="#C026D3" />
    </svg>
  );
}
