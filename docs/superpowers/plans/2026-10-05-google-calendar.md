# Google Calendar integration

Spec (none separate; this is the contract): a signed-in visitor can press "Connect Google Calendar" on `/calendar`, grant the calendar scope, see their real upcoming events, and schedule a call that gets a real Google Meet link. The recording bot stays simulated (README table). Decisions by the user: the refresh token lives in a sealed httpOnly cookie (no DB, no migration); calendar access is opt-in via a button, ordinary sign-in is unchanged.

## Global Constraints

- Next.js 15 App Router, React 19, TypeScript, Tailwind 4. **No new dependencies.** Plain `fetch` and `node:crypto`.
- Tests first: write the failing test, see it fail, then implement. Vitest runs in the node environment with a `tests/**/*.test.ts` include pattern only (no `.tsx` tests, no jsdom). Render components with `createElement` plus `renderToStaticMarkup`.
- `npm test`, `npm run typecheck` and `npm run build` must stay green. Run the focused test while iterating and the full suite once before committing.
- Stage explicit paths only. Never `git add -A` or `git add .`. Commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Never print, log or paste a secret value. Env names: `GAUTH_CLIENT_ID`, `GAUTH_CLIENT_SECRET` (Google OAuth client), `CALENDAR_COOKIE_SECRET` (any string of 32 or more characters, used to seal the cookie). Do not read or print `.env.local`.
- Do not change `middleware.ts` or `lib/auth.ts`. In `lib/supabase/**` only the one addition named in Task 3. Do not touch the database or Supabase settings; there is no migration.
- Scope string, exactly: `https://www.googleapis.com/auth/calendar.events`. It covers both `events.list` and `events.insert` (verified against Google's reference pages).
- Meet link creation, exactly as Google documents it: `POST https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1` with `conferenceData.createRequest = { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } }`. The conference is created asynchronously: `createRequest.status` starts as `pending`.
- Google returns a refresh token only when the authorisation request carries `access_type=offline` and `prompt=consent`. Supabase exposes `provider_token` and `provider_refresh_token` only on the session returned by `exchangeCodeForSession`, once, and does not store or refresh them.
- All displayed times are UTC (project rule). Prose and comments: British English, no em dashes.
- Cookie name: `fathom_gcal`. The cookie must be bound to the Supabase user id so a different user in the same browser cannot use it.

## Tasks

### Task 1: Token sealing (`lib/token-seal.ts`)

Files: create `lib/token-seal.ts`, `tests/token-seal.test.ts`.

Interface:

```ts
export function sealToken(plain: string, secret: string): string
export function unsealToken(sealed: string, secret: string): string | null
```

- AES-256-GCM from `node:crypto`. Key is the SHA-256 of `secret`. 12-byte random IV. Output is `base64url(iv | authTag | ciphertext)`.
- `sealToken` throws `Error('secret must be at least 32 characters')` when `secret.length < 32`. `unsealToken` never throws: any failure (wrong secret, tampered bytes, garbage, too short, secret under 32 characters) returns `null`.

Tests (all required): round trip returns the plaintext; sealing the same text twice gives different strings; flipping one character of the sealed string returns `null`; a different secret returns `null`; a 31-character secret makes `sealToken` throw and `unsealToken` return `null`; `unsealToken('', s)` and `unsealToken('not base64 !!', s)` return `null`; a plaintext containing unicode round-trips.

### Task 2: Google Calendar client and input parsing (`lib/google-calendar.ts`)

Files: create `lib/google-calendar.ts`, `tests/google-calendar.test.ts`.

Interface (exact names):

```ts
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
export type CalEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean
  meetUrl: string | null; htmlLink: string | null; attendees: number
}
export class GoogleAuthError extends Error {}   // Google rejected the token or refresh token
export async function refreshAccessToken(
  creds: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl?: typeof fetch,
): Promise<string>
export async function listGoogleEvents(accessToken: string, now: Date, fetchImpl?: typeof fetch, max?: number): Promise<CalEvent[]>
export async function createMeetEvent(
  accessToken: string,
  input: { title: string; start: string; durationMin: number; attendees: string[] },
  requestId: string,
  fetchImpl?: typeof fetch,
  sleep?: (ms: number) => Promise<void>,
): Promise<CalEvent>
export type ScheduleInput = { title: string; start: string; durationMin: number; attendees: string[] }
export function parseScheduleInput(raw: unknown, now: Date): { ok: true; value: ScheduleInput } | { ok: false; error: string }
```

Behaviour:

- `refreshAccessToken`: `POST https://oauth2.googleapis.com/token`, `content-type: application/x-www-form-urlencoded`, body `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token`. Returns `access_token`. Any 4xx response throws `GoogleAuthError`; a 5xx or network failure throws a plain `Error('Google token request failed (<status>)')`. Error messages never contain the response body or any token.
- `listGoogleEvents`: `GET https://www.googleapis.com/calendar/v3/calendars/primary/events` with query `timeMin=<now ISO>`, `singleEvents=true`, `orderBy=startTime`, `maxResults=<max, default 25>`, header `authorization: Bearer <token>`. 401 and 403 throw `GoogleAuthError`; other non-OK throws `Error('Google Calendar request failed (<status>)')`. Skips events with `status: 'cancelled'`. Maps each event: `title` is `summary` or `'(No title)'`; all-day events have `start.date` (then `allDay: true`, `start` and `end` are the date strings); timed events use `start.dateTime` and `end.dateTime`; `meetUrl` is `hangoutLink`, else the `uri` of the first `conferenceData.entryPoints` item whose `entryPointType` is `video`, else `null`; `attendees` is the length of `attendees` or 0; `htmlLink` as given or `null`.
- `createMeetEvent`: `POST .../events?conferenceDataVersion=1&sendUpdates=<all|none>`, `sendUpdates=all` only when `attendees.length > 0`. Body: `summary`, `start: { dateTime: <ISO> }`, `end: { dateTime: <start + durationMin> ISO }`, `attendees: [{ email }]` (omit the key when empty), `conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }`. If the response has no Meet link and `conferenceData.createRequest.status` is `pending`, poll `GET .../events/<id>?conferenceDataVersion=1` up to 3 times, calling `sleep(700)` before each, stopping when a link appears. If there is still no link, return the event with `meetUrl: null` (not an error). 401/403 throws `GoogleAuthError`; other non-OK throws `Error('Google Calendar request failed (<status>)')`. `sleep` defaults to a real timeout.
- `parseScheduleInput(raw, now)`: `raw` is an object with `title` (string, trimmed, 1 to 200 chars), `start` (string; must parse as a date and be at least `now`; returned as `new Date(start).toISOString()`), `durationMin` (integer 5 to 480), `attendees` (optional array of strings; each trimmed, lower-cased, must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, de-duplicated, at most 20). Returns `{ ok: false, error }` with a short human message for the first problem (messages mention the field name). Never throws.

Tests (all required), using a fake `fetch` that records calls: refresh success and the exact request body fields; refresh 400 gives `GoogleAuthError`, 503 gives a plain error whose message has no token text; list maps a timed event, an all-day event, a cancelled event (skipped), a Meet link from `hangoutLink` and from `entryPoints`, and no-title; list sends the right query and bearer header; list 401 gives `GoogleAuthError`; create sends the exact body (with and without attendees, `sendUpdates` value), returns the mapped event; create polls when `pending` (fake sleep records two calls, link found on the second poll) and returns `meetUrl: null` after three polls without a link; `parseScheduleInput` accepts a valid input and normalises it (trim, lower-case, de-dupe), and rejects: empty title, 201-character title, past start, unparsable start, duration 4 and 481 and 30.5, a bad email, 21 attendees, non-object input.

### Task 3: Connect flow and cookie binding

Files: create `lib/google-session.ts`, `tests/google-session.test.ts`. Modify `app/auth/callback/route.ts`, `lib/supabase/client.ts` (one new exported function only).

Interface for `lib/google-session.ts` (it must import nothing from `next/*` so tests can load it):

```ts
export const GCAL_COOKIE = 'fathom_gcal'
export const GCAL_COOKIE_OPTIONS: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number }
// secure is true when process.env.NODE_ENV === 'production'; maxAge is 180 days in seconds
export function sealConnection(userId: string, refreshToken: string | null | undefined, secret: string | undefined): string | null
export type Access = { status: 'ok'; token: string } | { status: 'none' } | { status: 'revoked' }
export async function accessTokenFor(
  cookieValue: string | undefined,
  userId: string,
  env: { secret?: string; clientId?: string; clientSecret?: string },
  fetchImpl?: typeof fetch,
): Promise<Access>
```

- `sealConnection` returns `null` when the refresh token or secret is missing or the secret is shorter than 32 characters; otherwise `sealToken(JSON.stringify({ uid: userId, rt: refreshToken }), secret)`.
- `accessTokenFor` returns `none` when the cookie is missing, cannot be unsealed, is not the expected JSON shape, its `uid` differs from `userId`, or any env value is missing. It calls `refreshAccessToken`; success gives `ok`; a `GoogleAuthError` gives `revoked`; any other error propagates.
- In `app/auth/callback/route.ts`, keep the existing behaviour exactly. After a successful `exchangeCodeForSession`, read `data.session?.provider_refresh_token` and `data.user?.id` (the call currently discards `data`; destructure it). If `sealConnection(...)` returns a string, set it on the redirect response with `response.cookies.set(GCAL_COOKIE, value, GCAL_COOKIE_OPTIONS)`. Ordinary sign-in carries no refresh token, so it must leave any existing cookie untouched. Any failure in this extra step must not break sign-in (wrap it so the redirect still happens).
- In `lib/supabase/client.ts` add `export async function connectGoogleCalendar(next: string): Promise<void>`, modelled on `signInWithGoogle` (same `redirectTo`, same toast on failure) but with `options.scopes = CALENDAR_SCOPE` and `options.queryParams = { access_type: 'offline', prompt: 'consent' }`. Do not change `signInWithGoogle`.

Tests (all required): `sealConnection` returns null for missing token, missing secret, short secret; round trip through `accessTokenFor` with a fake fetch returning `{ access_token: 'at' }` gives `{ status: 'ok', token: 'at' }` and the fake saw the right `refresh_token`; a different `userId` gives `none` without calling fetch; garbage cookie gives `none`; missing cookie gives `none`; missing env value gives `none`; fetch returning 400 gives `revoked`; fetch returning 503 rejects.

### Task 4: Calendar page, scheduling and docs

Files: modify `app/calendar/page.tsx`, `components/CalendarConnect.tsx`; create `app/calendar/actions.ts`, `components/ScheduleCallForm.tsx`, `tests/calendar-connect.test.ts`; modify `README.md`, `docs/manual-test-checklist.md`, `docs/superpowers/ledger/continuation-handoff.md`.

Behaviour:

- `app/calendar/page.tsx` (server): get the Supabase client and user (`getUser` from `@/lib/auth`). Read the `fathom_gcal` cookie with `cookies()` from `next/headers`. If there is a user, call `accessTokenFor(cookie, user.id, { secret: process.env.CALENDAR_COOKIE_SECRET, clientId: process.env.GAUTH_CLIENT_ID, clientSecret: process.env.GAUTH_CLIENT_SECRET })`. If `ok`, call `listGoogleEvents(token, new Date())`; a `GoogleAuthError` there counts as `revoked`; any other error becomes `loadError: 'Google Calendar is unavailable right now.'`. Always also load the seeded demo events with the existing `listUpcoming(db)` from `@/lib/queries`. Pass to `CalendarConnect` props: `{ mode: 'google', events: CalEvent[], loadError?: string }` when connected, else `{ mode: 'demo', demoEvents, signedIn: boolean, revoked: boolean }`.
- `components/CalendarConnect.tsx` (client; remove the old localStorage "connected" simulation entirely). Demo mode: heading "Connect your calendar", a short honest line ("Sign in and connect Google Calendar to see your real events and schedule calls with a Google Meet link. Until then, this is a demo schedule."), a primary button "Connect Google Calendar" calling `connectGoogleCalendar(pathname)` from `@/lib/supabase/client` (it signs the visitor in if needed), a note when `revoked` ("Google access was revoked or expired. Connect again."), and the seeded list labelled "Demo schedule". Google mode: heading "Your calendar", the events list (title, UTC start formatted like the existing demo list, an "All day" label, attendee count, a "Join Meet" link opening in a new tab with `rel="noopener noreferrer"` when `meetUrl` exists, an "Open in Google Calendar" link when `htmlLink` exists), an empty state, the `loadError` if any, the note "The Fathom notetaker is simulated in this demo: it does not join the call.", a "Disconnect" button calling the `disconnectCalendar` server action, and `<ScheduleCallForm />`. Keep every interactive control keyboard reachable with visible labels. Use the existing `Button` and `Card` components.
- `components/ScheduleCallForm.tsx` (client): fields title (text, required), start (`<input type="datetime-local">`, labelled "Start (your local time)", converted with `new Date(value).toISOString()` before sending), duration (select 15, 30, 45, 60, 90 minutes, default 30), attendees (text, comma-separated emails, optional, help text says invitees are emailed by Google). Submit calls the `scheduleCall` server action; while pending the button is disabled and reads "Scheduling…". On success show the new event's Meet link (or "Google is still creating the Meet link. Refresh in a moment." if `meetUrl` is null), call `toast` from `@/lib/toast`, then `router.refresh()` and reset the form. On failure show the error text in a `role="alert"` paragraph.
- `app/calendar/actions.ts` (`'use server'`): `scheduleCall(raw: unknown)` and `disconnectCalendar()`. `scheduleCall`: `parseScheduleInput(raw, new Date())`; get user (not signed in returns `{ ok: false, error: 'Sign in to schedule a call.' }`); `accessTokenFor` (not `ok` returns `{ ok: false, error: 'Connect Google Calendar first.' }`); `createMeetEvent(token, value, crypto.randomUUID())`; return `{ ok: true, event }`; a `GoogleAuthError` returns `{ ok: false, error: 'Google access expired. Connect again.' }`; any other error returns `{ ok: false, error: 'Could not schedule the call. Try again.' }`. Never include token text or raw provider bodies in any returned message. `disconnectCalendar`: delete the `fathom_gcal` cookie via `cookies()`, then `revalidatePath('/calendar')`.
- `tests/calendar-connect.test.ts`: render `CalendarConnect` with `createElement` + `renderToStaticMarkup` in demo mode (contains "Connect Google Calendar" and "Demo schedule", no "Disconnect"), demo mode with `revoked: true` (contains the revoked note), google mode with two events (one with a Meet link, one all-day without; contains "Join Meet" exactly once, "All day", "Disconnect", the notetaker-simulated note, and a labelled start field from the form), google mode empty and with `loadError`. Mock nothing that needs a DOM; if a module import breaks under node (for example `next/navigation`), pass what the component needs through props or guard the hook so SSR rendering works.
- Docs: in `README.md` add `GAUTH_CLIENT_ID`, `GAUTH_CLIENT_SECRET` and `CALENDAR_COOKIE_SECRET` to the environment variable list or table (with a one-line purpose each; say the cookie secret is any random string of 32 or more characters), and update the "What is real and what is stubbed" table row for the calendar: real Google Calendar read and Meet scheduling when connected, seeded demo schedule otherwise, recording bot still simulated. In `docs/manual-test-checklist.md` add a short "Google Calendar (GC)" section with items tagged `G` (needs Google sign-in): connect, events appear, schedule a call, Meet link opens, invitee gets an email, disconnect, revoked-access path. In the handoff add one bullet under "Where things stand" and a gate row for the Google Cloud settings the user must make (enable the Google Calendar API, add the `calendar.events` scope on the consent screen, add test users or publish; add the three env vars to Vercel). All unverified items must be labelled unverified.
