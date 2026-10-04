import { Card } from '@/components/ui/Card'
import { formatMs } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { ParticipantRow } from '@/lib/types'

export function SpeakerStrip({ participants }: { participants: ParticipantRow[] }) {
  const total = participants.reduce((sum, participant) => sum + participant.talk_time_sec, 0) || 1
  return (
    <section aria-label="Speakers" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {participants.map((participant, index) => {
        const share = Math.round((participant.talk_time_sec / total) * 100)
        return (
          <Card key={participant.id} className="p-3">
            <p className="truncate text-sm font-medium">{participant.name}</p>
            <p className="truncate text-xs text-muted">{participant.role}</p>
            <div className="mt-2 h-1.5 rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${share}%`, background: laneColor(index) }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {share}% talk · {participant.questions} questions · longest {formatMs(participant.longest_monologue_sec * 1000)}
            </p>
          </Card>
        )
      })}
    </section>
  )
}
