'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatMs } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { PlaybackStore } from '@/lib/playback'
import { hlColor } from '@/lib/schema'
import type { HighlightRow, ParticipantRow, SegmentRow } from '@/lib/types'
import { useActiveIdx } from './playback-hooks'

function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0
  for (let at = lowerText.indexOf(lowerQuery, from); at >= 0; at = lowerText.indexOf(lowerQuery, from)) {
    parts.push(<Fragment key={`text-${from}`}>{text.slice(from, at)}</Fragment>)
    parts.push(<mark key={`mark-${at}`} className="rounded bg-accent/30 text-fg">{text.slice(at, at + query.length)}</mark>)
    from = at + query.length
  }
  parts.push(<Fragment key={`text-${from}`}>{text.slice(from)}</Fragment>)
  return <>{parts}</>
}

type Props = {
  store: PlaybackStore
  segments: SegmentRow[]
  participants: ParticipantRow[]
  highlights: HighlightRow[]
  toolbar?: React.ReactNode
  onShare?: (startMs: number, endMs: number) => void
}

export function Transcript({ store, segments, participants, highlights, toolbar, onShare }: Props) {
  const active = useActiveIdx(store, segments)
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const [speaker, setSpeaker] = useState('all')
  const [selection, setSelection] = useState<{ a: number; b: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const who = useMemo(() => new Map(participants.map((participant, index) => [participant.id, { participant, index }])), [participants])
  const filtering = query !== '' || speaker !== 'all'

  const rows = useMemo(() => {
    const lowerQuery = query.toLowerCase()
    return segments.filter((segment) =>
      (speaker === 'all' || segment.participant_id === speaker) &&
      (!lowerQuery || segment.text.toLowerCase().includes(lowerQuery)),
    )
  }, [segments, query, speaker])

  const highlightOf = useMemo(() => {
    const matches = new Map<number, HighlightRow>()
    for (const highlight of highlights) {
      for (const segment of segments) {
        if (segment.start_ms < highlight.end_ms && segment.end_ms > highlight.start_ms) {
          matches.set(segment.idx, highlight)
        }
      }
    }
    return matches
  }, [highlights, segments])

  const scrollToActive = useCallback(() => {
    const row = box.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    if (row && box.current) {
      box.current.scrollTo({ top: row.offsetTop - box.current.clientHeight / 3, behavior: 'smooth' })
    }
  }, [active])

  useEffect(() => {
    if (follow && !filtering && active >= 0) scrollToActive()
  }, [active, follow, filtering, scrollToActive])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this transcript"
          aria-label="Search this transcript"
          className="h-9 min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-muted"
        />
        <select
          value={speaker}
          onChange={(event) => setSpeaker(event.target.value)}
          aria-label="Filter by speaker"
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
        >
          <option value="all">All speakers</option>
          {participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}
        </select>
        {toolbar}
        {onShare && selection && (
          <Button size="sm" variant="secondary" onClick={() => {
            onShare(segments[selection.a].start_ms, segments[selection.b].end_ms)
            setSelection(null)
          }}>
            Share selection
          </Button>
        )}
      </div>
      <div className="relative">
        <div
          ref={box}
          onWheel={() => setFollow(false)}
          onTouchMove={() => setFollow(false)}
          onMouseUp={() => {
            const selected = window.getSelection()
            if (!selected || selected.isCollapsed) return setSelection(null)
            const indexOf = (node: Node | null) => {
              const element = (node instanceof Element ? node : node?.parentElement)?.closest('[data-idx]')
              return element ? Number(element.getAttribute('data-idx')) : null
            }
            const a = indexOf(selected.anchorNode)
            const b = indexOf(selected.focusNode)
            setSelection(a === null || b === null ? null : { a: Math.min(a, b), b: Math.max(a, b) })
          }}
          className="relative max-h-[60vh] overflow-y-auto rounded-card border border-border bg-surface"
        >
          {rows.length === 0 && <p className="p-4 text-sm text-muted">No lines match.</p>}
          {rows.map((segment) => {
            const speakerInfo = who.get(segment.participant_id)
            const highlight = highlightOf.get(segment.idx)
            return (
              <button
                key={segment.idx}
                type="button"
                data-idx={segment.idx}
                onClick={() => {
                  if (window.getSelection()?.isCollapsed === false) return
                  store.seek(segment.start_ms)
                }}
                aria-current={active === segment.idx ? 'true' : undefined}
                className={`tr-row flex w-full select-text gap-3 border-l-4 px-3 py-2 text-left text-sm transition hover:bg-surface-2 ${active === segment.idx ? 'bg-surface-2' : ''}`}
                style={{ borderLeftColor: highlight ? hlColor(highlight.type) : 'transparent' }}
              >
                <span className="w-12 shrink-0 tabular-nums text-muted">{formatMs(segment.start_ms)}</span>
                <span className="min-w-0">
                  <span className="block font-medium" style={{ color: laneColor(speakerInfo?.index ?? 0) }}>
                    {speakerInfo?.participant.name ?? 'Unknown'}
                  </span>
                  <span className="block"><Marked text={segment.text} query={query} /></span>
                </span>
              </button>
            )
          })}
        </div>
        {!follow && !filtering && (
          <Button size="sm" variant="primary" className="absolute bottom-3 right-3 shadow-lg" onClick={() => { setFollow(true); scrollToActive() }}>
            Jump to live
          </Button>
        )}
      </div>
    </div>
  )
}
