import { describe, expect, it, vi } from 'vitest'
import { formatDue } from '@/lib/format'

describe('formatDue', () => {
  it('formats an ISO date for people', () => {
    expect(formatDue('2026-10-02')).toBe('Oct 2, 2026')
    expect(formatDue('2026-10-15')).toBe('Oct 15, 2026')
  })

  it('handles month boundaries', () => {
    expect(formatDue('2026-01-31')).toBe('Jan 31, 2026')
    expect(formatDue('2026-02-01')).toBe('Feb 1, 2026')
    expect(formatDue('2026-02-28')).toBe('Feb 28, 2026')
    expect(formatDue('2026-03-01')).toBe('Mar 1, 2026')
    expect(formatDue('2026-09-30')).toBe('Sep 30, 2026')
    expect(formatDue('2026-10-01')).toBe('Oct 1, 2026')
  })

  it('handles year boundaries', () => {
    expect(formatDue('2026-12-31')).toBe('Dec 31, 2026')
    expect(formatDue('2027-01-01')).toBe('Jan 1, 2027')
  })

  it('accepts 29 February only in a leap year', () => {
    expect(formatDue('2028-02-29')).toBe('Feb 29, 2028')
    expect(formatDue('2026-02-29')).toBeNull()
  })

  it('reads the date in UTC, so a timezone west of Greenwich does not move it back a day', async () => {
    const before = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      // The check is only meaningful if this process really is on Los Angeles time: UTC midnight is still the 1st there.
      expect(new Date(Date.UTC(2026, 9, 2)).getDate()).toBe(1)
      vi.resetModules() // the formatter is built when the module loads, so load it again under the new zone
      const fresh = await import('@/lib/format')
      expect(fresh.formatDue('2026-10-02')).toBe('Oct 2, 2026')
      expect(fresh.formatDue('2027-01-01')).toBe('Jan 1, 2027')
    } finally {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    }
  })

  it('returns null for anything that is not a real ISO calendar date', () => {
    for (const bad of [
      '', 'soon', 'Friday', 'NaN', 'Invalid Date',
      '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '2026-02-30', '2026-04-31',
      '2026-10-2', '26-10-02', '10/02/2026', ' 2026-10-02', '2026-10-02 ', '2026-10-02T09:00:00Z', '0000-01-01',
    ]) {
      expect(formatDue(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('never prints "Invalid Date"', () => {
    expect(String(formatDue('2026-99-99'))).not.toContain('Invalid')
  })
})
