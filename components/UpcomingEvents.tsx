import { Card } from '@/components/ui/Card'
import type { UpcomingEvent } from '@/lib/types'

const timeFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) return null
  return (
    <section aria-label="Upcoming meetings" className="mb-8">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Upcoming</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {events.map((event) => (
          <Card key={event.id} className="min-w-56 shrink-0 p-3">
            <p className="truncate text-sm font-medium">{event.title}</p>
            <p className="text-xs text-muted">{timeFormat.format(new Date(event.starts_at))} UTC · Notetaker will join</p>
          </Card>
        ))}
      </div>
    </section>
  )
}
