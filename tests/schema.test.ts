import { describe, expect, it } from 'vitest'
import {
  actionItemsSchema, actionsFileSchema, askAnswerSchema, askFileSchema, ASK_SCOPES, briefFor, briefSchema,
  chapterLinesSchema, highlightPicksSchema, HIGHLIGHT_TYPES, hlColor, summariesFileSchema, summaryContentSchema,
  summaryFor, TEMPLATES,
} from '@/lib/schema'

describe('schema', () => {
  it('has six highlight types and four templates', () => {
    expect(HIGHLIGHT_TYPES).toHaveLength(6)
    expect(TEMPLATES).toHaveLength(4)
  })
  it('hlColor maps to a css variable', () => {
    expect(hlColor('tech_question')).toBe('var(--color-hl-tech)')
  })
  it('summary needs at least one section with bullets', () => {
    expect(summaryContentSchema.safeParse({ sections: [] }).success).toBe(false)
    expect(summaryContentSchema.safeParse({ sections: [{ heading: 'A', bullets: ['b'] }] }).success).toBe(true)
  })
  it('brief needs at least three chapters', () => {
    const ch = { title: 't', beats: ['b'], minutes: 5 }
    expect(briefSchema.safeParse({ agenda: ['a'], chapters: [ch, ch] }).success).toBe(false)
    expect(briefSchema.safeParse({ agenda: ['a'], chapters: [ch, ch, ch] }).success).toBe(true)
  })
  it('chapter lines reject speakers outside the cast', () => {
    const s = chapterLinesSchema(['Ann', 'Bob'])
    expect(s.safeParse([{ speaker: 'Ann', text: 'hi' }]).success).toBe(true)
    expect(s.safeParse([{ speaker: 'Eve', text: 'hi' }]).success).toBe(false)
  })
  it('action items reject unknown owners and out-of-range indices', () => {
    const s = actionItemsSchema(['Ann'], 10)
    const item = { owner: 'Ann', task: 'Do it', due_phrase: 'Friday', segment_idx: 3 }
    expect(s.safeParse({ action_items: [item] }).success).toBe(true)
    expect(s.safeParse({ action_items: [{ ...item, owner: 'Eve' }] }).success).toBe(false)
    expect(s.safeParse({ action_items: [{ ...item, segment_idx: 11 }] }).success).toBe(false)
  })
  it('highlight picks need 3 to 6 valid entries', () => {
    const pick = { segment_idx: 1, type: 'insight', title: 'A moment' }
    const s = highlightPicksSchema(5)
    expect(s.safeParse({ highlights: [pick, pick] }).success).toBe(false)
    expect(s.safeParse({ highlights: [pick, pick, pick] }).success).toBe(true)
    expect(s.safeParse({ highlights: [pick, pick, { ...pick, type: 'nope' }] }).success).toBe(false)
  })
  it('ask answers must cite known meeting slugs', () => {
    const s = askAnswerSchema(['q4'])
    const ok = { text: 'x', citations: [{ meeting_slug: 'q4', segment_idx: 2, label: 'l' }] }
    expect(s.safeParse(ok).success).toBe(true)
    expect(s.safeParse({ ...ok, citations: [{ ...ok.citations[0], meeting_slug: 'zz' }] }).success).toBe(false)
  })
  it('ask citations reject negative, fractional and absurd segment indices', () => {
    const s = askAnswerSchema(['q4'])
    const cite = (segment_idx: number) => ({ text: 'x', citations: [{ meeting_slug: 'q4', segment_idx, label: 'l' }] })
    expect(s.safeParse(cite(-1)).success).toBe(false)
    expect(s.safeParse(cite(1.5)).success).toBe(false)
    expect(s.safeParse(cite(10_000_000)).success).toBe(false)
  })
  it('ask citations can be restricted to the indices the generator allowed', () => {
    const s = askAnswerSchema(['q4'], new Map([['q4', new Set([2, 5])]]))
    const cite = (segment_idx: number) => ({ text: 'x', citations: [{ meeting_slug: 'q4', segment_idx, label: 'l' }] })
    expect(s.safeParse(cite(5)).success).toBe(true)
    expect(s.safeParse(cite(3)).success).toBe(false)
  })
  it('ask file rows need an allowed scope and a bounded index', () => {
    const row = { prompt: 'p', scope: 'my_calls', text: 't', citations: [{ meeting_slug: 'q4', segment_idx: 1, label: 'l' }] }
    expect(ASK_SCOPES).toEqual(['my_calls', 'team_calls'])
    expect(askFileSchema.safeParse([row]).success).toBe(true)
    expect(askFileSchema.safeParse([{ ...row, scope: 'everyone' }]).success).toBe(false)
    expect(askFileSchema.safeParse([{ ...row, citations: [{ ...row.citations[0], segment_idx: -3 }] }]).success).toBe(false)
  })
  it('chapter lines can require named speakers to speak at least twice', () => {
    const s = chapterLinesSchema(['Ann', 'Bob'], ['Bob'])
    const ann = { speaker: 'Ann', text: 'hi' }
    const bob = { speaker: 'Bob', text: 'hi' }
    expect(s.safeParse([ann, bob, ann]).success).toBe(false)
    expect(s.safeParse([ann, bob, bob]).success).toBe(true)
  })
  it('brief chapter minutes must add up to the target within 5%', () => {
    const brief = (...minutes: number[]) => ({
      agenda: ['a'], chapters: minutes.map((m) => ({ title: 't', beats: ['b'], minutes: m })),
    })
    expect(briefFor(60).safeParse(brief(20, 20, 20)).success).toBe(true)
    expect(briefFor(60).safeParse(brief(20, 20, 22)).success).toBe(true)
    expect(briefFor(60).safeParse(brief(20, 20, 24)).success).toBe(false)
    expect(briefFor(60).safeParse(brief(10, 10, 10)).success).toBe(false)
  })
  it('summaries may omit sections but only use the template headings', () => {
    const ok = { sections: [{ heading: 'Blockers', bullets: ['Mei is blocked on review.'] }] }
    expect(summaryFor('standup').safeParse(ok).success).toBe(true)
    expect(summaryFor('standup').safeParse({ sections: [{ heading: 'Budget and timeline', bullets: ['x'] }] }).success).toBe(false)
    expect(summaryFor('standup').safeParse({ sections: [ok.sections[0], ok.sections[0]] }).success).toBe(false)
    const all = { general: { sections: [{ heading: 'Overview', bullets: ['x'] }] }, sales: ok, standup: ok, project_review: ok }
    expect(summariesFileSchema.safeParse(all).success).toBe(false) // sales has a standup heading
  })
  it('actions file rejects impossible calendar dates and keeps the spoken phrase', () => {
    const row = { owner: 'A', task: 't', due: '2026-10-09', due_phrase: 'Friday', segment_idx: 1, start_ms: 0 }
    expect(actionsFileSchema.safeParse([row]).success).toBe(true)
    expect(actionsFileSchema.safeParse([{ ...row, due: '2026-02-31' }]).success).toBe(false)
    expect(actionsFileSchema.safeParse([{ ...row, due: '2026-13-45' }]).success).toBe(false)
  })
})
