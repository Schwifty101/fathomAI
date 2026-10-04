'use client'

import { Button } from '@/components/ui/Button'
import { formatMs, initials } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { PlaybackStore } from '@/lib/playback'
import type { ChapterRow, HighlightRow, ParticipantRow, SegmentRow } from '@/lib/types'
import { useActiveIdx, useClock, useMs, usePlaying, useSpeed } from './playback-hooks'
import { Scrubber } from './Scrubber'

const SPEEDS = [1, 1.5, 2]

type Props = {
  store: PlaybackStore
  participants: ParticipantRow[]
  segments: SegmentRow[]
  chapters: ChapterRow[]
  highlights: HighlightRow[]
  extra?: React.ReactNode
}

export function Player({ store, participants, segments, chapters, highlights, extra }: Props) {
  useClock(store)
  const ms = useMs(store)
  const playing = usePlaying(store)
  const speed = useSpeed(store)
  const active = useActiveIdx(store, segments)
  const segment = active >= 0 ? segments[active] : null
  const participantIndex = segment ? participants.findIndex((participant) => participant.id === segment.participant_id) : -1
  const person = participantIndex >= 0 ? participants[participantIndex] : null
  const chapter = [...chapters].reverse().find((item) => item.start_ms <= ms)

  return (
    <div className="space-y-3">
      <div className="relative grid min-h-44 place-items-center rounded-card border border-border bg-surface p-5 text-center">
        {chapter && <p className="absolute left-4 top-3 text-xs text-muted">{chapter.title}</p>}
        {person ? (
          <div className="max-w-xl space-y-2">
            <div
              className="mx-auto grid size-14 place-items-center rounded-full border-2 bg-surface-2 text-lg font-semibold"
              style={{ borderColor: laneColor(participantIndex) }}
            >
              {initials(person.name)}
            </div>
            <p className="text-sm font-medium">{person.name} <span className="text-muted">· {person.role}</span></p>
            <p className="text-balance text-muted" aria-live="off">{segment!.text}</p>
          </div>
        ) : (
          <p className="text-muted">Press play to start the recording.</p>
        )}
      </div>

      <Scrubber store={store} participants={participants} segments={segments} chapters={chapters} highlights={highlights} />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Back 10 seconds" onClick={() => store.skip(-10_000)}>-10s</Button>
        <Button size="sm" variant="primary" aria-label={playing ? 'Pause' : 'Play'} onClick={() => store.toggle()} className="w-20">
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button size="sm" variant="ghost" aria-label="Forward 10 seconds" onClick={() => store.skip(10_000)}>+10s</Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Playback speed ${speed}x`}
          onClick={() => store.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
        >
          {speed}x
        </Button>
        <span className="ml-1 text-sm tabular-nums text-muted">{formatMs(ms)} / {formatMs(store.durationMs)}</span>
        <div className="ml-auto flex items-center gap-2">{extra}</div>
      </div>
    </div>
  )
}
