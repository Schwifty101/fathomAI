import { describe, expect, it } from 'vitest'
import { ASK_PROMPTS_BY_SCOPE, askPrompt, briefPrompt, chapterPrompt, spotlight, summaryPrompt } from '@/lib/prompts'

const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const cast = names.map((name) => ({ name, role: 'r' }))
const def = { title: 'T', kind: 'planning', targetMin: 62, topic: 't', showcase: true }

describe('prompts', () => {
  it('spotlight features every person in at least two chapters for 3 to 8 chapters', () => {
    for (let total = 3; total <= 8; total++) {
      const seen = new Map<string, number>()
      for (let i = 0; i < total; i++) for (const n of spotlight(names, i, total)) seen.set(n, (seen.get(n) ?? 0) + 1)
      for (const n of names) expect(seen.get(n) ?? 0, `${n} of ${total}`).toBeGreaterThanOrEqual(2)
    }
  })
  it('showcase brief and chapter prompts carry the talk plan; others do not', () => {
    expect(briefPrompt(def, cast)).toContain('Talk plan')
    expect(briefPrompt({ ...def, showcase: false }, cast)).not.toContain('Talk plan')
    const chapter = { title: 'c', beats: ['b'], minutes: 5 }
    const ctx = { def, cast, chapter, index: 0, total: 6, prev: [], words: 700 }
    expect(chapterPrompt(ctx)).toContain('must speak at least twice')
    expect(chapterPrompt({ ...ctx, def: { ...def, showcase: false } })).not.toContain('must speak at least twice')
  })
  it('summary prompt lets the model omit unsupported sections', () => {
    expect(summaryPrompt('standup', { title: 'T', date: 'd', transcript: 'x' })).toContain('Omit any section')
  })
  it('has three distinct canned prompts per scope', () => {
    const all = [...ASK_PROMPTS_BY_SCOPE.my_calls, ...ASK_PROMPTS_BY_SCOPE.team_calls]
    expect(ASK_PROMPTS_BY_SCOPE.my_calls).toHaveLength(3)
    expect(ASK_PROMPTS_BY_SCOPE.team_calls).toHaveLength(3)
    expect(new Set(all).size).toBe(6)
  })
  it('ask prompt says who "my" is', () => {
    expect(askPrompt('q', 'notes', '"my" means Priya')).toContain('"my" means Priya')
  })
})
