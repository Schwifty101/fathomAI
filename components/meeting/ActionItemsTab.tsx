'use client'

import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { formatMs } from '@/lib/format'
import { actionItemsToMarkdown } from '@/lib/markdown'
import type { PlaybackStore } from '@/lib/playback'
import { toast } from '@/lib/toast'
import type { ActionItemRow, HighlightRow } from '@/lib/types'

export function ActionItemsTab({
  store,
  items,
  ownHighlights,
}: {
  store: PlaybackStore
  items: ActionItemRow[]
  ownHighlights: HighlightRow[]
}) {
  if (items.length === 0 && ownHighlights.length === 0) return <p className="text-muted">No action items.</p>
  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(actionItemsToMarkdown(items))
            toast('Action items copied')
          }}
        >
          Copy
        </Button>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p>{item.task}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-medium text-fg">{item.owner}</span>
              {item.due && <Chip>Due {item.due}</Chip>}
              <button className="underline hover:text-fg" onClick={() => store.seek(item.start_ms)}>
                Jump to {formatMs(item.start_ms)}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {ownHighlights.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Your action-item highlights</h3>
          <ul className="space-y-2">
            {ownHighlights.map((highlight) => (
              <li key={highlight.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <button className="text-left hover:underline" onClick={() => store.seek(highlight.start_ms)}>
                  {highlight.title} <span className="text-muted">({formatMs(highlight.start_ms)})</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
