import { describe, expect, it } from 'vitest'
import { tileSpansRow } from '@/lib/card-tiles'
import { elements, parseTsx } from './a11y-shell-jsx'

// The card thumbnail is a two-column grid (`grid-cols-2`, MeetingCard.tsx). Lay the tiles out the way CSS grid
// auto-placement does and report how many columns each row leaves empty.
function emptyCellsPerRow(count: number): number[] {
  const rows: number[] = []
  let used = 0
  for (let index = 0; index < count; index++) {
    used += tileSpansRow(count, index) ? 2 : 1
    if (used >= 2) {
      rows.push(2 - used)
      used = 0
    }
  }
  if (used > 0) rows.push(2 - used)
  return rows
}

describe('tileSpansRow', () => {
  it.each([1, 2, 3, 4])('leaves no empty cell for %i participants', (count) => {
    expect(emptyCellsPerRow(count).every((empty) => empty === 0)).toBe(true)
  })

  it('stretches only the last tile, and only when the count is odd', () => {
    expect([0, 1, 2, 3].map((index) => tileSpansRow(3, index))).toEqual([false, false, true, false])
    expect([0, 1].map((index) => tileSpansRow(2, index))).toEqual([false, false])
    expect([0, 1, 2, 3].map((index) => tileSpansRow(4, index))).toEqual([false, false, false, false])
    expect(tileSpansRow(1, 0)).toBe(true)
  })
})

describe('MeetingCard', () => {
  const source = parseTsx('components/MeetingCard.tsx')

  it('uses tileSpansRow instead of special-casing a single participant', () => {
    expect(source.getText()).toContain('tileSpansRow(tiles.length, index)')
    expect(source.getText()).not.toContain('tiles.length === 1')
  })

  it('shows at most four tiles in the order it was given, so lane colours keep matching the meeting page', () => {
    const text = source.getText()
    expect(text).toContain('m.participants.slice(0, 4)')
    expect(text).not.toMatch(/\.sort\(|sortByTalk/)
    expect(elements(source, 'div').some((tile) => tile.getText().includes('laneColor(index)'))).toBe(true)
  })
})
