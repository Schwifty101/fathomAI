import { toast } from '@/lib/toast'

type Auth = { signOut: () => Promise<{ error: unknown }> }

/**
 * Signs out and refreshes the page data. A failure is toasted, the way signInWithGoogle reports its own. supabase-js
 * returns most failures as `{ error }` rather than throwing, so both are handled. It also drops the local session
 * before returning a server error, so the refresh runs either way and the header never lags behind the cookies.
 */
export async function signOutWithToast(
  getAuth: () => Auth,
  refresh: () => void,
  notify: (message: string) => void = toast,
): Promise<void> {
  try {
    const { error } = await getAuth().signOut()
    if (error) throw error
  } catch {
    notify("Couldn't sign you out. Please try again.")
  }
  refresh()
}
