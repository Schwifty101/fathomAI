'use client'

import { useState } from 'react'
import { HIGHLIGHT_META, HIGHLIGHT_TYPES, hlColor, type HighlightType } from '@/lib/schema'
import type { HighlightRow } from '@/lib/types'

export function HighlightPanel({
  highlights,
  signedIn,
  onAdd,
}: {
  highlights: HighlightRow[]
  signedIn: boolean
  onAdd: (type: HighlightType, note: string | null) => Promise<boolean>
}) {
  const [note, setNote] = useState('')
  const count = (type: HighlightType) => highlights.filter((highlight) => highlight.type === type).length
  return (
    <section aria-label="Highlight this moment" className="rounded-card border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Highlight this moment</h2>
        <span className="text-xs text-muted">{signedIn ? 'Press H for Insight' : 'Sign in to save highlights'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {HIGHLIGHT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={async () => {
              if (await onAdd(type, note.trim() || null)) setNote('')
            }}
            className="flex items-center justify-between rounded-lg border-2 bg-surface-2 px-3 py-2 text-sm font-medium transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-accent"
            style={{ borderColor: hlColor(type) }}
          >
            <span>{HIGHLIGHT_META[type].label}</span>
            <span className="rounded bg-bg px-1.5 text-xs tabular-nums">{count(type)}</span>
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={280}
        placeholder="Add note (optional)"
        aria-label="Note for the next highlight"
        className="mt-2 h-9 w-full rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-muted"
      />
    </section>
  )
}
