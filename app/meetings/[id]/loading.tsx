import Link from 'next/link'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'

// Mirrors components/meeting/MeetingView.tsx with its data not yet arrived. Sizes follow the real
// components (Player, Scrubber, SpeakerStrip, HighlightPanel, Transcript, Tabs, SummaryTab) so nothing jumps.
// The speaker, lane and transcript counts are a guess, as the real counts come from the meeting.
const TABS = ['Summary', 'Action items', 'Chapters', 'Highlights', 'Ask']
const card = 'rounded-card border border-border bg-surface'

export default function MeetingLoading() {
  return (
    <LoadingRegion label="meeting">
      {/* Inner wrapper, so the sr-only line is not counted by space-y-6 and pushes the header down. */}
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <header>
          <Link href="/meetings" className="text-sm text-muted hover:text-fg">← My Calls</Link>
          <Skeleton className="mt-1 h-8 w-2/3 max-w-lg" />
          <Skeleton className="mt-1 h-5 w-80 max-w-full" />
        </header>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className={`${card} p-3`}>
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="mt-0.5 h-4 w-3/5" />
              <Skeleton className="mt-2 h-1.5 rounded-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <div className="space-y-3">
              <div className={`${card} grid min-h-44 place-items-center p-5`}>
                <Skeleton className="h-5 w-48 max-w-full" />
              </div>
              <div className="rounded-lg border border-border bg-surface p-2">
                <Skeleton className="h-3" />
                <div className="mt-1 space-y-0.5">
                  {[0, 1, 2].map((lane) => <Skeleton key={lane} className="h-2 rounded-sm" />)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-8 w-14 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-14 rounded-lg" />
                <Skeleton className="h-8 w-12 rounded-lg" />
                <Skeleton className="ml-1 h-5 w-24" />
                <Skeleton className="ml-auto h-8 w-32 rounded-lg" />
              </div>
            </div>

            <section aria-label="Highlight this moment" className={`${card} p-3`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Highlight this moment</h2>
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-10 rounded-lg" />)}
              </div>
              <Skeleton className="mt-2 h-9 rounded-lg" />
            </section>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-9 min-w-40 flex-1 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
              </div>
              <div className={`${card} max-h-[60vh] overflow-hidden`}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div key={index} className="flex gap-3 px-3 py-2">
                    <Skeleton className="mt-0.5 h-4 w-12 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-5" />
                      <Skeleton className="h-5 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <div className="flex gap-1 overflow-x-auto border-b border-border">
              {TABS.map((label, index) => (
                <span
                  key={label}
                  className={`whitespace-nowrap px-3 py-2 text-sm ${index === 0 ? 'border-b-2 border-accent text-fg' : 'text-muted'}`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="space-y-4 pt-4">
              <div className="flex flex-wrap gap-1">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
                <Skeleton className="h-7 w-16 rounded-full" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-8 w-14 rounded-lg" />
                <Skeleton className="h-8 w-36 rounded-lg" />
              </div>
              {[0, 1, 2].map((section) => (
                <section key={section}>
                  <Skeleton className="mb-1 h-5 w-1/3" />
                  <div className="space-y-1">
                    <Skeleton className="h-5" />
                    <Skeleton className="h-5 w-5/6" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </LoadingRegion>
  )
}
