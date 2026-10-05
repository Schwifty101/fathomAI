import { describe, expect, it } from 'vitest'
import { rovingTarget, type RovingKeys } from '@/lib/roving'

const TABS: RovingKeys = { prev: 'ArrowLeft', next: 'ArrowRight', wrap: true }
const LIST: RovingKeys = { prev: 'ArrowUp', next: 'ArrowDown', wrap: false }

describe('rovingTarget with wrapping (tabs)', () => {
  it('moves right and left', () => {
    expect(rovingTarget({ key: 'ArrowRight' }, 0, 5, TABS)).toBe(1)
    expect(rovingTarget({ key: 'ArrowLeft' }, 3, 5, TABS)).toBe(2)
  })

  it('wraps at both ends', () => {
    expect(rovingTarget({ key: 'ArrowRight' }, 4, 5, TABS)).toBe(0)
    expect(rovingTarget({ key: 'ArrowLeft' }, 0, 5, TABS)).toBe(4)
  })

  it('jumps to the first and last with Home and End', () => {
    expect(rovingTarget({ key: 'Home' }, 3, 5, TABS)).toBe(0)
    expect(rovingTarget({ key: 'End' }, 1, 5, TABS)).toBe(4)
  })

  it('ignores the keys of the other axis', () => {
    expect(rovingTarget({ key: 'ArrowDown' }, 1, 5, TABS)).toBeNull()
    expect(rovingTarget({ key: 'ArrowUp' }, 1, 5, TABS)).toBeNull()
  })
})

describe('rovingTarget without wrapping (list)', () => {
  it('stops at both ends', () => {
    expect(rovingTarget({ key: 'ArrowDown' }, 4, 5, LIST)).toBe(4)
    expect(rovingTarget({ key: 'ArrowUp' }, 0, 5, LIST)).toBe(0)
  })

  it('moves one row at a time', () => {
    expect(rovingTarget({ key: 'ArrowDown' }, 2, 5, LIST)).toBe(3)
    expect(rovingTarget({ key: 'ArrowUp' }, 2, 5, LIST)).toBe(1)
  })

  it('starts from the first row when nothing is focused yet', () => {
    expect(rovingTarget({ key: 'ArrowDown' }, -1, 5, LIST)).toBe(0)
  })
})

describe('rovingTarget leaves other keys and shortcuts alone', () => {
  it('ignores unrelated keys', () => {
    expect(rovingTarget({ key: 'Enter' }, 1, 5, TABS)).toBeNull()
    expect(rovingTarget({ key: 'a' }, 1, 5, TABS)).toBeNull()
  })

  it('ignores a key held with a modifier (Alt+Left is browser back)', () => {
    expect(rovingTarget({ key: 'ArrowLeft', altKey: true }, 1, 5, TABS)).toBeNull()
    expect(rovingTarget({ key: 'ArrowRight', metaKey: true }, 1, 5, TABS)).toBeNull()
    expect(rovingTarget({ key: 'Home', ctrlKey: true }, 1, 5, TABS)).toBeNull()
    expect(rovingTarget({ key: 'ArrowDown', shiftKey: true }, 1, 5, LIST)).toBeNull()
  })

  it('does nothing for an empty group', () => {
    expect(rovingTarget({ key: 'ArrowRight' }, 0, 0, TABS)).toBeNull()
  })
})
