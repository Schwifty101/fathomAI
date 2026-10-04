import type { SupabaseClient } from '@supabase/supabase-js'

export type AppUser = { id: string; email: string | null; avatar: string | null }

export async function getUser(db: SupabaseClient): Promise<AppUser | null> {
  const { data } = await db.auth.getUser()
  const user = data.user
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? null,
    avatar: (user.user_metadata?.avatar_url as string | undefined) ?? null,
  }
}
