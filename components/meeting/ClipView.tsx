'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Clip } from '@/lib/clip'
import { PlaybackStore } from '@/lib/playback'
import type { ParticipantRow, SegmentRow } from '@/lib/types'
import { Player } from './Player'
import { Transcript } from './Transcript'

export function ClipView({ clip }: { clip: Clip }) {
  const duration = clip.end_ms - clip.start_ms
  const { participants, segments } = useMemo(() => {
    const names = [...new Set(clip.segments.map((segment) => segment.speaker))]
    const participants: ParticipantRow[] = names.map((name) => ({
      id: name, name, role: '', is_internal: true,
      talk_time_sec: 0, questions: 0, longest_monologue_sec: 0,
    }))
    const segments: SegmentRow[] = clip.segments.map((segment, index) => ({
      idx: index,
      participant_id: segment.speaker,
      start_ms: Math.max(0, segment.start_ms - clip.start_ms),
      end_ms: Math.min(duration, segment.end_ms - clip.start_ms),
      text: segment.text,
    }))
    return { participants, segments }
  }, [clip, duration])
  const [store] = useState(() => new PlaybackStore(duration))

  useEffect(() => store.subscribe(() => {
    if (!store.playing && store.ms >= store.durationMs) {
      store.seek(0)
      store.play()
    }
  }), [store])

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header>
        <p className="text-sm text-muted">Shared clip</p>
        <h1 className="text-2xl font-semibold">{clip.title}</h1>
      </header>
      <Player store={store} participants={participants} segments={segments} chapters={[]} highlights={[]} />
      <Transcript store={store} segments={segments} participants={participants} highlights={[]} />
      <Link
        href={`/meetings/${clip.meeting_slug}?t=${clip.start_ms}`}
        className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        View the full meeting
      </Link>
    </div>
  )
}
