import { cookies } from 'next/headers'
import { CalendarConnect, type CalendarConnectProps } from '@/components/CalendarConnect'
import { getUser } from '@/lib/auth'
import { GoogleAuthError, listGoogleEvents } from '@/lib/google-calendar'
import { accessTokenFor, GCAL_COOKIE } from '@/lib/google-session'
import { listUpcoming } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

const UNAVAILABLE = 'Google Calendar is unavailable right now.'

export default async function CalendarPage() {
  const db = await createClient()
  const [user, demoEvents, jar] = await Promise.all([getUser(db), listUpcoming(db), cookies()])

  const revoked: CalendarConnectProps = { mode: 'demo', demoEvents, signedIn: true, revoked: true }
  let props: CalendarConnectProps = { mode: 'demo', demoEvents, signedIn: Boolean(user), revoked: false }
  if (user) {
    // accessTokenFor only throws once a cookie exists and the token refresh failed for a non-auth reason.
    const access = await accessTokenFor(jar.get(GCAL_COOKIE)?.value, user.id, {
      secret: process.env.CALENDAR_COOKIE_SECRET,
      clientId: process.env.GAUTH_CLIENT_ID,
      clientSecret: process.env.GAUTH_CLIENT_SECRET,
    }).catch(() => null)
    if (access === null) {
      props = { mode: 'google', events: [], loadError: UNAVAILABLE }
    } else if (access.status === 'revoked') {
      props = revoked
    } else if (access.status === 'ok') {
      try {
        props = { mode: 'google', events: await listGoogleEvents(access.token, new Date()) }
      } catch (e) {
        props = e instanceof GoogleAuthError ? revoked : { mode: 'google', events: [], loadError: UNAVAILABLE }
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <CalendarConnect {...props} />
    </div>
  )
}
