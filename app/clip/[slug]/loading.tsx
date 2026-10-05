import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'

// Mirrors ClipView: header, player surface, scrubber, controls, transcript box, actions.
// The title is data, so it stays a block (no empty h1).
export default function ClipLoading() {
  return (
    <LoadingRegion label="shared clip" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header>
        <p className="text-sm text-muted">Shared clip</p>
        <Skeleton className="h-8 w-3/5 max-w-sm" />
      </header>

      <div className="space-y-3">
        <Skeleton className="min-h-44 rounded-card border border-border" />
        <div className="rounded-lg border border-border bg-surface p-2">
          <Skeleton className="h-3 rounded-sm" />
          <div className="mt-1 space-y-0.5">
            <Skeleton className="h-2 rounded-sm" />
            <Skeleton className="h-2 rounded-sm" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-14 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-14 rounded-lg" />
          <Skeleton className="h-8 w-10 rounded-lg" />
          <Skeleton className="ml-1 h-4 w-24" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 min-w-40 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="rounded-card border border-border bg-surface">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex gap-3 border-l-4 border-transparent px-3 py-2">
              <Skeleton className="my-0.5 h-4 w-12 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="my-0.5 h-4 w-24" />
                <Skeleton className="my-0.5 h-4 w-full" />
                <Skeleton className="my-0.5 h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-10 w-80 max-w-full rounded-lg" />
      </div>
    </LoadingRegion>
  )
}
