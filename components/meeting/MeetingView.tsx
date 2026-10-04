'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PlaybackStore } from '@/lib/playback'
import type { MeetingBundle } from '@/lib/types'
import { ChaptersTab } from './ChaptersTab'
import { Player } from './Player'
import { SpeakerStrip } from './SpeakerStrip'
import { Tabs, type TabDef } from './Tabs'
import { Transcript } from './Transcript'

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

export type MeetingViewProps = {
  bundle: MeetingBundle
  userId: string | null
  liveAiEnabled: boolean
  initialMs: number
}

export function MeetingView({ bundle, initialMs }: MeetingViewProps) {
  const { meeting, participants, segments, chapters, highlights } = bundle
  const [store] = useState(() => new PlaybackStore(meeting.duration_sec * 1000, initialMs))
  useEffect(() => {
    store.seek(initialMs)
  }, [store, initialMs])

  const tabs: TabDef[] = [
    { id: 'chapters', label: 'Chapters', content: <ChaptersTab store={store} chapters={chapters} /> },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <Link href="/meetings" className="text-sm text-muted hover:text-fg">← My Calls</Link>
        <h1 className="mt-1 text-2xl font-semibold">{meeting.title}</h1>
        <p className="text-sm text-muted">
          {dateFormat.format(new Date(meeting.started_at))} UTC · {meeting.host?.name ?? 'Unknown host'} · {participants.length} participants
        </p>
      </header>
      <SpeakerStrip participants={participants} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Player store={store} participants={participants} segments={segments} chapters={chapters} highlights={highlights} />
          <Transcript store={store} segments={segments} participants={participants} highlights={highlights} />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Tabs tabs={tabs} />
        </aside>
      </div>
    </div>
  )
}
