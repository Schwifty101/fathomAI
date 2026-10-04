import { describe, expect, it } from 'vitest'
import { resolveDue } from '@/seed/due'

const sunday = new Date('2026-10-04T15:00:00Z') // a Sunday: the test call that got this wrong
const monday = new Date('2026-10-05T15:00:00Z')
const wednesday = new Date('2026-10-07T15:00:00Z')

describe('resolveDue', () => {
  it('resolves weekday names to the next occurrence', () => {
    expect(resolveDue('Thursday', sunday)).toBe('2026-10-08')
    expect(resolveDue('by Friday', sunday)).toBe('2026-10-09')
    expect(resolveDue('Fri', sunday)).toBe('2026-10-09')
  })
  it('a weekday equal to the meeting day means next week', () => {
    expect(resolveDue('by Monday', monday)).toBe('2026-10-12')
  })
  it('resolves today, tomorrow, end of week, next week, end of month', () => {
    expect(resolveDue('today', sunday)).toBe('2026-10-04')
    expect(resolveDue('tomorrow', sunday)).toBe('2026-10-05')
    expect(resolveDue('end of week', sunday)).toBe('2026-10-09')
    expect(resolveDue('next week', monday)).toBe('2026-10-12')
    expect(resolveDue('end of the month', sunday)).toBe('2026-10-31')
  })
  it('passes ISO dates through', () => expect(resolveDue('2026-11-02', sunday)).toBe('2026-11-02'))
  it('returns null for null, empty and unrecognized phrases', () => {
    expect(resolveDue(null, sunday)).toBeNull()
    expect(resolveDue('', sunday)).toBeNull()
    expect(resolveDue('whenever we can', sunday)).toBeNull()
    expect(resolveDue('monthly review', sunday)).toBeNull()
  })
  it('resolves next <weekday> to the first occurrence after the coming one', () => {
    expect(resolveDue('next Friday', sunday)).toBe('2026-10-16')
    expect(resolveDue('next Monday', wednesday)).toBe('2026-10-19')
    expect(resolveDue('next Monday', monday)).toBe('2026-10-19')
  })
  it('resolves end of next week to Friday of the following week', () => {
    expect(resolveDue('end of next week', sunday)).toBe('2026-10-16')
    expect(resolveDue('end of the next week', monday)).toBe('2026-10-16')
    expect(resolveDue('end of next week', wednesday)).toBe('2026-10-16')
  })
  it('resolves eod and end of day to the meeting date', () => {
    expect(resolveDue('eod', sunday)).toBe('2026-10-04')
    expect(resolveDue('end of day', monday)).toBe('2026-10-05')
    expect(resolveDue('end of the day', wednesday)).toBe('2026-10-07')
  })
  it('handles month rollover correctly', () => {
    const octLast = new Date('2026-10-31T15:00:00Z') // Saturday
    expect(resolveDue('tomorrow', octLast)).toBe('2026-11-01')
    expect(resolveDue('end of the month', octLast)).toBe('2026-10-31')
    expect(resolveDue('today', octLast)).toBe('2026-10-31')
  })
  it('handles December month-end and year-end rollover', () => {
    const decMid = new Date(Date.UTC(2026, 11, 15, 15, 0, 0))
    expect(resolveDue('end of the month', decMid)).toBe('2026-12-31')
    const decLast = new Date(Date.UTC(2026, 11, 31, 15, 0, 0))
    expect(resolveDue('tomorrow', decLast)).toBe('2027-01-01')
  })
})
