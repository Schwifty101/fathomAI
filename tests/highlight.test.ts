import { describe, expect, it } from 'vitest'
import { buildHighlight, planHighlight, type HlSeg } from '@/lib/highlight'
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

describe('planHighlight', () => {
  // The seeded transcripts start at 1000 ms, so in the first second there is no active line.
  const beforeFirstLine = findActiveIdx(segments, 1000)

  it('asks a signed-out visitor to sign in even when there is no active line yet', () => {
    expect(beforeFirstLine).toBe(-1)
    expect(planHighlight(null, segments, beforeFirstLine, 'insight', null)).toEqual({ kind: 'sign-in' })
    expect(planHighlight(null, segments, 1, 'insight', null)).toEqual({ kind: 'sign-in' })
  })

  it('tells a signed-in user there is nothing to highlight before the first line', () => {
    expect(planHighlight('user-1', segments, beforeFirstLine, 'insight', null)).toEqual({ kind: 'no-segment' })
    expect(planHighlight('user-1', [], 0, 'insight', null)).toEqual({ kind: 'no-segment' })
  })

  it('returns the draft for a signed-in user on an active line', () => {
    const plan = planHighlight('user-1', segments, 1, 'insight', ' Key point ')
    expect(plan).toEqual({ kind: 'save', draft: buildHighlight(segments, 1, 'insight', ' Key point ')! })
  })
})
