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
  it('passes real ISO dates through and rejects impossible ones', () => {
    expect(resolveDue('2026-11-02', sunday)).toBe('2026-11-02')
    expect(resolveDue('2026-13-45', sunday)).toBeNull()
    expect(resolveDue('2026-02-31', sunday)).toBeNull()
  })
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

// Meeting held Wednesday 2026-10-07. Rules: a bare weekday is the next occurrence after the meeting day;
// weekday + "next week" is that day in the following Mon-Fri week; weekdays beat generic eod/next-week.
// A weekend meeting counts as "this week" being the coming work week, so on a Saturday
// "end of week" is the coming Friday, never the past one.
const table: [string, string | null][] = [
  ['by Friday EOD', '2026-10-09'],
  ['Friday EOD', '2026-10-09'],
  ['end of day Thursday', '2026-10-08'],
  ['EOD Monday', '2026-10-12'],
  ['Wednesday of next week', '2026-10-14'],
  ['Friday next week', '2026-10-16'],
  ['Monday next week', '2026-10-12'],
  ['next week', '2026-10-12'],
  ['in two weeks', '2026-10-21'],
  ['in 2 weeks', '2026-10-21'],
  ['in a week', '2026-10-14'],
  ['in three days', '2026-10-10'],
  ['end of next month', '2026-11-30'],
  ['next month', '2026-11-30'],
  ['by month end', '2026-10-31'],
  ['end of the month', '2026-10-31'],
  ['tonight', '2026-10-07'],
  ['EOD today', '2026-10-07'],
  ['eod tomorrow', '2026-10-08'],
  ['close of business', '2026-10-07'],
  ['whenever we can', null],
  ['next weekend', null],
]
describe('resolveDue table (meeting on Wednesday 2026-10-07)', () => {
  it.each(table)('%s -> %s', (phrase, expected) => {
    expect(resolveDue(phrase, wednesday)).toBe(expected)
  })
  it('on a Saturday, end of week is the coming Friday', () => {
    expect(resolveDue('end of week', new Date('2026-10-03T15:00:00Z'))).toBe('2026-10-09')
  })
  it('end of next month rolls over the year', () => {
    expect(resolveDue('end of next month', new Date('2026-12-10T15:00:00Z'))).toBe('2027-01-31')
  })
})
