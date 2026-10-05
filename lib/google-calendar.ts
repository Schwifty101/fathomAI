// Minimal Google Calendar client over plain fetch. No next/* or node:* imports: CALENDAR_SCOPE is also
// bundled into the browser. Error messages never carry a response body or a token.
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const TIMEOUT_MS = 20_000

export type CalEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean
  meetUrl: string | null; htmlLink: string | null; attendees: number
}
export type ScheduleInput = { title: string; start: string; durationMin: number; attendees: string[] }

/** Google rejected the access token or the refresh token. */
export class GoogleAuthError extends Error {}

export async function refreshAccessToken(
  creds: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error('Google token request failed (network)')
  }
  if (res.status >= 400 && res.status < 500) throw new GoogleAuthError(`Google rejected the token request (${res.status})`)
  if (!res.ok) throw new Error(`Google token request failed (${res.status})`)
  const token = ((await res.json().catch(() => null)) as { access_token?: unknown } | null)?.access_token
  if (typeof token !== 'string' || !token) throw new Error('Google token request failed (no access token)')
  return token
}

type RawEvent = any

function mapEvent(e: RawEvent): CalEvent {
  const allDay = Boolean(e.start?.date)
  const video = (e.conferenceData?.entryPoints ?? []).find((p: RawEvent) => p?.entryPointType === 'video')
  return {
    id: String(e.id ?? ''),
    title: e.summary || '(No title)',
    start: allDay ? e.start.date : e.start?.dateTime ?? '',
    end: allDay ? e.end?.date ?? e.start.date : e.end?.dateTime ?? '',
    allDay,
    meetUrl: e.hangoutLink || video?.uri || null,
    htmlLink: e.htmlLink ?? null,
    attendees: Array.isArray(e.attendees) ? e.attendees.length : 0,
  }
}

async function calendarJson(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<RawEvent> {
  let res: Response
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new Error('Google Calendar request failed (network)')
  }
  if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`Google rejected the access token (${res.status})`)
  if (!res.ok) throw new Error(`Google Calendar request failed (${res.status})`)
  return res.json()
}

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` })

export async function listGoogleEvents(
  accessToken: string, now: Date, fetchImpl: typeof fetch = fetch, max = 25,
): Promise<CalEvent[]> {
  const qs = new URLSearchParams({
    timeMin: now.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: String(max),
  })
  const data = await calendarJson(`${EVENTS_URL}?${qs}`, { headers: bearer(accessToken) }, fetchImpl)
  return ((data?.items ?? []) as RawEvent[]).filter((e) => e.status !== 'cancelled').map(mapEvent)
}

export async function createMeetEvent(
  accessToken: string,
  input: ScheduleInput,
  requestId: string,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<CalEvent> {
  const start = new Date(input.start)
  const body = {
    summary: input.title,
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + input.durationMin * 60_000).toISOString() },
    ...(input.attendees.length > 0 && { attendees: input.attendees.map((email) => ({ email })) }),
    conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
  }
  const sendUpdates = input.attendees.length > 0 ? 'all' : 'none'
  let raw = await calendarJson(
    `${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=${sendUpdates}`,
    { method: 'POST', headers: { ...bearer(accessToken), 'content-type': 'application/json' }, body: JSON.stringify(body) },
    fetchImpl,
  )
  // The conference is created asynchronously; poll briefly while Google says it is pending.
  const pending = (r: RawEvent) => {
    const s = r?.conferenceData?.createRequest?.status
    return (typeof s === 'string' ? s : s?.statusCode) === 'pending'
  }
  const hasLink = (r: RawEvent) => Boolean(mapEvent(r).meetUrl)
  for (let i = 0; i < 3 && !hasLink(raw) && pending(raw); i++) {
    await sleep(700)
    raw = await calendarJson(
      `${EVENTS_URL}/${encodeURIComponent(raw.id)}?conferenceDataVersion=1`, { headers: bearer(accessToken) }, fetchImpl,
    )
  }
  return mapEvent(raw)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseScheduleInput(
  raw: unknown, now: Date,
): { ok: true; value: ScheduleInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('Request body must be an object')
  const o = raw as Record<string, unknown>

  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (title.length < 1 || title.length > 200) return fail('title must be 1 to 200 characters')

  const startMs = typeof o.start === 'string' && o.start.trim() ? new Date(o.start).getTime() : NaN
  if (Number.isNaN(startMs)) return fail('start must be a valid date and time')
  if (startMs < now.getTime()) return fail('start must not be in the past')

  const d = o.durationMin
  if (typeof d !== 'number' || !Number.isInteger(d) || d < 5 || d > 480) return fail('durationMin must be a whole number from 5 to 480')

  const list = o.attendees ?? []
  if (!Array.isArray(list) || list.length > 20) return fail('attendees must be a list of at most 20 email addresses')
  const attendees: string[] = []
  for (const a of list) {
    const email = typeof a === 'string' ? a.trim().toLowerCase() : ''
    if (!EMAIL.test(email)) return fail('attendees must all be valid email addresses')
    if (!attendees.includes(email)) attendees.push(email)
  }
  return { ok: true, value: { title, start: new Date(startMs).toISOString(), durationMin: d, attendees } }
}
