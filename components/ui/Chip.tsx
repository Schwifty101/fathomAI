export function Chip({ color, children, className = '' }: { color?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-fg ${className}`}>
      {color && <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  )
}
