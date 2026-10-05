import { describe, expect, it } from 'vitest'
import { castOf, MEETINGS, SEED_ANCHOR, startedAt, validateDefs, type MeetingDef } from '@/seed/meetings'
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
  it('every meeting starts on a weekday (UTC)', () => {
    for (const m of MEETINGS) expect([1, 2, 3, 4, 5], m.slug).toContain(startedAt(m).getUTCDay())
  })
})

describe('validateDefs rejects bad definitions', () => {
  const base = MEETINGS.find((m) => m.slug === 'priya-mei-1on1')!
  const errs = (patch: Partial<MeetingDef>) => validateDefs([{ ...base, ...patch }]).join('\n')
  it('a weekend start', () => expect(errs({ daysAgo: 1 })).toContain('weekday')) // 2026-10-04 is a Sunday
  it('a start outside the three-week window', () => expect(errs({ daysAgo: 22 })).toContain('three weeks'))
  it('an unknown member slug, with a message and no throw', () => {
    expect(errs({ internal: ['priya', 'nobody'] })).toContain('unknown member nobody')
    expect(() => validateDefs([{ ...base, internal: ['priya', 'nobody'] }])).not.toThrow()
  })
  it('a showcase that is not about an hour long', () => {
    const show = MEETINGS.find((m) => m.showcase)!
    expect(validateDefs([{ ...show, targetMin: 45 }]).join('\n')).toContain('showcase')
  })
  it('castOf throws a helpful error for an unknown slug', () => {
    expect(() => castOf({ ...base, internal: ['priya', 'nobody'] })).toThrow(/unknown member "nobody" in priya-mei-1on1/)
  })
})
