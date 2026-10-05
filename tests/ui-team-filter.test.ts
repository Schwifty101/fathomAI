import { describe, expect, it } from 'vitest'
import { filterMeetings, resolveTeamFilter, unknownFilterMessage } from '@/lib/team-filter'

const stats = [
  { member_id: 'h1', role: 'sales' },
  { member_id: 'h2', role: 'engineering' },
]
const meetings = [
  { id: 'm1', host_id: 'h1', host: { role: 'sales' } },
  { id: 'm2', host_id: 'h2', host: { role: 'engineering' } },
  { id: 'm3', host_id: 'gone', host: null },
]

describe('resolveTeamFilter', () => {
  it('treats absent params as no filter', () => {
    expect(resolveTeamFilter({}, stats)).toEqual({ host: '', role: '', unknownHost: false, unknownRole: false })
  })

  it('accepts a known host and role', () => {
    expect(resolveTeamFilter({ host: 'h1', role: 'sales' }, stats)).toEqual({
      host: 'h1', role: 'sales', unknownHost: false, unknownRole: false,
    })
  })

  it('flags a host that is not a team member', () => {
    expect(resolveTeamFilter({ host: 'zzz' }, stats)).toMatchObject({ host: 'zzz', unknownHost: true, unknownRole: false })
  })

  it('flags a role nobody has', () => {
    expect(resolveTeamFilter({ role: 'zzz' }, stats)).toMatchObject({ role: 'zzz', unknownHost: false, unknownRole: true })
  })

  it('uses the first value when a param is repeated', () => {
    expect(resolveTeamFilter({ host: ['h2', 'zzz'] }, stats)).toMatchObject({ host: 'h2', unknownHost: false })
  })
})

describe('filterMeetings', () => {
  it('returns everything without a filter', () => {
    expect(filterMeetings(meetings, { host: '', role: '' })).toHaveLength(3)
  })

  it('filters by host and by role', () => {
    expect(filterMeetings(meetings, { host: 'h1', role: '' }).map((m) => m.id)).toEqual(['m1'])
    expect(filterMeetings(meetings, { host: '', role: 'engineering' }).map((m) => m.id)).toEqual(['m2'])
  })

  it('returns no calls for an unknown host, never all of them', () => {
    expect(filterMeetings(meetings, { host: 'zzz', role: '' })).toEqual([])
  })
})

describe('unknownFilterMessage', () => {
  it('is null when both filters are valid', () => {
    expect(unknownFilterMessage({ host: 'h1', role: '', unknownHost: false, unknownRole: false })).toBeNull()
  })

  it('says which filter matched nobody', () => {
    expect(unknownFilterMessage({ host: 'zzz', role: '', unknownHost: true, unknownRole: false })).toBe('No team member matches that host.')
    expect(unknownFilterMessage({ host: '', role: 'zzz', unknownHost: false, unknownRole: true })).toBe('No team member has that role.')
    expect(unknownFilterMessage({ host: 'a', role: 'b', unknownHost: true, unknownRole: true })).toBe('No team member matches that host or role.')
  })
})
