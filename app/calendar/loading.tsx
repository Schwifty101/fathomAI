import { Card } from '@/components/ui/Card'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'

// Shaped like CalendarConnect's demo mode (intro card, then a list of event cards). The connected view is close enough:
// the page cannot tell which one it is until it has checked Google, so the Connect button and the form stay as blocks.
export default function CalendarLoading() {
  return (
    <LoadingRegion label="calendar" className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <div className="space-y-6">
        <Card className="space-y-3 p-4 sm:p-6">
          <Skeleton className="h-7 w-2/3 sm:w-1/2" />
          <div className="space-y-1 py-0.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg sm:w-52" />
        </Card>
        <div className="space-y-3">
          <Skeleton className="my-0.5 h-4 w-28" />
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="my-0.5 h-5 w-3/5" />
              <Skeleton className="my-0.5 h-4 w-2/5" />
            </Card>
          ))}
        </div>
      </div>
    </LoadingRegion>
  )
}
