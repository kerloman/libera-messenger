import type { ReactNode } from 'react'

// iOS-style glass bottom sheet
export function Sheet({ onClose, children, title }: { onClose: () => void; children: ReactNode; title?: string }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet glass" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}
