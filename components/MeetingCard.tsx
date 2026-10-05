import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { tileSpansRow } from '@/lib/card-tiles'
import { formatMinutes, initials } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { MeetingListItem } from '@/lib/types'

const PLATFORM = { zoom: 'Zoom', meet: 'Google Meet', teams: 'Teams' } as const
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function MeetingCard({ m }: { m: MeetingListItem }) {
  const tiles = m.participants.slice(0, 4)
  return (
    <Link href={`/meetings/${m.slug}`} className="group block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <Card className="overflow-hidden transition group-hover:border-accent">
        <div className="relative grid aspect-video grid-cols-2 gap-px bg-border">
          {tiles.map((participant, index) => (
            <div
              key={participant.name}
              aria-hidden
              className={`grid place-items-center bg-surface-2 text-xl font-semibold ${tileSpansRow(tiles.length, index) ? 'col-span-2' : ''}`}
              style={{ color: laneColor(index) }}
            >
              {initials(participant.name)}
            </div>
          ))}
          <span className="absolute bottom-2 right-2 rounded bg-bg/85 px-2 py-0.5 text-xs">{formatMinutes(m.duration_sec)}</span>
        </div>
        <div className="space-y-1.5 p-3">
          <h3 className="truncate font-medium">{m.title}</h3>
          <p className="truncate text-sm text-muted">
            {PLATFORM[m.platform]} · {m.host?.name ?? 'Unknown host'} · {dateFormat.format(new Date(m.started_at))}
          </p>
          {m.highlight_sec > 0 && <Chip>{formatMinutes(m.highlight_sec)} of highlights</Chip>}
        </div>
      </Card>
    </Link>
  )
}
