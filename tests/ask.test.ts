import { describe, expect, it } from 'vitest'
import { ask, ASK_LIMIT_PER_HOUR, type AskDb, type AskScope } from '@/lib/ask'
import { LlmAuthError, type LlmClient } from '@/lib/llm'
import type { SearchHit } from '@/lib/types'

const hit = (index: number): SearchHit => ({
  meeting_id: 'm1', meeting_slug: 'q4', meeting_title: 'Q4 Planning', segment_idx: index,
  start_ms: index * 1000, speaker: 'Priya', snippet: `we should <mark>ship</mark> ${index}`, rank: 1,
})

function makeDb(overrides: Partial<AskDb> & { hits?: SearchHit[] } = {}) {
  const calls = { search: [] as { query: string; scope: AskScope }[], usage: 0 }
  const rows: number[] = []
  const db: AskDb = {
    suggested: async (prompt, scopeKind) => prompt === 'Summarize my recent meetings' && scopeKind === 'my_calls'
      ? { id: '1', prompt, scope: 'my_calls', answer: { text: 'Canned summary', citations: [{ meeting_slug: 'q4', segment_idx: 1, start_ms: 1000, label: 'Kickoff' }] } }
      : null,
    search: async (query, scope) => {
      calls.search.push({ query, scope })
      return overrides.hits ?? [hit(3), hit(5)]
    },
    notes: async () => 'notes',
    usageCount: async () => rows.length,
    recordUsage: async () => { calls.usage++; rows.push(1) },
    ...overrides,
  }
  return { db, calls }
}

const model = (reply: string): LlmClient & { calls: number } => ({
  calls: 0,
  async complete() { this.calls++; return reply },
})
const throwing: LlmClient = { async complete() { throw new Error('boom') } }
const scope: AskScope = { kind: 'my_calls' }

describe('ask', () => {
  it('tells the visitor their key was rejected and falls back to extractive', async () => {
    const { db } = makeDb()
    const llm: LlmClient = { async complete() { throw new LlmAuthError('Gemini') } }
    const result = await ask({ llm, userId: 'u', db }, { question: 'anything new', scope })
    expect(result.mode).toBe('extractive')
    expect(result.notice).toMatch(/API key was rejected/)
  })
  it('answers a suggested prompt without a model call', async () => {
    const { db } = makeDb()
    const result = await ask({ llm: throwing, userId: 'u', db }, { question: 'Summarize my recent meetings', scope })
    expect(result).toMatchObject({ mode: 'suggested', text: 'Canned summary' })
    expect(result.citations[0]).toEqual({ meeting_slug: 'q4', start_ms: 1000, label: 'Kickoff' })
  })

  it('does not reuse a My Calls answer inside a meeting scope', async () => {
    const { db, calls } = makeDb()
    const result = await ask({ llm: null, userId: null, db }, {
      question: 'Summarize my recent meetings', scope: { kind: 'meeting', slug: 'q4' },
    })
    expect(result.mode).toBe('extractive')
    expect(calls.search[0].scope).toEqual({ kind: 'meeting', slug: 'q4' })
  })

  it('falls back to extractive matches without live model access', async () => {
    const { db } = makeDb()
    const result = await ask({ llm: null, userId: 'u', db }, { question: 'what about shipping', scope })
    expect(result.mode).toBe('extractive')
    expect(result.notice).toContain('unavailable')
    expect(result.citations.map((citation) => citation.start_ms)).toEqual([3000, 5000])
    expect(result.citations[0].label).not.toContain('<mark>')
  })

  it('asks signed-out visitors to sign in and still returns matches', async () => {
    const { db } = makeDb()
    const result = await ask({ llm: model('{}'), userId: null, db }, { question: 'ship it', scope })
    expect(result.mode).toBe('extractive')
    expect(result.notice).toContain('Sign in')
  })

  it('stops at the hourly limit without calling the model', async () => {
    const llm = model('{"text":"x","refs":[]}')
    const { db } = makeDb({ usageCount: async () => ASK_LIMIT_PER_HOUR + 1 })
    const result = await ask({ llm, userId: 'u', db }, { question: 'ship it', scope })
    expect(result.mode).toBe('extractive')
    expect(result.notice).toContain('limit')
    expect(llm.calls).toBe(0)
  })

  it('limits concurrent requests to the hourly cap (reserve first, then count)', async () => {
    const llm = model('{"text":"x","refs":[]}')
    const { db } = makeDb()
    const slow: AskDb = { ...db, recordUsage: async (id) => { await Promise.resolve(); await db.recordUsage(id) } }
    const results = await Promise.all(
      Array.from({ length: 25 }, () => ask({ llm, userId: 'u', db: slow }, { question: 'ship it', scope })),
    )
    expect(llm.calls).toBeLessThanOrEqual(ASK_LIMIT_PER_HOUR)
    expect(results.filter((r) => r.mode === 'live').length).toBeLessThanOrEqual(ASK_LIMIT_PER_HOUR)
  })

  it('serves exactly the limit sequentially, then blocks', async () => {
    const llm = model('{"text":"x","refs":[]}')
    const { db } = makeDb()
    for (let i = 0; i < ASK_LIMIT_PER_HOUR + 2; i++) await ask({ llm, userId: 'u', db }, { question: 'ship it', scope })
    expect(llm.calls).toBe(ASK_LIMIT_PER_HOUR)
  })

  it('degrades to extractive, never an unmetered model call, when usage tracking fails', async () => {
    const llm = model('{"text":"x","refs":[]}')
    for (const broken of [
      { recordUsage: async () => { throw new Error('db down') } },
      { usageCount: async () => { throw new Error('db down') } },
    ]) {
      const { db } = makeDb(broken)
      const result = await ask({ llm, userId: 'u', db }, { question: 'ship it', scope })
      expect(result.mode).toBe('extractive')
    }
    expect(llm.calls).toBe(0)
  })

  it('maps known refs, drops unknown refs, and records usage', async () => {
    const llm = model('```json\n{"text":"You decided to ship.","refs":["q4#3","q4#999"]}\n```')
    const { db, calls } = makeDb()
    const result = await ask({ llm, userId: 'u', db }, { question: 'what did we decide about shipping?', scope })
    expect(result.mode).toBe('live')
    expect(result.text).toBe('You decided to ship.')
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0]).toMatchObject({ meeting_slug: 'q4', start_ms: 3000 })
    expect(calls.usage).toBe(1)
  })

  it('records usage and falls back when the model fails', async () => {
    const { db, calls } = makeDb()
    const result = await ask({ llm: throwing, userId: 'u', db }, { question: 'ship it', scope })
    expect(result.mode).toBe('extractive')
    expect(result.notice).toContain('failed')
    expect(calls.usage).toBe(1)
  })

  it('passes the scope through and searches with an OR query', async () => {
    const { db, calls } = makeDb()
    await ask({ llm: null, userId: null, db }, {
      question: 'What did we decide about pricing?', scope: { kind: 'meeting', slug: 'q4' },
    })
    expect(calls.search[0].scope).toEqual({ kind: 'meeting', slug: 'q4' })
    expect(calls.search[0].query).toContain(' or ')
  })

  it('says so when nothing matches', async () => {
    const { db } = makeDb({ hits: [] })
    const result = await ask({ llm: null, userId: null, db }, { question: 'zzzz qqqq', scope })
    expect(result.text).toContain('No matching moments')
    expect(result.citations).toEqual([])
  })
})
