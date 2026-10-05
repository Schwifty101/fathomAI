'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { createHighlight, createShare, deleteHighlight, deleteShare } from '@/app/meetings/[id]/actions'
import { AskPanel } from '@/components/AskPanel'
import { SignInDialog } from '@/components/SignInDialog'
import { Button } from '@/components/ui/Button'
import { byoRequestHeaders, useByoKey } from '@/lib/byo-key-store'
import { planHighlight } from '@/lib/highlight'
import { PlaybackStore } from '@/lib/playback'
import type { HighlightType, SummaryContent, Template } from '@/lib/schema'
import { expandToRun, findActiveIdx } from '@/lib/speaker-runs'
import { toast } from '@/lib/toast'
import type { HighlightRow, MeetingBundle, ShareRow } from '@/lib/types'
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
  shares: ShareRow[]
}

export function MeetingView({ bundle, userId, liveAiEnabled, initialMs, shares: initialShares }: MeetingViewProps) {
  const { meeting, participants, segments, chapters } = bundle
  const hasOwnKey = useByoKey() !== null
  const [store] = useState(() => new PlaybackStore(meeting.duration_sec * 1000, initialMs))
  const [highlights, setHighlights] = useState<HighlightRow[]>(bundle.highlights)
  const [shares, setShares] = useState<ShareRow[]>(initialShares)
  const [signIn, setSignIn] = useState<string | null>(null)
  useEffect(() => {
    store.seek(initialMs)
  }, [store, initialMs])

  // Resolves true only when the highlight was saved (the note box clears on success only).
  const addHighlight = useCallback(async (type: HighlightType, note: string | null): Promise<boolean> => {
    const index = findActiveIdx(segments, store.ms)
    const plan = planHighlight(userId, segments, index, type, note)
    if (plan.kind === 'sign-in') {
      setSignIn('Sign in with Google to save highlights. You will come back to this moment.')
      return false
    }
    if (plan.kind === 'no-segment') return false
    const draft = plan.draft
    const temporary: HighlightRow = { id: `tmp-${crypto.randomUUID()}`, user_id: userId, ...draft }
    setHighlights((current) => [...current, temporary].sort(byStart))
    try {
      const result = await createHighlight({ meetingSlug: meeting.slug, segmentIdx: index, type, note })
      if (!result.ok) throw new Error(result.error)
      setHighlights((current) => current.map((highlight) =>
        highlight.id === temporary.id ? result.highlight : highlight,
      ).sort(byStart))
      return true
    } catch {
      setHighlights((current) => current.filter((highlight) => highlight.id !== temporary.id))
      toast('Could not save the highlight')
      return false
    }
  }, [userId, segments, store, meeting.slug])

  const removeHighlight = useCallback(async (id: string) => {
    const removed = highlights.find((highlight) => highlight.id === id)
    setHighlights((current) => current.filter((highlight) => highlight.id !== id))
    let ok = false
    try {
      ok = (await deleteHighlight(id)).ok
    } catch {}
    if (!ok && removed) {
      setHighlights((current) => [...current, removed].sort(byStart))
      toast('Could not delete the highlight')
    }
  }, [highlights])

  const shareWindow = useCallback(async (start_ms: number, end_ms: number) => {
    if (!userId) {
      setSignIn('Sign in with Google to share clips.')
      return
    }
    let result: Awaited<ReturnType<typeof createShare>>
    try {
      result = await createShare({ meetingSlug: meeting.slug, start_ms, end_ms })
    } catch {
      toast('Could not create the clip link')
      return
    }
    if (!result.ok) {
      toast(result.error === 'limit' ? 'Daily clip limit reached (20)' : 'Could not create the clip link')
      return
    }
    setShares((current) => [result.share, ...current])
    try {
      await navigator.clipboard.writeText(`${location.origin}${result.path}`)
      toast('Clip link copied')
    } catch {
      toast(`Clip link: ${location.origin}${result.path}`)
    }
  }, [userId, meeting.slug])

  const shareMoment = () => {
    if (!userId) {
      setSignIn('Sign in with Google to share clips.')
      return
    }
    const run = expandToRun(segments, findActiveIdx(segments, store.ms))
    if (run) shareWindow(run.start_ms, run.end_ms)
  }

  const removeShare = async (slug: string) => {
    const removed = shares.find((share) => share.slug === slug)
    setShares((current) => current.filter((share) => share.slug !== slug))
    let ok = false
    try {
      ok = (await deleteShare(slug)).ok
    } catch {}
    if (!ok) {
      if (removed) setShares((current) => [removed, ...current])
      toast('Could not delete the link')
    }
  }

  // Throws an Error whose message is safe to toast (SummaryTab shows it).
  const regenerateSummary = async (template: Template): Promise<SummaryContent> => {
    let response: Response
    try {
      response = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...byoRequestHeaders() },
        body: JSON.stringify({ meetingSlug: meeting.slug, template }),
      })
    } catch {
      throw new Error('Could not reach the server. Try again.')
    }
    const json = await response.json().catch(() => null)
    if (response.status === 401) setSignIn('Sign in with Google to regenerate summaries with AI.')
    if (!response.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Could not regenerate the summary')
    if (!Array.isArray(json?.content?.sections)) throw new Error('Could not regenerate the summary')
    return json.content as SummaryContent
  }

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
    {
      id: 'summary',
      label: 'Summary',
      content: (
        <SummaryTab
          title={meeting.title}
          summaries={bundle.summaries}
          regen={{
            enabled: liveAiEnabled || hasOwnKey, // server key presence is decided server-side and never reaches the client; a visitor's own key is theirs
            signedIn: userId !== null,
            onNeedSignIn: () => setSignIn('Sign in with Google to regenerate summaries with AI.'),
            run: regenerateSummary,
          }}
        />
      ),
    },
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
        <div className="space-y-6">
          <HighlightsTab
            store={store}
            segments={segments}
            highlights={highlights}
            userId={userId}
            onDelete={removeHighlight}
            onShare={(highlight) => shareWindow(highlight.start_ms, highlight.end_ms)}
          />
          {shares.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Your shared clips</h3>
              <ul className="space-y-1 text-sm">
                {shares.map((share) => (
                  <li key={share.slug} className="flex items-center justify-between gap-2">
                    <a className="truncate text-accent underline" href={`/clip/${share.slug}`}>/clip/{share.slug}</a>
                    <Button size="sm" variant="ghost" onClick={() => removeShare(share.slug)}>Delete</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ),
    },
    {
      id: 'ask',
      label: 'Ask',
      content: <AskPanel embedded scopes={[{ value: `meeting:${meeting.slug}`, label: 'This meeting' }]} defaultScope={`meeting:${meeting.slug}`} prompts={[]} />,
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
          <Player
            store={store}
            participants={participants}
            segments={segments}
            chapters={chapters}
            highlights={highlights}
            extra={<Button size="sm" variant="secondary" onClick={shareMoment}>Share moment</Button>}
          />
          <HighlightPanel highlights={highlights} signedIn={userId !== null} onAdd={addHighlight} />
          <Transcript store={store} segments={segments} participants={participants} highlights={highlights} onShare={shareWindow} />
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
