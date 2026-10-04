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
    type, note: cleaned, title: (cleaned ?? auto).slice(0, 80),
    start_ms: run.start_ms, end_ms: run.end_ms,
  }
}
