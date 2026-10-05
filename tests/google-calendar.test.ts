import { describe, expect, it } from 'vitest'
import {
  CALENDAR_SCOPE, createMeetEvent, GoogleAuthError, listGoogleEvents, parseScheduleInput, refreshAccessToken,
} from '@/lib/google-calendar'

type Call = { url: string; init: RequestInit }
// One response per call; the last one repeats.
function fakeFetch(...responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]
    return new Response(JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
  return { calls, impl }
}
const headersOf = (c: Call) => new Headers(c.init.headers)
const NOW = new Date('2026-10-05T10:00:00.000Z')
const creds = { clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rt-secret' }

describe('refreshAccessToken', () => {
  it('posts the refresh grant as a form and returns the access token', async () => {
    const f = fakeFetch({ status: 200, body: { access_token: 'at-1', expires_in: 3599 } })
    expect(await refreshAccessToken(creds, f.impl)).toBe('at-1')
    expect(f.calls[0].url).toBe('https://oauth2.googleapis.com/token')
    expect(f.calls[0].init.method).toBe('POST')
    expect(headersOf(f.calls[0]).get('content-type')).toBe('application/x-www-form-urlencoded')
    const body = new URLSearchParams(f.calls[0].init.body as string)
    expect(Object.fromEntries(body)).toEqual({
      client_id: 'cid', client_secret: 'csecret', refresh_token: 'rt-secret', grant_type: 'refresh_token',
    })
  })
  it('maps a 400 invalid_grant to GoogleAuthError without leaking the body or tokens', async () => {
    const f = fakeFetch({ status: 400, body: { error: 'invalid_grant', error_description: 'rt-secret revoked' } })
    const error = await refreshAccessToken(creds, f.impl).catch((e) => e)
    expect(error).toBeInstanceOf(GoogleAuthError)
    expect(String(error.message)).not.toContain('rt-secret')
    expect(String(error.message)).not.toContain('invalid_grant')
  })
  it('maps a 401 to GoogleAuthError', async () => {
    const f = fakeFetch({ status: 401, body: {} })
    expect(await refreshAccessToken(creds, f.impl).catch((e) => e)).toBeInstanceOf(GoogleAuthError)
  })
  it('treats a 400 invalid_client as misconfiguration: plain error with the short code only', async () => {
    const f = fakeFetch({ status: 400, body: { error: 'invalid_client', error_description: 'rt-secret csecret' } })
    const error = await refreshAccessToken(creds, f.impl).catch((e) => e)
    expect(error).not.toBeInstanceOf(GoogleAuthError)
    expect(error.message).toBe('Google token request failed (400 invalid_client)')
    expect(String(error.message)).not.toContain('rt-secret')
  })
  it('drops an error code that is not a short lowercase code, and a non-JSON 4xx body', async () => {
    for (const body of [{ error: 'Bad Thing: rt-secret' }, { error: 'a'.repeat(41) }, { error: 5 }]) {
      const error = await refreshAccessToken(creds, fakeFetch({ status: 400, body }).impl).catch((e) => e)
      expect(error).not.toBeInstanceOf(GoogleAuthError)
      expect(error.message).toBe('Google token request failed (400)')
    }
    const html = (async () => new Response('<html>rt-secret</html>', { status: 400 })) as unknown as typeof fetch
    const error = await refreshAccessToken(creds, html).catch((e) => e)
    expect(error).not.toBeInstanceOf(GoogleAuthError)
    expect(error.message).toBe('Google token request failed (400)')
  })
  it('throws a plain error on a 503 with no token text', async () => {
    const f = fakeFetch({ status: 503, body: { error: 'rt-secret' } })
    const error = await refreshAccessToken(creds, f.impl).catch((e) => e)
    expect(error).not.toBeInstanceOf(GoogleAuthError)
    expect(error.message).toBe('Google token request failed (503)')
    expect(String(error.message)).not.toContain('rt-secret')
  })
  it('throws a plain error on a network failure', async () => {
    const impl = (async () => { throw new TypeError('connect ECONNREFUSED rt-secret') }) as unknown as typeof fetch
    const error = await refreshAccessToken(creds, impl).catch((e) => e)
    expect(error).not.toBeInstanceOf(GoogleAuthError)
    expect(String(error.message)).not.toContain('rt-secret')
  })
})

describe('listGoogleEvents', () => {
  const items = [
    { id: 'e1', summary: 'Standup', status: 'confirmed', start: { dateTime: '2026-10-06T09:00:00Z' }, end: { dateTime: '2026-10-06T09:30:00Z' },
      hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc', htmlLink: 'https://calendar.google.com/e1', attendees: [{ email: 'a@x.com' }, { email: 'b@x.com' }] },
    { id: 'e2', summary: 'Holiday', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } },
    { id: 'e3', summary: 'Gone', status: 'cancelled', start: { dateTime: '2026-10-06T11:00:00Z' }, end: { dateTime: '2026-10-06T12:00:00Z' } },
    { id: 'e4', start: { dateTime: '2026-10-06T13:00:00Z' }, end: { dateTime: '2026-10-06T14:00:00Z' },
      conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1' }, { entryPointType: 'video', uri: 'https://meet.google.com/zzz' }] } },
  ]
  it('sends the right query and bearer header', async () => {
    const f = fakeFetch({ status: 200, body: { items: [] } })
    await listGoogleEvents('tok', NOW, f.impl)
    const url = new URL(f.calls[0].url)
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      timeMin: '2026-10-05T10:00:00.000Z', singleEvents: 'true', orderBy: 'startTime', maxResults: '25',
    })
    expect(headersOf(f.calls[0]).get('authorization')).toBe('Bearer tok')
  })
  it('honours max', async () => {
    const f = fakeFetch({ status: 200, body: {} })
    expect(await listGoogleEvents('tok', NOW, f.impl, 5)).toEqual([])
    expect(new URL(f.calls[0].url).searchParams.get('maxResults')).toBe('5')
  })
  it('maps timed, all-day, no-title and Meet link events, and skips cancelled ones', async () => {
    const f = fakeFetch({ status: 200, body: { items } })
    expect(await listGoogleEvents('tok', NOW, f.impl)).toEqual([
      { id: 'e1', title: 'Standup', start: '2026-10-06T09:00:00Z', end: '2026-10-06T09:30:00Z', allDay: false,
        meetUrl: 'https://meet.google.com/aaa-bbbb-ccc', htmlLink: 'https://calendar.google.com/e1', attendees: 2 },
      { id: 'e2', title: 'Holiday', start: '2026-10-07', end: '2026-10-08', allDay: true, meetUrl: null, htmlLink: null, attendees: 0 },
      { id: 'e4', title: '(No title)', start: '2026-10-06T13:00:00Z', end: '2026-10-06T14:00:00Z', allDay: false,
        meetUrl: 'https://meet.google.com/zzz', htmlLink: null, attendees: 0 },
    ])
  })
  it('maps 401 and an auth-reason 403 to GoogleAuthError', async () => {
    for (const [status, body] of [
      [401, { error: 'tok' }],
      [403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }],
      [403, { error: { errors: [{ reason: 'authError' }] } }],
    ] as const) {
      const f = fakeFetch({ status, body })
      const error = await listGoogleEvents('tok', NOW, f.impl).catch((e) => e)
      expect(error).toBeInstanceOf(GoogleAuthError)
    }
  })
  it('treats other 403s (API not enabled, rate limit, no body) as a plain error', async () => {
    for (const body of [{ error: { errors: [{ reason: 'accessNotConfigured', message: 'tok' }] } }, {}, 'nope']) {
      const f = fakeFetch({ status: 403, body })
      const error = await listGoogleEvents('tok', NOW, f.impl).catch((e) => e)
      expect(error).not.toBeInstanceOf(GoogleAuthError)
      expect(error.message).toBe('Google Calendar request failed (403)')
    }
  })
  it('throws a generic error, not a parser snippet, for a 200 with a non-JSON body', async () => {
    const impl = (async () => new Response('<html>proxy-secret-page</html>', { status: 200 })) as unknown as typeof fetch
    const error = await listGoogleEvents('tok', NOW, impl).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(GoogleAuthError)
    expect(error.message).toBe('Google Calendar request failed (bad response)')
    expect(error.message).not.toContain('proxy-secret')
  })
  it('throws a plain error with the status on other failures', async () => {
    const f = fakeFetch({ status: 500, body: 'oops' })
    const error = await listGoogleEvents('tok', NOW, f.impl).catch((e) => e)
    expect(error).not.toBeInstanceOf(GoogleAuthError)
    expect(error.message).toBe('Google Calendar request failed (500)')
  })
})

describe('createMeetEvent', () => {
  const input = { title: 'Kickoff', start: '2026-10-06T09:00:00.000Z', durationMin: 30, attendees: ['a@x.com'] }
  const created = {
    id: 'n1', summary: 'Kickoff', start: { dateTime: '2026-10-06T09:00:00Z' }, end: { dateTime: '2026-10-06T09:30:00Z' },
    hangoutLink: 'https://meet.google.com/new', htmlLink: 'https://calendar.google.com/n1', attendees: [{ email: 'a@x.com' }],
  }
  const noSleep = async () => {}
  it('sends the exact body with attendees and sendUpdates=all', async () => {
    const f = fakeFetch({ status: 200, body: created })
    const ev = await createMeetEvent('tok', input, 'req-1', f.impl, noSleep)
    const url = new URL(f.calls[0].url)
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(Object.fromEntries(url.searchParams)).toEqual({ conferenceDataVersion: '1', sendUpdates: 'all' })
    expect(f.calls[0].init.method).toBe('POST')
    expect(headersOf(f.calls[0]).get('authorization')).toBe('Bearer tok')
    expect(headersOf(f.calls[0]).get('content-type')).toBe('application/json')
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({
      summary: 'Kickoff',
      start: { dateTime: '2026-10-06T09:00:00.000Z' },
      end: { dateTime: '2026-10-06T09:30:00.000Z' },
      attendees: [{ email: 'a@x.com' }],
      conferenceData: { createRequest: { requestId: 'req-1', conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    })
    expect(ev).toEqual({
      id: 'n1', title: 'Kickoff', start: '2026-10-06T09:00:00Z', end: '2026-10-06T09:30:00Z', allDay: false,
      meetUrl: 'https://meet.google.com/new', htmlLink: 'https://calendar.google.com/n1', attendees: 1,
    })
  })
  it('omits attendees and sends sendUpdates=none when there are none', async () => {
    const f = fakeFetch({ status: 200, body: created })
    await createMeetEvent('tok', { ...input, attendees: [] }, 'req-2', f.impl, noSleep)
    expect(new URL(f.calls[0].url).searchParams.get('sendUpdates')).toBe('none')
    expect(JSON.parse(f.calls[0].init.body as string)).not.toHaveProperty('attendees')
  })
  it('polls while the conference is pending and stops when the link appears', async () => {
    const pending = { ...created, hangoutLink: undefined, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }
    const f = fakeFetch({ status: 200, body: pending }, { status: 200, body: pending }, { status: 200, body: created })
    const sleeps: number[] = []
    const ev = await createMeetEvent('tok', input, 'req-3', f.impl, async (ms) => { sleeps.push(ms) })
    expect(sleeps).toEqual([700, 700])
    expect(f.calls).toHaveLength(3)
    expect(f.calls[1].url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events/n1?conferenceDataVersion=1')
    expect(f.calls[1].init.method ?? 'GET').toBe('GET')
    expect(headersOf(f.calls[1]).get('authorization')).toBe('Bearer tok')
    expect(ev.meetUrl).toBe('https://meet.google.com/new')
  })
  it('returns meetUrl null after three polls without a link', async () => {
    const pending = { ...created, hangoutLink: undefined, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }
    const f = fakeFetch({ status: 200, body: pending })
    const sleeps: number[] = []
    const ev = await createMeetEvent('tok', input, 'req-4', f.impl, async (ms) => { sleeps.push(ms) })
    expect(sleeps).toEqual([700, 700, 700])
    expect(f.calls).toHaveLength(4)
    expect(ev.meetUrl).toBeNull()
    expect(ev.id).toBe('n1')
  })
  const pendingEv = { ...created, hangoutLink: undefined, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }
  it('also polls when the pending status is a plain string', async () => {
    const f = fakeFetch({ status: 200, body: { ...pendingEv, conferenceData: { createRequest: { status: 'pending' } } } }, { status: 200, body: created })
    const ev = await createMeetEvent('tok', input, 'req-5', f.impl, noSleep)
    expect(f.calls).toHaveLength(2)
    expect(ev.meetUrl).toBe('https://meet.google.com/new')
  })
  it('encodes the event id in the poll URL', async () => {
    const f = fakeFetch({ status: 200, body: { ...pendingEv, id: 'a/b' } }, { status: 200, body: created })
    await createMeetEvent('tok', input, 'req-6', f.impl, noSleep)
    expect(f.calls[1].url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events/a%2Fb?conferenceDataVersion=1')
  })
  it('keeps the created event with meetUrl null when a poll fails with a non-auth error', async () => {
    const f = fakeFetch({ status: 200, body: pendingEv }, { status: 500, body: {} })
    const ev = await createMeetEvent('tok', input, 'req-7', f.impl, noSleep)
    expect(ev.id).toBe('n1')
    expect(ev.meetUrl).toBeNull()
    expect(f.calls).toHaveLength(2)
    const net = (async (url: string) => {
      if (url.includes('/n1')) throw new TypeError('boom')
      return new Response(JSON.stringify(pendingEv), { status: 200 })
    }) as unknown as typeof fetch
    expect((await createMeetEvent('tok', input, 'req-8', net, noSleep)).meetUrl).toBeNull()
  })
  it('lets a GoogleAuthError from a poll propagate', async () => {
    const f = fakeFetch({ status: 200, body: pendingEv }, { status: 401, body: {} })
    expect(await createMeetEvent('tok', input, 'r', f.impl, noSleep).catch((e) => e)).toBeInstanceOf(GoogleAuthError)
  })
  it('throws a bad-response error for a null body or one without an id', async () => {
    for (const body of [null, {}, { summary: 'x' }]) {
      const f = fakeFetch({ status: 200, body })
      const error = await createMeetEvent('tok', input, 'r', f.impl, noSleep).catch((e) => e)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Google Calendar request failed (bad response)')
    }
  })
  it('passes an abort signal on every fetch', async () => {
    const f = fakeFetch({ status: 200, body: pendingEv }, { status: 200, body: created })
    await createMeetEvent('tok', input, 'r', f.impl, noSleep)
    const l = fakeFetch({ status: 200, body: { items: [] } })
    await listGoogleEvents('tok', NOW, l.impl)
    const t = fakeFetch({ status: 200, body: { access_token: 'a' } })
    await refreshAccessToken(creds, t.impl)
    for (const c of [...f.calls, ...l.calls, ...t.calls]) expect(c.init.signal).toBeInstanceOf(AbortSignal)
  })
  it('maps 401 and an insufficientPermissions 403 to GoogleAuthError, other 403s and failures to a plain error', async () => {
    for (const [status, body] of [[401, {}], [403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }]] as const) {
      const f = fakeFetch({ status, body })
      expect(await createMeetEvent('tok', input, 'r', f.impl, noSleep).catch((e) => e)).toBeInstanceOf(GoogleAuthError)
    }
    const nc = fakeFetch({ status: 403, body: { error: { errors: [{ reason: 'accessNotConfigured' }] } } })
    const ncError = await createMeetEvent('tok', input, 'r', nc.impl, noSleep).catch((e) => e)
    expect(ncError).not.toBeInstanceOf(GoogleAuthError)
    expect(ncError.message).toBe('Google Calendar request failed (403)')
    const f = fakeFetch({ status: 500, body: {} })
    const error = await createMeetEvent('tok', input, 'r', f.impl, noSleep).catch((e) => e)
    expect(error).not.toBeInstanceOf(GoogleAuthError)
    expect(error.message).toBe('Google Calendar request failed (500)')
  })
})

describe('parseScheduleInput', () => {
  const valid = { title: '  Kickoff ', start: '2026-10-06T09:00:00+01:00', durationMin: 30, attendees: [' A@X.com ', 'a@x.com', 'b@y.org'] }
  const bad = (patch: Record<string, unknown>) => parseScheduleInput({ ...valid, ...patch }, NOW)
  it('accepts a valid input and normalises it', () => {
    expect(parseScheduleInput(valid, NOW)).toEqual({
      ok: true,
      value: { title: 'Kickoff', start: '2026-10-06T08:00:00.000Z', durationMin: 30, attendees: ['a@x.com', 'b@y.org'] },
    })
  })
  it('allows a start up to 60 seconds before now but not more', () => {
    expect(bad({ start: '2026-10-05T09:59:00Z' }).ok).toBe(true)
    expect(bad({ start: '2026-10-05T09:58:59Z' }).ok).toBe(false)
  })
  it('treats attendees as optional and accepts a start equal to now', () => {
    expect(parseScheduleInput({ title: 't', start: NOW.toISOString(), durationMin: 5 }, NOW)).toEqual({
      ok: true, value: { title: 't', start: NOW.toISOString(), durationMin: 5, attendees: [] },
    })
  })
  it('rejects bad titles', () => {
    for (const title of ['', '   ', 'x'.repeat(201), 5]) {
      expect(bad({ title })).toEqual({ ok: false, error: 'Add a title (up to 200 characters).' })
    }
    expect(bad({ title: 'x'.repeat(200) }).ok).toBe(true)
  })
  it('rejects a past or unparsable start', () => {
    expect(bad({ start: '2026-10-05T09:00:00Z' })).toEqual({ ok: false, error: 'The start time is in the past.' })
    for (const start of ['not a date', '', 7]) {
      expect(bad({ start })).toEqual({ ok: false, error: 'Pick a valid start time.' })
    }
  })
  it('rejects durations outside 5 to 480 or non-integer', () => {
    for (const durationMin of [4, 481, 30.5, '30', null]) {
      expect(bad({ durationMin })).toEqual({ ok: false, error: 'Choose a duration between 5 and 480 minutes.' })
    }
    expect(bad({ durationMin: 480 }).ok).toBe(true)
  })
  it('rejects a bad email, a non-array and more than 20 attendees', () => {
    for (const attendees of [['nope'], ['a@b'], [3]]) {
      expect(bad({ attendees })).toEqual({ ok: false, error: 'Check the email addresses: one looks invalid.' })
    }
    expect(bad({ attendees: 'a@x.com' })).toEqual({ ok: false, error: 'You can invite up to 20 people.' })
    const many = Array.from({ length: 21 }, (_, i) => `u${i}@x.com`)
    expect(bad({ attendees: many })).toEqual({ ok: false, error: 'You can invite up to 20 people.' })
    expect(bad({ attendees: many.slice(0, 20) }).ok).toBe(true)
  })
  it('rejects non-object input without throwing', () => {
    for (const raw of [null, undefined, 'x', 5, []]) expect(parseScheduleInput(raw, NOW).ok).toBe(false)
  })
  it('exposes the exact scope', () => {
    expect(CALENDAR_SCOPE).toBe('https://www.googleapis.com/auth/calendar.events')
  })
})
