import { describe, expect, it } from 'vitest'
import { pickSummaries, selectAll } from '@/lib/queries'
import type { SummaryRow } from '@/lib/types'

const row = (template: SummaryRow['template'], user_id: string | null, heading: string): SummaryRow => ({
  template,
  content: { sections: [{ heading, bullets: ['b'] }] },
  user_id,
  source: user_id ? 'live' : 'seed',
})

describe('pickSummaries', () => {
  const rows = [row('general', null, 'seed-general'), row('general', 'u1', 'mine'), row('sales', null, 'seed-sales')]

  it('prefers the signed-in user own row over the seeded one', () => {
    const summaries = pickSummaries(rows, 'u1')
    expect(summaries.general?.content.sections[0].heading).toBe('mine')
    expect(summaries.general?.source).toBe('live')
    expect(summaries.sales?.source).toBe('seed')
  })

  it('uses only seeded rows for other users and visitors', () => {
    expect(pickSummaries(rows, 'u2').general?.source).toBe('seed')
    expect(pickSummaries(rows, null).general?.source).toBe('seed')
  })

  it('omits templates with no row', () => {
    expect(pickSummaries(rows, null).standup).toBeUndefined()
  })
})

describe('selectAll', () => {
  it('pages until a short page', async () => {
    const all = Array.from({ length: 7 }, (_, i) => i)
    const calls: [number, number][] = []
    const out = await selectAll<number>(async (from, to) => {
      calls.push([from, to])
      return { data: all.slice(from, to + 1), error: null }
    }, 3)
    expect(out).toEqual(all)
    expect(calls).toEqual([[0, 2], [3, 5], [6, 8]])
  })

  it('fetches the next page after an exact multiple', async () => {
    const calls: [number, number][] = []
    const out = await selectAll<number>(async (from, to) => {
      calls.push([from, to])
      return { data: [1, 2, 3, 4, 5, 6].slice(from, to + 1), error: null }
    }, 3)
    expect(out).toHaveLength(6)
    expect(calls).toEqual([[0, 2], [3, 5], [6, 8]])
  })

  it('throws on a database error', async () => {
    await expect(selectAll(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom')
  })
})
