import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/safe-next'

describe('safeNext', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(safeNext('/meetings/q4-planning?t=5000')).toBe('/meetings/q4-planning?t=5000')
    expect(safeNext('/team#x')).toBe('/team#x')
  })

  it('falls back for null, empty and relative paths', () => {
    expect(safeNext(null)).toBe('/meetings')
    expect(safeNext('')).toBe('/meetings')
    expect(safeNext('meetings')).toBe('/meetings')
  })

  it('rejects external and protocol-relative URLs', () => {
    for (const value of [
      'https://evil.com', '//evil.com', '/\\evil.com', '/\t/evil.com',
      'javascript:alert(1)', '/..//evil.com', '/.//evil.com', '/./\\evil.com', '%2f%2fevil.com',
    ]) {
      expect(safeNext(value)).toBe('/meetings')
    }
  })

  it('uses a custom fallback', () => {
    expect(safeNext('//x', '/team')).toBe('/team')
  })
})
