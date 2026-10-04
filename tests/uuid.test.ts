import { describe, expect, it } from 'vitest'
import { seedId, uuid5 } from '@/seed/uuid'

describe('uuid5', () => {
  it('matches the RFC 4122 DNS reference vector', () => {
    expect(uuid5('python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  })
  it('seedId is stable and distinguishes kind and key', () => {
    expect(seedId('meeting', 'q4')).toBe(seedId('meeting', 'q4'))
    expect(seedId('meeting', 'q4')).not.toBe(seedId('member', 'q4'))
    expect(seedId('meeting', 'q4')).not.toBe(seedId('meeting', 'q5'))
  })
})
