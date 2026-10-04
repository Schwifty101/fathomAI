import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth'

describe('getUser', () => {
  it('maps the signed-in identity used by the header', async () => {
    const db = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-1', email: 'a@example.com', user_metadata: { avatar_url: 'https://example.com/a.png' } } },
        }),
      },
    } as unknown as SupabaseClient
    expect(await getUser(db)).toEqual({ id: 'user-1', email: 'a@example.com', avatar: 'https://example.com/a.png' })
  })

  it('returns null without a session', async () => {
    const db = { auth: { getUser: async () => ({ data: { user: null } }) } } as unknown as SupabaseClient
    expect(await getUser(db)).toBeNull()
  })
})
