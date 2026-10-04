'use client'

import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { formatMs } from '@/lib/format'
import type { PlaybackStore } from '@/lib/playback'
import { HIGHLIGHT_META, hlColor } from '@/lib/schema'
import type { HighlightRow, SegmentRow } from '@/lib/types'

const excerpt = (segments: SegmentRow[], highlight: HighlightRow) =>
  segments.filter((segment) => segment.start_ms < highlight.end_ms && segment.end_ms > highlight.start_ms)
    .map((segment) => segment.text).join(' ').slice(0, 220)

export function HighlightsTab({
  store,
  segments,
  highlights,
  userId,
  onDelete,
  onShare,
}: {
  store: PlaybackStore
  segments: SegmentRow[]
  highlights: HighlightRow[]
  userId: string | null
  onDelete: (id: string) => void
  onShare?: (highlight: HighlightRow) => void
}) {
  if (highlights.length === 0) return <p className="text-muted">No highlights yet. Press a type button while the call plays.</p>
  return (
    <ul className="space-y-3">
      {highlights.map((highlight) => {
        const own = userId !== null && highlight.user_id === userId
        return (
          <li key={highlight.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Chip color={hlColor(highlight.type)}>{HIGHLIGHT_META[highlight.type].label}</Chip>
              <span className="tabular-nums text-xs text-muted">{formatMs(highlight.start_ms)}–{formatMs(highlight.end_ms)}</span>
              {!own && <span className="text-xs text-muted">Demo</span>}
            </div>
            <p className="mt-2 font-medium">{highlight.title}</p>
            <p className="mt-1 text-muted">{excerpt(segments, highlight)}</p>
            <div className="mt-2 flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => store.seek(highlight.start_ms)}>Jump</Button>
              {onShare && <Button size="sm" variant="ghost" onClick={() => onShare(highlight)}>Share clip</Button>}
              {own && <Button size="sm" variant="ghost" onClick={() => onDelete(highlight.id)}>Delete</Button>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
