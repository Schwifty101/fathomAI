import { describe, expect, it } from 'vitest'
import { deriveParticipantStats, unionSeconds } from '@/lib/stats'

describe('deriveParticipantStats', () => {
  const segs = [
    { participant_id: 'p1', start_ms: 0, end_ms: 4000, text: 'Hi there?' },
    { participant_id: 'p1', start_ms: 5000, end_ms: 9000, text: 'How are you?' },
    { participant_id: 'p2', start_ms: 10_000, end_ms: 12_000, text: 'Fine.' },
    { participant_id: 'p1', start_ms: 30_000, end_ms: 33_000, text: 'Ok' },
  ]
  it('sums talk time, counts questions and finds the longest monologue', () => {
    const s = deriveParticipantStats(segs)
    expect(s.get('p1')).toEqual({ talk_time_sec: 11, questions: 2, longest_monologue_sec: 9 })
    expect(s.get('p2')).toEqual({ talk_time_sec: 2, questions: 0, longest_monologue_sec: 2 })
  })
  it('does not merge a same-speaker gap of exactly 3000 ms into one monologue', () => {
    const s = deriveParticipantStats([
      { participant_id: 'p1', start_ms: 0, end_ms: 4000, text: 'a' },
      { participant_id: 'p1', start_ms: 7000, end_ms: 10_000, text: 'b' },
    ])
    expect(s.get('p1')?.longest_monologue_sec).toBe(4)
  })
  it('returns an empty map for no segments', () => {
    expect(deriveParticipantStats([]).size).toBe(0)
  })
})

describe('unionSeconds', () => {
  it('merges overlapping windows', () => {
    expect(unionSeconds([
      { start_ms: 0, end_ms: 10_000 },
      { start_ms: 5000, end_ms: 20_000 },
      { start_ms: 30_000, end_ms: 40_000 },
    ])).toBe(30)
  })
  it('is 0 for no windows', () => expect(unionSeconds([])).toBe(0))
})
