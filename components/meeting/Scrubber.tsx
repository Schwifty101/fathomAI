'use client'

import { useMemo, useRef } from 'react'
import { formatMs } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import { msFromX, type PlaybackStore } from '@/lib/playback'
import { hlColor } from '@/lib/schema'
import type { ChapterRow, HighlightRow, ParticipantRow, SegmentRow } from '@/lib/types'
import { useMs } from './playback-hooks'

type Props = {
  store: PlaybackStore
  participants: ParticipantRow[]
  segments: SegmentRow[]
  chapters: ChapterRow[]
  highlights: HighlightRow[]
}

export function Scrubber({ store, participants, segments, chapters, highlights }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const ms = useMs(store)
  const duration = store.durationMs
  const percent = (value: number) => `${Math.min(100, (value / duration) * 100)}%`
  const lanes = useMemo(
    () => participants.map((participant) => segments.filter((segment) => segment.participant_id === participant.id)),
    [participants, segments],
  )
  const seekFrom = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect()
    store.seek(msFromX(clientX, rect.left, rect.width, duration))
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration / 1000)}
      aria-valuenow={Math.round(ms / 1000)}
      aria-valuetext={`${formatMs(ms)} of ${formatMs(duration)}`}
      className="relative cursor-pointer touch-none select-none rounded-lg border border-border bg-surface p-2 focus-visible:outline-2 focus-visible:outline-accent"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        seekFrom(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seekFrom(event.clientX)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') store.skip(5000)
        else if (event.key === 'ArrowLeft') store.skip(-5000)
        else return
        event.preventDefault()
      }}
    >
      <div ref={track}>
        <div className="relative h-3">
          {highlights.map((highlight) => (
            <span
              key={highlight.id}
              title={highlight.title}
              className="absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-sm"
              style={{ left: percent(highlight.start_ms), background: hlColor(highlight.type) }}
            />
          ))}
        </div>
        <div className="relative mt-1 space-y-0.5">
          {lanes.map((lane, index) => (
            <div key={participants[index].id} className="relative h-2 rounded-sm bg-surface-2">
              {lane.map((segment) => (
                <span
                  key={segment.idx}
                  className="absolute top-0 h-2 rounded-sm"
                  style={{
                    left: percent(segment.start_ms),
                    width: `max(2px, ${((segment.end_ms - segment.start_ms) / duration) * 100}%)`,
                    background: laneColor(index),
                  }}
                />
              ))}
            </div>
          ))}
          {chapters.map((chapter) => (
            <span
              key={chapter.start_ms}
              title={chapter.title}
              className="absolute inset-y-0 w-px bg-fg/30"
              style={{ left: percent(chapter.start_ms) }}
            />
          ))}
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-fg" style={{ left: percent(ms) }} />
        </div>
      </div>
    </div>
  )
}
