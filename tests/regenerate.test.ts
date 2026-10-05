import { describe, expect, it } from 'vitest'
import type { LlmClient } from '@/lib/llm'
import { regenerate, REGEN_LIMIT_PER_HOUR, RegenError, type RegenDb } from '@/lib/regenerate'

const good = JSON.stringify({ sections: [{ heading: 'Overview', bullets: ['They met.'] }] })
const seq = (...replies: string[]): LlmClient & { n: number } => {
  let i = 0
  return { n: 0, async complete() { this.n++; return replies[Math.min(i++, replies.length - 1)] } }
}

function makeDb(over: Partial<RegenDb> = {}) {
  const log = { saved: [] as unknown[], usage: 0 }
  const db: RegenDb = {
    transcript: async () => ({ meetingId: 'm1', title: 'T', startedAt: '2026-10-03T10:00:00Z', lines: [{ idx: 0, speaker: 'A', text: 'hello there' }] }),
    usageCount: async () => log.usage, // reserve-then-count: includes the row just recorded
    recordUsage: async () => { log.usage++ },
    saveSummary: async (row) => { log.saved.push(row) },
    ...over,
  }
  return { db, log }
}
const input = { meetingSlug: 'q4', template: 'general' as const }
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof RegenError ? e.code : 'other'))

describe('regenerate', () => {
  it('saves a user-scoped summary and records usage', async () => {
    const { db, log } = makeDb()
    const out = await regenerate({ llm: seq(good), userId: 'u1', db }, input)
    expect(out.sections[0].heading).toBe('Overview')
    expect(log.saved).toEqual([{ meetingId: 'm1', template: 'general', userId: 'u1', content: out, model: expect.any(String) }])
    expect(log.usage).toBe(1)
  })
  it('retries once on invalid JSON', async () => {
    const m = seq('not json', good)
    const { db } = makeDb()
    await regenerate({ llm: m, userId: 'u1', db }, input)
    expect(m.n).toBe(2)
  })
  it('throws llm_failed after two bad replies, saves nothing, still counts the attempt', async () => {
    const { db, log } = makeDb()
    expect(await code(regenerate({ llm: seq('bad', 'worse'), userId: 'u1', db }, input))).toBe('llm_failed')
    expect(log.saved).toHaveLength(0)
    expect(log.usage).toBe(1)
  })
  it('rejects headings the template does not allow, then accepts a corrected retry', async () => {
    const invented = JSON.stringify({ sections: [{ heading: 'Made Up', bullets: ['x'] }] })
    const m = seq(invented, good)
    const { db } = makeDb()
    await regenerate({ llm: m, userId: 'u1', db }, input)
    expect(m.n).toBe(2)
    expect(await code(regenerate({ llm: seq(invented), userId: 'u1', db }, input))).toBe('llm_failed')
  })
  it('requires a key and a session, and records nothing without them', async () => {
    const { db, log } = makeDb()
    expect(await code(regenerate({ llm: null, userId: 'u1', db }, input))).toBe('no_key')
    expect(await code(regenerate({ llm: seq(good), userId: null, db }, input))).toBe('no_session')
    expect(log.usage).toBe(0)
  })
  it('enforces the hourly limit without calling the model', async () => {
    const m = seq(good)
    const { db } = makeDb({ usageCount: async () => REGEN_LIMIT_PER_HOUR + 1 })
    expect(await code(regenerate({ llm: m, userId: 'u1', db }, input))).toBe('rate_limited')
    expect(m.n).toBe(0)
  })
  it('serves exactly the limit sequentially, then blocks', async () => {
    const m = seq(good)
    const { db } = makeDb()
    const codes: string[] = []
    for (let i = 0; i < REGEN_LIMIT_PER_HOUR + 2; i++) codes.push(await code(regenerate({ llm: m, userId: 'u1', db }, input)))
    expect(codes.filter((c) => c === 'ok')).toHaveLength(REGEN_LIMIT_PER_HOUR)
    expect(codes.slice(-2)).toEqual(['rate_limited', 'rate_limited'])
    expect(m.n).toBe(REGEN_LIMIT_PER_HOUR)
  })
  it('limits concurrent requests to the hourly cap (reserve first, then count)', async () => {
    const m = seq(good)
    const { db } = makeDb()
    const slow: RegenDb = { ...db, recordUsage: async (id) => { await Promise.resolve(); await db.recordUsage(id) } }
    const codes = await Promise.all(
      Array.from({ length: 25 }, () => code(regenerate({ llm: m, userId: 'u1', db: slow }, input))),
    )
    expect(m.n).toBeLessThanOrEqual(REGEN_LIMIT_PER_HOUR)
    expect(codes.filter((c) => c === 'ok').length).toBeLessThanOrEqual(REGEN_LIMIT_PER_HOUR)
  })
  it('fails closed with a RegenError, never an unmetered model call, when usage tracking fails', async () => {
    const m = seq(good)
    for (const broken of [
      { recordUsage: async () => { throw new Error('db down') } },
      { usageCount: async () => { throw new Error('db down') } },
    ]) {
      const { db, log } = makeDb(broken)
      expect(await code(regenerate({ llm: m, userId: 'u1', db }, input))).toBe('unavailable')
      expect(log.saved).toHaveLength(0)
    }
    expect(m.n).toBe(0)
  })
  it('reports unavailable when the transcript read or the save fails', async () => {
    const failing = (over: Partial<RegenDb>) => makeDb(over).db
    const boom = async () => { throw new Error('x') }
    expect(await code(regenerate({ llm: seq(good), userId: 'u1', db: failing({ transcript: boom }) }, input))).toBe('unavailable')
    expect(await code(regenerate({ llm: seq(good), userId: 'u1', db: failing({ saveSummary: boom }) }, input))).toBe('unavailable')
  })
  it('reports an unknown meeting without spending usage', async () => {
    const { db, log } = makeDb({ transcript: async () => null })
    expect(await code(regenerate({ llm: seq(good), userId: 'u1', db }, input))).toBe('not_found')
    expect(log.usage).toBe(0)
  })
})
