'use server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth'
import { createMeetEvent, GoogleAuthError, parseScheduleInput, type CalEvent } from '@/lib/google-calendar'
import { accessTokenFor, GCAL_COOKIE } from '@/lib/google-session'
import { createClient } from '@/lib/supabase/server'

export type ScheduleResult = { ok: true; event: CalEvent } | { ok: false; error: string }

export async function scheduleCall(raw: unknown): Promise<ScheduleResult> {
  const parsed = parseScheduleInput(raw, new Date())
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const user = await getUser(await createClient())
  if (!user) return { ok: false, error: 'Sign in to schedule a call.' }
  try {
    const access = await accessTokenFor((await cookies()).get(GCAL_COOKIE)?.value, user.id, {
      secret: process.env.CALENDAR_COOKIE_SECRET,
      clientId: process.env.GAUTH_CLIENT_ID,
      clientSecret: process.env.GAUTH_CLIENT_SECRET,
    })
    if (access.status === 'revoked') return { ok: false, error: 'Google access expired. Connect again.' }
    if (access.status !== 'ok') return { ok: false, error: 'Connect Google Calendar first.' }
    const event = await createMeetEvent(access.token, parsed.value, crypto.randomUUID())
    // Refreshes the open page so the new event appears in the list without a client-side router call.
    revalidatePath('/calendar')
    return { ok: true, event }
  } catch (e) {
    if (e instanceof GoogleAuthError) return { ok: false, error: 'Google access expired. Connect again.' }
    return { ok: false, error: 'Could not schedule the call. Try again.' }
  }
}

export async function disconnectCalendar(): Promise<void> {
  ;(await cookies()).delete(GCAL_COOKIE)
  revalidatePath('/calendar')
}
