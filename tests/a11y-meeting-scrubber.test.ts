import { describe, expect, it } from 'vitest'
import { ARROW_STEP_MS, PAGE_STEP_MS, sliderAria, sliderTarget, trackPercent } from '@/lib/slider'

// The component tests cannot import a .tsx file (tsconfig sets jsx to preserve, which vitest cannot parse), so the
// decisions the Scrubber makes live in lib/slider.ts and are tested here.

describe('trackPercent', () => {
  it('places a value proportionally on the track', () => {
    expect(trackPercent(15_000, 60_000)).toBe('25%')
    expect(trackPercent(0, 60_000)).toBe('0%')
    expect(trackPercent(60_000, 60_000)).toBe('100%')
  })

  it('keeps a value on the track', () => {
    expect(trackPercent(90_000, 60_000)).toBe('100%')
    expect(trackPercent(-5_000, 60_000)).toBe('0%')
  })

  it.each([0, NaN, Infinity, -1])('has no timeline to measure against for a duration of %s, so it is 0%', (duration) => {
    expect(trackPercent(15_000, duration)).toBe('0%')
  })

  it('never prints NaN for a non-finite value', () => {
    expect(trackPercent(NaN, 60_000)).toBe('0%')
    expect(trackPercent(Infinity, 60_000)).toBe('100%')
  })
})

describe('sliderAria', () => {
  it('reports whole seconds', () => {
    expect(sliderAria(12_400, 60_000)).toEqual({ min: 0, max: 60, now: 12 })
  })

  it.each([0, NaN, Infinity, -1])('stays numeric for a duration of %s', (duration) => {
    expect(sliderAria(0, duration)).toEqual({ min: 0, max: 0, now: 0 })
    expect(sliderAria(NaN, duration)).toEqual({ min: 0, max: 0, now: 0 })
  })

  it('keeps the value inside the range', () => {
    expect(sliderAria(70_000, 60_000).now).toBe(60)
    expect(sliderAria(-3_000, 60_000).now).toBe(0)
    expect(sliderAria(NaN, 60_000).now).toBe(0)
  })
})

describe('sliderTarget (WAI-ARIA slider keys)', () => {
  const duration = 600_000

  it('keeps the 5 second arrow step', () => {
    expect(ARROW_STEP_MS).toBe(5_000)
    expect(sliderTarget({ key: 'ArrowRight' }, 100_000, duration)).toBe(105_000)
    expect(sliderTarget({ key: 'ArrowLeft' }, 100_000, duration)).toBe(95_000)
  })

  it('jumps to the start and the end with Home and End', () => {
    expect(sliderTarget({ key: 'Home' }, 100_000, duration)).toBe(0)
    expect(sliderTarget({ key: 'End' }, 100_000, duration)).toBe(duration)
  })

  it('moves by a larger step with PageUp and PageDown', () => {
    expect(PAGE_STEP_MS).toBeGreaterThan(ARROW_STEP_MS)
    expect(sliderTarget({ key: 'PageUp' }, 100_000, duration)).toBe(100_000 + PAGE_STEP_MS)
    expect(sliderTarget({ key: 'PageDown' }, 100_000, duration)).toBe(100_000 - PAGE_STEP_MS)
  })

  it('clamps to the ends of the timeline', () => {
    expect(sliderTarget({ key: 'ArrowLeft' }, 2_000, duration)).toBe(0)
    expect(sliderTarget({ key: 'PageDown' }, 10_000, duration)).toBe(0)
    expect(sliderTarget({ key: 'ArrowRight' }, duration - 1_000, duration)).toBe(duration)
    expect(sliderTarget({ key: 'PageUp' }, duration - 10_000, duration)).toBe(duration)
  })

  it('has nowhere to go on a zero or non-finite duration, and never returns NaN', () => {
    for (const bad of [0, NaN, Infinity, -5]) {
      for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'PageUp', 'PageDown']) {
        expect(sliderTarget({ key }, 0, bad)).toBe(0)
      }
    }
  })

  it('treats a non-finite position as the start', () => {
    expect(sliderTarget({ key: 'ArrowRight' }, NaN, duration)).toBe(ARROW_STEP_MS)
  })

  it('leaves other keys alone', () => {
    expect(sliderTarget({ key: 'Enter' }, 100_000, duration)).toBeNull()
    expect(sliderTarget({ key: ' ' }, 100_000, duration)).toBeNull()
    expect(sliderTarget({ key: 'Tab' }, 100_000, duration)).toBeNull()
  })

  it('leaves a key held with a modifier alone (Alt+Left is browser back)', () => {
    expect(sliderTarget({ key: 'ArrowLeft', altKey: true }, 100_000, duration)).toBeNull()
    expect(sliderTarget({ key: 'Home', ctrlKey: true }, 100_000, duration)).toBeNull()
    expect(sliderTarget({ key: 'End', metaKey: true }, 100_000, duration)).toBeNull()
    expect(sliderTarget({ key: 'PageUp', shiftKey: true }, 100_000, duration)).toBeNull()
  })
})
