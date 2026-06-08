// App logo — same design as the favicon (app/icon.svg): an apple-green rounded
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
          <stop stopColor="#C2E476" />
          <stop offset="1" stopColor="#22C55E" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-gradient)" />
      <rect x="7.5" y="9" width="17" height="11.5" rx="3.5" fill="white" fillOpacity="0.95" />
      <path d="M11 20 v4 l4.2 -3.6 z" fill="white" fillOpacity="0.95" />
      <circle cx="12.5" cy="14.7" r="1.4" fill="#65A30D" />
      <circle cx="16" cy="14.7" r="1.4" fill="#16A34A" />
      <circle cx="19.5" cy="14.7" r="1.4" fill="#0D9488" />
    </svg>
  );
}
