import { describe, expect, it } from 'vitest'
import { stampTimestamps, type Line } from '@/seed/stamp'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
const lines = (count: number, wordsPer: number): Line[] =>
  Array.from({ length: count }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', text: words(wordsPer) }))

describe('stampTimestamps', () => {
  it('is deterministic for a given seed and differs across seeds', () => {
    const a = stampTimestamps(lines(30, 12), { targetMs: 120_000, seed: 1 })
    const b = stampTimestamps(lines(30, 12), { targetMs: 120_000, seed: 1 })
    const c = stampTimestamps(lines(30, 12), { targetMs: 120_000, seed: 2 })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
  it('keeps starts increasing, ends after starts, and idx contiguous', () => {
    const out = stampTimestamps(lines(200, 15), { targetMs: 1_300_000, seed: 7 })
    out.forEach((l, i) => {
      expect(l.idx).toBe(i)
      expect(l.end_ms).toBeGreaterThan(l.start_ms)
      if (i > 0) expect(l.start_ms).toBeGreaterThan(out[i - 1].start_ms)
    })
  })
  it('lands within 5% of the target when the natural pace allows scaling', () => {
    const target = 1_300_000
    const out = stampTimestamps(lines(200, 15), { targetMs: target, seed: 7 })
    expect(Math.abs(out.at(-1)!.end_ms - target) / target).toBeLessThan(0.05)
  })
  it('clamps pace scaling to between 0.8x and 1.25x', () => {
    const shrunk = stampTimestamps(lines(50, 15), { targetMs: 1, seed: 3 }).at(-1)!.end_ms
    const stretched = stampTimestamps(lines(50, 15), { targetMs: 10_000_000, seed: 3 }).at(-1)!.end_ms
    // the 1000ms lead-in is not scaled, so compare the scaled part: 1.25 / 0.8 = 1.5625
    expect((stretched - 1000) / (shrunk - 1000)).toBeCloseTo(1.5625, 1)
  })
})
