import { describe, expect, it } from 'vitest'
import { sealToken, unsealToken } from '@/lib/token-seal'

const secret = 'a-secret-that-is-at-least-32-characters-long'

describe('token seal', () => {
  it('round trips the plaintext', () => {
    expect(unsealToken(sealToken('1//refresh-token', secret), secret)).toBe('1//refresh-token')
  })

  it('round trips unicode', () => {
    const plain = 'tøken 日本語 🔑'
    expect(unsealToken(sealToken(plain, secret), secret)).toBe(plain)
  })

  it('gives a different string each time for the same text', () => {
    expect(sealToken('same', secret)).not.toBe(sealToken('same', secret))
  })

  it('returns null when one character is flipped', () => {
    const sealed = sealToken('1//refresh-token', secret)
    const i = Math.floor(sealed.length / 2)
    const tampered = sealed.slice(0, i) + (sealed[i] === 'A' ? 'B' : 'A') + sealed.slice(i + 1)
    expect(unsealToken(tampered, secret)).toBeNull()
  })

  it('returns null for a different secret', () => {
    const sealed = sealToken('1//refresh-token', secret)
    expect(unsealToken(sealed, 'another-secret-that-is-at-least-32-chars')).toBeNull()
  })

  it('rejects a secret shorter than 32 characters', () => {
    const short = 'x'.repeat(31)
    expect(() => sealToken('t', short)).toThrow('secret must be at least 32 characters')
    expect(unsealToken(sealToken('t', secret), short)).toBeNull()
  })

  it('returns null for empty and garbage input', () => {
    expect(unsealToken('', secret)).toBeNull()
    expect(unsealToken('not base64 !!', secret)).toBeNull()
  })
})
