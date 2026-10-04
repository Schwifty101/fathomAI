import { describe, expect, it } from 'vitest'
import { castOf, MEETINGS, SEED_ANCHOR, startedAt, validateDefs } from '@/seed/meetings'
import { TEAM } from '@/seed/team'

describe('seed definitions', () => {
  it('are internally consistent', () => expect(validateDefs()).toEqual([]))
  it('has 8 team members with exactly one demo persona', () => {
    expect(TEAM).toHaveLength(8)
    expect(TEAM.filter((m) => m.demo)).toHaveLength(1)
  })
  it('has 8 meetings and one 8-person showcase of about an hour', () => {
    expect(MEETINGS).toHaveLength(8)
    const show = MEETINGS.filter((m) => m.showcase)
    expect(show).toHaveLength(1)
    expect(castOf(show[0])).toHaveLength(8)
    expect(show[0].targetMin).toBeGreaterThanOrEqual(60)
  })
  it('every meeting started before the anchor and within the last three weeks', () => {
    for (const m of MEETINGS) {
      const t = startedAt(m).getTime()
      expect(t).toBeLessThan(SEED_ANCHOR)
      expect(SEED_ANCHOR - t).toBeLessThan(21 * 86_400_000)
    }
  })
  it('the demo persona hosts at least three meetings', () => {
    const demo = TEAM.find((m) => m.demo)!.slug
    expect(MEETINGS.filter((m) => m.host === demo).length).toBeGreaterThanOrEqual(3)
  })
})
