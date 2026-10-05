import { describe, expect, it } from 'vitest'
import { formatMinutes, formatMs, initials, parseTimeParam } from '@/lib/format'

describe('formatMs', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatMs(0)).toBe('0:00')
    expect(formatMs(26_000)).toBe('0:26')
    expect(formatMs(140_000)).toBe('2:20')
    expect(formatMs(3_723_000)).toBe('1:02:03')
  })
  it('clamps negatives to zero', () => {
    expect(formatMs(-5)).toBe('0:00')
  })
  it('never prints NaN', () => {
    expect(formatMs(NaN)).toBe('0:00')
    expect(formatMs(Infinity)).toBe('0:00')
  })
})

describe('formatMinutes', () => {
  it('pluralizes and never shows 0', () => {
    expect(formatMinutes(20)).toBe('1 min')
    expect(formatMinutes(480)).toBe('8 mins')
  })
})

describe('parseTimeParam', () => {
  const dur = 60_000
  it('parses a valid value', () => expect(parseTimeParam('12000', dur)).toBe(12_000))
  it('takes the first of an array', () => expect(parseTimeParam(['5000', '9'], dur)).toBe(5_000))
  it('returns 0 for missing, empty, NaN and garbage', () => {
    expect(parseTimeParam(undefined, dur)).toBe(0)
    expect(parseTimeParam('', dur)).toBe(0)
    expect(parseTimeParam('abc', dur)).toBe(0)
    expect(parseTimeParam('NaN', dur)).toBe(0)
    expect(parseTimeParam('Infinity', dur)).toBe(0)
    expect(parseTimeParam('0x10', dur)).toBe(0)
    expect(parseTimeParam('1e3', dur)).toBe(0)
    expect(parseTimeParam(' 5 ', dur)).toBe(0)
  })
  it('returns 0 for a NaN duration', () => {
    expect(parseTimeParam('5000', NaN)).toBe(0)
  })
  it('clamps negative and past-the-end values', () => {
    expect(parseTimeParam('-500', dur)).toBe(0)
    expect(parseTimeParam('999999999', dur)).toBe(dur)
  })
})

describe('initials', () => {
  it('uses the first letters of the first and last word', () => {
    expect(initials('Priya Raman')).toBe('PR')
    expect(initials('Elena Voss')).toBe('EV')
    expect(initials('Cher')).toBe('C')
    expect(initials('  ')).toBe('?')
  })
})
