import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server Components cannot set response headers (middleware applies them on every request);
// route handlers pass `onHeaders` to copy the cache headers onto their own response.
export async function createClient(onHeaders?: (headers: Record<string, string>) => void) {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list, headers) {
        onHeaders?.(headers)
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Middleware refreshes sessions when called from a Server Component.
        }
      },
    },
  })
}
