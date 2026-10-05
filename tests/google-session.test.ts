import { describe, expect, it, vi } from 'vitest'
import { accessTokenFor, sealConnection } from '@/lib/google-session'

const secret = 'a-secret-that-is-at-least-32-characters-long'
const env = { secret, clientId: 'cid', clientSecret: 'csecret' }

const okFetch = () =>
  vi.fn(async (_url: unknown, _init?: unknown) => new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }))
const statusFetch = (status: number) => vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch

describe('sealConnection', () => {
  it('returns null for a missing token, a missing secret or a short secret', () => {
    expect(sealConnection('u1', null, secret)).toBeNull()
    expect(sealConnection('u1', undefined, secret)).toBeNull()
    expect(sealConnection('u1', 'rt', undefined)).toBeNull()
    expect(sealConnection('u1', 'rt', 'short-secret')).toBeNull()
  })
})

describe('accessTokenFor', () => {
  it('round trips and sends the refresh token', async () => {
    const cookie = sealConnection('u1', '1//rt', secret)!
    const fake = okFetch()
    expect(await accessTokenFor(cookie, 'u1', env, fake as unknown as typeof fetch)).toEqual({ status: 'ok', token: 'at' })
    expect(String((fake.mock.calls[0][1] as { body: string }).body)).toContain('refresh_token=1%2F%2Frt')
  })

  it('gives none for a different user without calling fetch', async () => {
    const cookie = sealConnection('u1', '1//rt', secret)!
    const fake = okFetch()
    expect(await accessTokenFor(cookie, 'u2', env, fake as unknown as typeof fetch)).toEqual({ status: 'none' })
    expect(fake).not.toHaveBeenCalled()
  })

  it('gives none for a garbage or missing cookie', async () => {
    expect(await accessTokenFor('garbage!!', 'u1', env, okFetch() as unknown as typeof fetch)).toEqual({ status: 'none' })
    expect(await accessTokenFor(undefined, 'u1', env, okFetch() as unknown as typeof fetch)).toEqual({ status: 'none' })
  })

  it('gives none for a sealed value of the wrong shape', async () => {
    const { sealToken } = await import('@/lib/token-seal')
    const fake = okFetch()
    expect(await accessTokenFor(sealToken('"x"', secret), 'u1', env, fake as unknown as typeof fetch)).toEqual({ status: 'none' })
    expect(await accessTokenFor(sealToken('{"uid":"u1"}', secret), 'u1', env, fake as unknown as typeof fetch)).toEqual({ status: 'none' })
    expect(fake).not.toHaveBeenCalled()
  })

  it('gives none when an env value is missing', async () => {
    const cookie = sealConnection('u1', 'rt', secret)!
    const fake = okFetch() as unknown as typeof fetch
    expect(await accessTokenFor(cookie, 'u1', { ...env, secret: undefined }, fake)).toEqual({ status: 'none' })
    expect(await accessTokenFor(cookie, 'u1', { ...env, clientId: undefined }, fake)).toEqual({ status: 'none' })
    expect(await accessTokenFor(cookie, 'u1', { ...env, clientSecret: undefined }, fake)).toEqual({ status: 'none' })
  })

  it('gives revoked on a 400 and rejects on a 503', async () => {
    const cookie = sealConnection('u1', 'rt', secret)!
    expect(await accessTokenFor(cookie, 'u1', env, statusFetch(400))).toEqual({ status: 'revoked' })
    await expect(accessTokenFor(cookie, 'u1', env, statusFetch(503))).rejects.toThrow()
  })
})
