import { useId } from 'react'

// The Open Loop — Libera brand mark. `animate` draws the loop on mount.
export function Logo({ size = 96, animate = false, mono = false }: { size?: number; animate?: boolean; mono?: boolean }) {
  const id = useId()
  const stroke = mono ? 'currentColor' : `url(#${id})`
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" className={animate ? 'logo-animate' : undefined} aria-label="Libera">
      {!mono && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
      )}
      <circle
        className="logo-loop"
        cx="128" cy="128" r="76"
        fill="none" stroke={stroke} strokeWidth="30" strokeLinecap="round"
        strokeDasharray="404.6 73" transform="rotate(162.4 128 128)"
      />
      <circle className="logo-dot" cx="57.3" cy="198.7" r="15" fill={mono ? 'currentColor' : stroke} />
    </svg>
  )
}
