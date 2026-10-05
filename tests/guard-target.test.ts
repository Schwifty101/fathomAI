import { describe, expect, it } from 'vitest'
import { checkTarget, envConflicts, jwtPayload, parseEnvFile, refOf } from '../scripts/guard-target'

const jwt = (p: object) => `h.${Buffer.from(JSON.stringify(p)).toString('base64url')}.s`
const url = 'https://abcdefgh.supabase.co'
const ok = { url, serviceKey: jwt({ role: 'service_role' }), linkedRef: 'abcdefgh\n', env: {} }

describe('guard-target', () => {
  it('derives the project ref', () => {
    expect(refOf(url)).toBe('abcdefgh')
    expect(refOf('http://127.0.0.1:54321')).toBe('127.0.0.1')
  })

  it('decodes jwt payloads and tolerates junk', () => {
    expect(jwtPayload(jwt({ role: 'anon' }))?.role).toBe('anon')
    expect(jwtPayload('not-a-jwt')).toBeNull()
  })

  it('accepts a matching target', () => {
    expect(checkTarget(ok).errors).toEqual([])
    expect(checkTarget({ ...ok, linkedRef: undefined, expectRef: 'abcdefgh' }).errors).toEqual([])
  })

  it('refuses a wrong, missing or disagreeing ref', () => {
    expect(checkTarget({ ...ok, linkedRef: 'other' }).errors).toHaveLength(1)
    expect(checkTarget({ ...ok, linkedRef: undefined }).errors[0]).toMatch(/no expected ref/)
    expect(checkTarget({ ...ok, expectRef: 'other' }).errors).toHaveLength(1)
    expect(checkTarget({ ...ok, url: undefined }).errors).toHaveLength(1)
    expect(checkTarget({ ...ok, url: 'nope' }).errors).toHaveLength(1)
  })

  it('refuses a non service_role or foreign-project key', () => {
    expect(checkTarget({ ...ok, serviceKey: jwt({ role: 'anon' }) }).errors).toHaveLength(1)
    expect(checkTarget({ ...ok, serviceKey: undefined }).errors).toHaveLength(1)
    expect(checkTarget({ ...ok, serviceKey: jwt({ role: 'service_role', ref: 'zzz' }) }).errors).toHaveLength(1)
    expect(checkTarget({ ...ok, serviceKey: 'sb_secret_x' }).errors).toEqual([])
  })

  it('parses env files without leaking structure', () => {
    expect(parseEnvFile('# c\nA=1\nexport B="two words" # x\nC=3 # t\nbad line\n')).toEqual({ A: '1', B: 'two words', C: '3' })
  })

  it('detects process.env overriding .env.local and names only keys', () => {
    expect(envConflicts('A=1\nB=2\n', { A: '1', B: 'x' })).toEqual(['B'])
    expect(envConflicts('A=1\n', {})).toEqual([])
    const r = checkTarget({ ...ok, envFileText: 'SECRET=a\n', env: { SECRET: 'b' } })
    expect(r.errors[0]).toMatch(/SECRET/)
    expect(r.errors[0]).not.toMatch(/=a|=b/)
  })
})
