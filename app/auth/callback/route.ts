import { NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-next'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  if (code) {
    let cacheHeaders: Record<string, string> = {}
    const supabase = await createClient((headers) => { cacheHeaders = headers })
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`)
      Object.entries(cacheHeaders).forEach(([key, value]) => response.headers.set(key, value))
      return response
    }
  }
  return NextResponse.redirect(`${origin}/meetings?auth_error=1`)
}
