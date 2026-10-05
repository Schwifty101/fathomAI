import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { completeJson, extractJson, type LlmClient } from '@/lib/llm'

function fake(replies: string[]): LlmClient & { prompts: string[] } {
  let i = 0
  const prompts: string[] = []
  return {
    prompts,
    async complete(req) {
      prompts.push(req.prompt)
      return replies[Math.min(i++, replies.length - 1)]
    },
  }
}

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }))
  it('strips ```json fences', () => expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 }))
  it('finds JSON inside prose', () => expect(extractJson('Here you go:\n[1,2]\nThanks')).toEqual([1, 2]))
  it('skips [ or { in prose before the JSON', () => {
    expect(extractJson('Note [1]: here is the {result}:\n{"a":[1,2]}')).toEqual({ a: [1, 2] })
    expect(extractJson('Sure! [see below]\n[{"a":1}]')).toEqual([{ a: 1 }])
  })
  it('throws when there is no JSON', () => expect(() => extractJson('nothing here')).toThrow())
})

describe('completeJson', () => {
  const schema = z.object({ n: z.number() })
  it('returns on the first valid reply without retrying', async () => {
    const c = fake(['{"n":1}'])
    expect(await completeJson(c, { prompt: 'p' }, schema)).toEqual({ n: 1 })
    expect(c.prompts).toHaveLength(1)
  })
  it('retries once on invalid JSON and tells the model what was wrong', async () => {
    const c = fake(['not json', '{"n":2}'])
    expect(await completeJson(c, { prompt: 'p' }, schema)).toEqual({ n: 2 })
    expect(c.prompts[1]).toContain('rejected')
  })
  it('retries once on schema failure', async () => {
    const c = fake(['{"n":"x"}', '{"n":3}'])
    expect(await completeJson(c, { prompt: 'p' }, schema)).toEqual({ n: 3 })
  })
  it('throws after the retries are exhausted', async () => {
    const c = fake(['bad', 'still bad'])
    await expect(completeJson(c, { prompt: 'p' }, schema)).rejects.toThrow(/failed validation/)
  })
})
