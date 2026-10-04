import { describe, expect, it } from 'vitest'
import { normalizeQuery, splitMarks, stripMarks, toOrQuery } from '@/lib/snippet'

describe('splitMarks', () => {
  it('splits highlighted terms from plain text', () => {
    expect(splitMarks('we <mark>budget</mark> review')).toEqual([
      { text: 'we ', mark: false }, { text: 'budget', mark: true }, { text: ' review', mark: false },
    ])
  })

  it('keeps other angle brackets as plain text', () => {
    expect(splitMarks('use <script>x</script> and <mark>y</mark>')).toEqual([
      { text: 'use <script>x</script> and ', mark: false }, { text: 'y', mark: true },
    ])
  })

  it('handles no marks and empty input', () => {
    expect(splitMarks('plain')).toEqual([{ text: 'plain', mark: false }])
    expect(splitMarks('')).toEqual([])
  })
})

describe('stripMarks', () => {
  it('removes only mark tags', () => {
    expect(stripMarks('a <mark>b</mark> c')).toBe('a b c')
  })
})

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  a   b \n c ')).toBe('a b c')
  })

  it('caps at 200 characters', () => {
    expect(normalizeQuery('x'.repeat(500))).toHaveLength(200)
  })

  it('handles missing, empty and array input', () => {
    expect(normalizeQuery(undefined)).toBe('')
    expect(normalizeQuery('   ')).toBe('')
    expect(normalizeQuery(['first', 'second'])).toBe('first')
  })
})

describe('toOrQuery', () => {
  it('turns a question into an OR query of content words', () => {
    expect(toOrQuery('What did we decide about pricing?')).toBe('what or did or decide or about or pricing')
  })

  it('dedupes, drops short words and falls back to raw text', () => {
    expect(toOrQuery('pricing pricing is ok')).toBe('pricing')
    expect(toOrQuery('a an')).toBe('a an')
  })
})
