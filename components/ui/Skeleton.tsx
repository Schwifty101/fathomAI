// Placeholder block for loading screens. Decorative: the loading screen's wrapper carries role="status".
// The shimmer comes from .animate-shimmer in globals.css, which prefers-reduced-motion already neutralises.
export function Skeleton({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={`animate-shimmer rounded-md ${className}`} {...props} />
}

// Wrapper every loading.tsx uses so assistive tech announces one "Loading <what>" and ignores the blocks.
export function LoadingRegion({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">Loading {label}</span>
      {children}
    </div>
  )
}
