import { describe, expect, it } from 'vitest'
import { expandToRun, findActiveIdx, MAX_RUN_MS, splitRuns, type Seg } from '@/lib/speaker-runs'

const seg = (p: string, s: number, e: number): Seg => ({ participant_id: p, start_ms: s, end_ms: e })

describe('findActiveIdx', () => {
  const segs = [seg('a', 0, 10_000), seg('b', 10_000, 20_000), seg('a', 20_000, 30_000)]
  it('returns -1 before the first segment', () => expect(findActiveIdx(segs, -1)).toBe(-1))
  it('finds the segment containing the time', () => {
    expect(findActiveIdx(segs, 0)).toBe(0)
    expect(findActiveIdx(segs, 9_999)).toBe(0)
    expect(findActiveIdx(segs, 10_000)).toBe(1)
    expect(findActiveIdx(segs, 99_999)).toBe(2)
  })
  it('handles an empty list', () => expect(findActiveIdx([], 5)).toBe(-1))
})

describe('splitRuns / expandToRun', () => {
  it('a single segment is its own run', () => {
    expect(expandToRun([seg('a', 0, 1000)], 0)).toEqual({ startIdx: 0, endIdx: 0, start_ms: 0, end_ms: 1000 })
  })
  it('merges consecutive same-speaker segments across small gaps', () => {
    const segs = [seg('a', 0, 4000), seg('a', 5000, 9000), seg('b', 9500, 12000)]
    expect(expandToRun(segs, 1)).toEqual({ startIdx: 0, endIdx: 1, start_ms: 0, end_ms: 9000 })
    expect(splitRuns(segs)).toHaveLength(2)
  })
  it('splits when the gap exceeds 3 seconds or the speaker changes', () => {
    const segs = [seg('a', 0, 4000), seg('a', 8000, 9000), seg('b', 9000, 10_000), seg('a', 10_000, 11_000)]
    expect(splitRuns(segs).map((r) => [r.startIdx, r.endIdx])).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]])
  })
  it('merges a gap of 2999 ms but splits at exactly 3000 ms', () => {
    expect(splitRuns([seg('a', 0, 1000), seg('a', 3999, 5000)])).toHaveLength(1)
    expect(splitRuns([seg('a', 0, 1000), seg('a', 4000, 5000)])).toHaveLength(2)
  })
  it('returns null for an out-of-range index and [] runs for no segments', () => {
    expect(expandToRun([seg('a', 0, 1)], 5)).toBeNull()
    expect(expandToRun([seg('a', 0, 1)], -1)).toBeNull()
    expect(splitRuns([])).toEqual([])
  })
  it('clamps a long monologue to 5 minutes and keeps the playhead segment inside', () => {
    const segs = Array.from({ length: 100 }, (_, i) => seg('a', i * 10_000, (i + 1) * 10_000))
    for (const idx of [0, 50, 99]) {
      const run = expandToRun(segs, idx)!
      expect(run.end_ms - run.start_ms).toBeLessThanOrEqual(MAX_RUN_MS)
      expect(run.start_ms).toBeLessThanOrEqual(segs[idx].start_ms)
      expect(run.end_ms).toBeGreaterThanOrEqual(segs[idx].end_ms)
    }
  })
})
