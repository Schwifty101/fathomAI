'use client'

import { formatMs } from '@/lib/format'
import type { PlaybackStore } from '@/lib/playback'
import type { ChapterRow } from '@/lib/types'

export function ChaptersTab({ store, chapters }: { store: PlaybackStore; chapters: ChapterRow[] }) {
  if (chapters.length === 0) return <p className="text-muted">No chapters for this call.</p>
  return (
    <ol className="space-y-1">
      {chapters.map((chapter) => (
        <li key={chapter.start_ms}>
          <button onClick={() => store.seek(chapter.start_ms)} className="flex w-full gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
            <span className="w-14 shrink-0 tabular-nums text-muted">{formatMs(chapter.start_ms)}</span>
            <span>{chapter.title}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
