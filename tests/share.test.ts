import { describe, expect, it } from 'vitest'
import { clampWindow } from '@/lib/share'
import { newSlug } from '@/lib/slug'

const DURATION = 3_600_000

describe('clampWindow', () => {
  it('keeps a valid window', () => {
    expect(clampWindow(1000, 20_000, DURATION)).toEqual({ start_ms: 1000, end_ms: 20_000 })
  })

  it('trims a window longer than five minutes', () => {
    expect(clampWindow(0, 900_000, DURATION)).toEqual({ start_ms: 0, end_ms: 300_000 })
  })

  it('clamps negatives and the meeting end', () => {
    expect(clampWindow(-50, 10_000, DURATION)).toEqual({ start_ms: 0, end_ms: 10_000 })
    expect(clampWindow(3_590_000, 4_000_000, DURATION)).toEqual({ start_ms: 3_590_000, end_ms: DURATION })
  })

  it('rejects empty, inverted, outside and non-finite windows', () => {
    expect(clampWindow(5000, 5000, DURATION)).toBeNull()
    expect(clampWindow(9000, 1000, DURATION)).toBeNull()
    expect(clampWindow(DURATION + 1, DURATION + 9000, DURATION)).toBeNull()
    expect(clampWindow(Number.NaN, 1000, DURATION)).toBeNull()
    expect(clampWindow(0, Number.POSITIVE_INFINITY, DURATION)).toBeNull()
  })
})

describe('newSlug', () => {
  it('uses ten unambiguous characters and avoids collisions', () => {
    const seen = new Set<string>()
    for (let index = 0; index < 2000; index++) {
      const slug = newSlug()
      expect(slug).toMatch(/^[a-km-z2-9]{10}$/)
      seen.add(slug)
    }
    expect(seen.size).toBe(2000)
  })
})
