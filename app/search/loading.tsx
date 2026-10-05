import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'

// The query is not readable here, so the heading stays neutral. Box sizes mirror app/search/page.tsx.
export default function SearchLoading() {
  return (
    <LoadingRegion label="search results" className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Skeleton className="h-7 w-56" />
      {[0, 1].map((group) => (
        <section key={group}>
          <Skeleton className="mb-2 h-6 w-64 max-w-full" />
          <div className="space-y-2">
            {[0, 1].map((row) => (
              <div key={row} className="rounded-lg border border-border bg-surface p-3">
                <Skeleton className="my-1 h-3 w-32" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </LoadingRegion>
  )
}
