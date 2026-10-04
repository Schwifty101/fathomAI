import { describe, expect, it } from 'vitest'
import { buildHighlight, type HlSeg } from '@/lib/highlight'
import { findActiveIdx } from '@/lib/speaker-runs'

const segment = (participant_id: string, start_ms: number, end_ms: number, text: string): HlSeg => ({
  participant_id, start_ms, end_ms, text,
})
const segments = [
  segment('a', 5000, 9000, 'Thanks everyone for joining today and welcome to the call'),
  segment('a', 9500, 14_000, 'Let me start with the numbers'),
  segment('b', 14_500, 18_000, 'Sounds good'),
]

describe('buildHighlight', () => {
  it('captures the whole speaker run containing the playhead', () => {
    const highlight = buildHighlight(segments, 1, 'insight')!
    expect(highlight.start_ms).toBe(5000)
    expect(highlight.end_ms).toBe(14_000)
    expect(highlight.type).toBe('insight')
  })

  it('titles by the note when given, else the first eight words', () => {
    expect(buildHighlight(segments, 0, 'feedback', '  Great opener  ')!.title).toBe('Great opener')
    expect(buildHighlight(segments, 0, 'feedback')!.title).toBe('Thanks everyone for joining today and welcome to…')
    expect(buildHighlight(segments, 0, 'feedback', '  ')!.note).toBeNull()
  })

  it('returns null before the first line or when there are no lines', () => {
    expect(buildHighlight(segments, findActiveIdx(segments, 1000), 'insight')).toBeNull()
    expect(buildHighlight([], 0, 'insight')).toBeNull()
  })
})
