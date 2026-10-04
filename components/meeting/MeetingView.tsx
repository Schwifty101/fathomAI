'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { createHighlight, deleteHighlight } from '@/app/meetings/[id]/actions'
import { SignInDialog } from '@/components/SignInDialog'
import { buildHighlight } from '@/lib/highlight'
import { PlaybackStore } from '@/lib/playback'
import type { HighlightType } from '@/lib/schema'
import { findActiveIdx } from '@/lib/speaker-runs'
import { toast } from '@/lib/toast'
import type { HighlightRow, MeetingBundle } from '@/lib/types'
import { ActionItemsTab } from './ActionItemsTab'
import { ChaptersTab } from './ChaptersTab'
import { HighlightPanel } from './HighlightPanel'
import { HighlightsTab } from './HighlightsTab'
import { Player } from './Player'
import { SpeakerStrip } from './SpeakerStrip'
import { SummaryTab } from './SummaryTab'
import { Tabs, type TabDef } from './Tabs'
import { Transcript } from './Transcript'

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
const byStart = (a: HighlightRow, b: HighlightRow) => a.start_ms - b.start_ms

export type MeetingViewProps = {
  bundle: MeetingBundle
  userId: string | null
  liveAiEnabled: boolean
  initialMs: number
}

export function MeetingView({ bundle, userId, initialMs }: MeetingViewProps) {
  const { meeting, participants, segments, chapters } = bundle
  const [store] = useState(() => new PlaybackStore(meeting.duration_sec * 1000, initialMs))
  const [highlights, setHighlights] = useState<HighlightRow[]>(bundle.highlights)
  const [signIn, setSignIn] = useState<string | null>(null)
  useEffect(() => {
    store.seek(initialMs)
  }, [store, initialMs])

  const addHighlight = useCallback(async (type: HighlightType, note: string | null) => {
    const index = findActiveIdx(segments, store.ms)
    const draft = buildHighlight(segments, index, type, note)
    if (!draft) return
    if (!userId) {
      setSignIn('Sign in with Google to save highlights. You will come back to this moment.')
      return
    }
    const temporary: HighlightRow = { id: `tmp-${crypto.randomUUID()}`, user_id: userId, ...draft }
    setHighlights((current) => [...current, temporary].sort(byStart))
    const result = await createHighlight({ meetingSlug: meeting.slug, segmentIdx: index, type, note })
    if (result.ok) {
      setHighlights((current) => current.map((highlight) =>
        highlight.id === temporary.id ? result.highlight : highlight,
      ).sort(byStart))
    } else {
      setHighlights((current) => current.filter((highlight) => highlight.id !== temporary.id))
      toast('Could not save the highlight')
    }
  }, [userId, segments, store, meeting.slug])

  const removeHighlight = useCallback(async (id: string) => {
    const removed = highlights.find((highlight) => highlight.id === id)
    setHighlights((current) => current.filter((highlight) => highlight.id !== id))
    const result = await deleteHighlight(id)
    if (!result.ok && removed) {
      setHighlights((current) => [...current, removed].sort(byStart))
      toast('Could not delete the highlight')
    }
  }, [highlights])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'h') return
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      addHighlight('insight', null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addHighlight])

  const tabs: TabDef[] = [
    { id: 'summary', label: 'Summary', content: <SummaryTab title={meeting.title} summaries={bundle.summaries} /> },
    {
      id: 'actions',
      label: 'Action items',
      content: (
        <ActionItemsTab
          store={store}
          items={bundle.actionItems}
          ownHighlights={highlights.filter((highlight) => highlight.type === 'action_item' && highlight.user_id === userId)}
        />
      ),
    },
    { id: 'chapters', label: 'Chapters', content: <ChaptersTab store={store} chapters={chapters} /> },
    {
      id: 'highlights',
      label: `Highlights (${highlights.length})`,
      content: (
        <HighlightsTab
          store={store}
          segments={segments}
          highlights={highlights}
          userId={userId}
          onDelete={removeHighlight}
        />
      ),
    },
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
          <HighlightPanel highlights={highlights} signedIn={userId !== null} onAdd={addHighlight} />
          <Transcript store={store} segments={segments} participants={participants} highlights={highlights} />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Tabs tabs={tabs} />
        </aside>
      </div>
      <SignInDialog
        open={signIn !== null}
        onClose={() => setSignIn(null)}
        message={signIn ?? ''}
        next={() => `/meetings/${meeting.slug}?t=${Math.round(store.ms)}`}
      />
    </div>
  )
}
