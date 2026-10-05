import { NextResponse } from 'next/server'
import { GCAL_COOKIE, GCAL_COOKIE_OPTIONS, sealConnection } from '@/lib/google-session'
import { safeNext } from '@/lib/safe-next'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  if (code) {
    let cacheHeaders: Record<string, string> = {}
    const supabase = await createClient((headers) => { cacheHeaders = headers })
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`)
      Object.entries(cacheHeaders).forEach(([key, value]) => response.headers.set(key, value))
      // Only the calendar connect flow carries a refresh token; ordinary sign-in leaves any cookie alone.
      try {
        const sealed = sealConnection(data.user?.id ?? '', data.session?.provider_refresh_token, process.env.CALENDAR_COOKIE_SECRET)
        if (sealed && data.user?.id) response.cookies.set(GCAL_COOKIE, sealed, GCAL_COOKIE_OPTIONS)
        if (sealed && data.session?.provider_refresh_token) {
          // Supabase stored the Google tokens in its JS-readable session cookie. Rewrite the session now that the
          // refresh token is sealed: a refresh-token grant carries no provider tokens.
          await supabase.auth.refreshSession()
          Object.entries(cacheHeaders).forEach(([key, value]) => response.headers.set(key, value))
        }
      } catch {
        // Never let the calendar cookie break sign-in.
      }
      return response
    }
  }
  return NextResponse.redirect(`${origin}/meetings?auth_error=1`)
}
