import { describe, expect, it } from 'vitest'
import {
  actionItemsSchema, askAnswerSchema, briefSchema, chapterLinesSchema, highlightPicksSchema,
  HIGHLIGHT_TYPES, hlColor, summaryContentSchema, TEMPLATES,
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
})
