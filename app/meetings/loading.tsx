import { Card } from '@/components/ui/Card'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'

// Mirrors app/meetings/page.tsx. Block heights match the line heights of the real text so nothing jumps.
function CardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div aria-hidden className="aspect-video animate-shimmer" />
      <div className="space-y-1.5 p-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-[22px] w-36 rounded-full" />
      </div>
    </Card>
  )
}

export default function MeetingsLoading() {
  return (
    <LoadingRegion label="My Calls" className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <h1 className="mb-6 text-2xl font-semibold">My Calls</h1>
        <section className="mb-6 rounded-card border border-border p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Upcoming</h2>
          <div className="flex gap-3 overflow-hidden pb-1">
            {[0, 1].map((i) => (
              <Card key={i} className="min-w-56 shrink-0 space-y-1 p-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-48" />
              </Card>
            ))}
          </div>
        </section>
        <section className="mb-6 rounded-card border border-border p-4 sm:p-5">
          <Skeleton className="mb-4 h-7 w-36" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
          </div>
        </section>
      </div>
      <div className="flex w-full flex-col gap-3 rounded-card border border-border bg-surface p-4 lg:w-[360px] lg:self-start">
        <h2 className="text-sm font-semibold">Ask Fathom</h2>
        <div className="min-h-24 space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-14 rounded-lg" />
        </div>
      </div>
    </LoadingRegion>
  )
}
