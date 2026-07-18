// Premium blue verification checkmark, shown for Owner/Admin accounts.
// Purely presentational — it renders only when the server reports verified.
export function Verified({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={`verified-badge${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label="Verified"
      role="img"
    >
      {/* scalloped seal */}
      <path
        fill="url(#vb-grad)"
        d="M12 1.6l2.35 1.86 2.98-.28 1.16 2.76 2.62 1.46-.6 2.94 1.53 2.58-2.13 2.09.16 2.99-2.84.94-1.53 2.58-2.84-.94L12 22.4l-2.02-2.27-2.84.94-1.53-2.58-2.84-.94.16-2.99L.8 12.48l1.53-2.58-.6-2.94 2.62-1.46 1.16-2.76 2.98.28z"
      />
      <path
        fill="#fff"
        d="M10.6 15.7l-3-3a.9.9 0 011.27-1.27l1.73 1.73 3.8-3.8a.9.9 0 111.27 1.27l-4.43 4.43a.9.9 0 01-1.27 0z"
      />
      <defs>
        <linearGradient id="vb-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B9DFF" />
          <stop offset="1" stopColor="#1178E8" />
        </linearGradient>
      </defs>
    </svg>
  )
}
