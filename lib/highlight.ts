import type { HighlightType } from './schema'
import { expandToRun } from './speaker-runs'

export type HlSeg = { participant_id: string; start_ms: number; end_ms: number; text: string }
export type HighlightDraft = {
  type: HighlightType
  title: string
  note: string | null
  start_ms: number
  end_ms: number
}

// The database limit is 80 characters. Cutting at 80 UTF-16 units must not leave half of an emoji behind.
const clipTitle = (text: string) => text.slice(0, 80).replace(/[\ud800-\udbff]$/, '')

export function buildHighlight(
  segments: readonly HlSeg[],
  index: number,
  type: HighlightType,
  note?: string | null,
): HighlightDraft | null {
  const run = expandToRun(segments, index)
  if (!run) return null
  const cleaned = note?.trim() || null
  const words = segments.slice(run.startIdx, run.endIdx + 1).map((segment) => segment.text).join(' ').split(/\s+/)
  const auto = words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : '')
  return {
    type, note: cleaned, title: clipTitle(cleaned ?? auto),
    start_ms: run.start_ms, end_ms: run.end_ms,
  }
}

export type HighlightPlan = { kind: 'sign-in' } | { kind: 'no-segment' } | { kind: 'save'; draft: HighlightDraft }

// The sign-in gate comes first: before the first line starts there is no active segment, and a
// signed-out visitor must still be asked to sign in rather than get a silent no-op.
export function planHighlight(
  userId: string | null,
  segments: readonly HlSeg[],
  index: number,
  type: HighlightType,
  note?: string | null,
): HighlightPlan {
  if (!userId) return { kind: 'sign-in' }
  const draft = buildHighlight(segments, index, type, note)
  return draft ? { kind: 'save', draft } : { kind: 'no-segment' }
}
