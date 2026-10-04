import { describe, expect, it } from 'vitest'
import { groupByMonth } from '@/lib/group'

describe('groupByMonth', () => {
  it('groups newest month first and newest item first', () => {
    const items = [
      { id: 'a', started_at: '2026-09-20T10:00:00Z' },
      { id: 'b', started_at: '2026-10-03T10:00:00Z' },
      { id: 'c', started_at: '2026-10-01T10:00:00Z' },
    ]
    const groups = groupByMonth(items)
    expect(groups.map((group) => group.label)).toEqual(['October 2026', 'September 2026'])
    expect(groups[0].items.map((item) => item.id)).toEqual(['b', 'c'])
  })

  it('returns an empty list for no items', () => {
    expect(groupByMonth([])).toEqual([])
  })
})
