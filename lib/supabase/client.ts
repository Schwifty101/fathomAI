import { createBrowserClient } from '@supabase/ssr'
import { toast } from '@/lib/toast'

export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function signInWithGoogle(next: string): Promise<void> {
  const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  try {
    const { error } = await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (error) throw error
  } catch {
    toast("Couldn't start Google sign-in. Please try again.")
  }
}
