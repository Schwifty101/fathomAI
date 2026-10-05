import { beforeEach, describe, expect, it, vi } from 'vitest'

const exchange = vi.fn()
const refresh = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange, refreshSession: refresh } }),
}))

import { GET } from '@/app/auth/callback/route'

const call = () => GET(new Request('http://localhost/auth/callback?code=c&next=/calendar'))
const session = (providerRefresh?: string) => ({
  data: { user: { id: 'u1' }, session: { provider_refresh_token: providerRefresh } },
  error: null,
})

beforeEach(() => {
  process.env.CALENDAR_COOKIE_SECRET = 'a-secret-that-is-at-least-32-characters-long'
  exchange.mockReset()
  refresh.mockReset()
})

describe('auth callback', () => {
  it('seals the Google token, then refreshes the Supabase session once so it is not left in the readable cookie', async () => {
    exchange.mockResolvedValue(session('1//rt'))
    refresh.mockResolvedValue({ data: {}, error: null })
    const res = await call()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(res.headers.get('location')).toBe('http://localhost/calendar')
    expect(res.cookies.get('fathom_gcal')?.value).toBeTruthy()
  })

  it('does not refresh on an ordinary sign-in', async () => {
    exchange.mockResolvedValue(session(undefined))
    const res = await call()
    expect(refresh).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe('http://localhost/calendar')
    expect(res.cookies.get('fathom_gcal')).toBeUndefined()
  })

  it('still redirects with the sealed cookie when the refresh throws', async () => {
    exchange.mockResolvedValue(session('1//rt'))
    refresh.mockRejectedValue(new Error('boom'))
    const res = await call()
    expect(res.headers.get('location')).toBe('http://localhost/calendar')
    expect(res.cookies.get('fathom_gcal')?.value).toBeTruthy()
  })

  it('sends a failed exchange to the auth error page without refreshing', async () => {
    exchange.mockResolvedValue({ data: {}, error: new Error('x') })
    const res = await call()
    expect(res.headers.get('location')).toBe('http://localhost/meetings?auth_error=1')
    expect(refresh).not.toHaveBeenCalled()
  })
})
