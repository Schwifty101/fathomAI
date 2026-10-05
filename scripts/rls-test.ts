import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { guardTarget } from './guard-target'

// Run after 20261006000000_hardening.sql is applied. Needs the hosted project (auth + PostgREST).
// Privilege-level properties that PostgREST cannot show (TRUNCATE etc.) live in supabase/tests/hardening.sql.
guardTarget()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, serviceKey, opts)
const anonClient = () => createClient(url, anonKey, opts)

let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) {
    failures++
    if (detail !== undefined) console.log('      ', JSON.stringify(detail))
  }
}

type Res = { data?: unknown; error: { code?: string; message?: string } | null }
const nrows = (r: Res) => (Array.isArray(r.data) ? r.data.length : r.data ? 1 : 0)
// The statement must fail with exactly this Postgres code (42501 privilege/RLS, 23514 check, 23505 unique, 23503 FK).
const denied = (name: string, r: Res, code = '42501') => check(name, r.error?.code === code, r)
// RLS filtered the statement away: no error and zero rows touched (callers also re-read the row via admin).
const filtered = (name: string, r: Res) => check(name, !r.error && nrows(r) === 0, r)
// Admin snapshot of rows, to prove a denied/filtered write changed nothing.
const snap = async (table: string, col: string, vals: string[]) =>
  JSON.stringify((await admin.from(table).select('*').in(col, vals).order(col)).data)

async function makeUser(tag: string, userIds: string[]) {
  const email = `rls-${tag}-${Date.now()}@example.test`
  const password = randomUUID()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  userIds.push(data.user.id) // track before sign-in so a sign-in failure still cleans up
  const client = anonClient()
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { id: data.user.id, client }
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const memberId = randomUUID()
  const meetingId = randomUUID()
  const meeting2Id = randomUUID()
  const partId = randomUUID()
  const partPhoneId = randomUUID()
  const partOtherId = randomUUID()
  const part2Id = randomUUID()
  const slug = `rls-test-${suffix}`
  const shareSlug = `rls${suffix}`
  const edgeSlug = `edge${suffix}`
  const askPrompt = `rls-ask-${suffix}`
  const userIds: string[] = []
  const anon = anonClient()

  try {
    const A = await makeUser('a', userIds)
    const B = await makeUser('b', userIds)

    // fixtures via service role
    const must = async (p: PromiseLike<{ error: unknown }>) => {
      const { error } = await p
      if (error) throw error
    }
    await must(admin.from('team_members').insert({ id: memberId, name: 'RLS Tester', role: 'qa', is_demo_user: false }))
    await must(admin.from('meetings').insert([
      { id: meetingId, slug, title: 'RLS fixture', kind: 'standup', platform: 'zoom',
        started_at: new Date().toISOString(), duration_sec: 420, host_id: memberId },
      { id: meeting2Id, slug: `${slug}-2`, title: 'RLS fixture two', kind: 'standup', platform: 'zoom',
        started_at: new Date().toISOString(), duration_sec: 420, host_id: memberId },
    ]))
    // member has two participant rows in meeting 1 (60s + 40s of 200s total) => team_stats talk_pct must be 50
    await must(admin.from('participants').insert([
      { id: partId, meeting_id: meetingId, member_id: memberId, name: 'RLS Tester', role: 'qa', is_internal: true, talk_time_sec: 60 },
      { id: partPhoneId, meeting_id: meetingId, member_id: memberId, name: 'RLS Tester phone', role: 'qa', is_internal: true, talk_time_sec: 40 },
      { id: partOtherId, meeting_id: meetingId, member_id: null, name: 'RLS Other', role: 'x', is_internal: false, talk_time_sec: 100 },
      { id: part2Id, meeting_id: meeting2Id, member_id: null, name: 'RLS Two', role: 'x', is_internal: false },
    ]))
    const seg = (m: string, p: string, idx: number, start_ms: number, end_ms: number, text: string) =>
      ({ id: randomUUID(), meeting_id: m, participant_id: p, idx, start_ms, end_ms, text })
    await must(admin.from('segments').insert([
      seg(meetingId, partId, 0, 0, 10000, 'alpha rollout plan for friday'),
      seg(meetingId, partId, 1, 10000, 20000, `beta budget review next week rlsq${suffix}`),
      seg(meetingId, partId, 2, 400000, 410000, 'gamma wrap up and thanks'),
      seg(meeting2Id, part2Id, 0, 0, 10000, 'zulu secret from the other meeting'),
      // 105 rows matching one term, to prove search_segments caps at 100
      ...Array.from({ length: 105 }, (_, i) => seg(meeting2Id, part2Id, i + 1, 1000 + i * 10, 1005 + i * 10, `capword filler ${i}`)),
    ]))
    const content = { sections: [{ heading: 'H', bullets: ['b'] }] }
    await must(admin.from('summaries').insert([
      { id: randomUUID(), meeting_id: meetingId, template: 'general', content, user_id: null, source: 'seed' },
      { id: randomUUID(), meeting_id: meetingId, template: 'general', content, user_id: A.id, source: 'live' },
    ]))
    const hlSeed = randomUUID(); const hlA = randomUUID()
    await must(admin.from('highlights').insert([
      { id: hlSeed, meeting_id: meetingId, user_id: null, type: 'insight', title: 'seed', start_ms: 0, end_ms: 10000 },
      { id: hlA, meeting_id: meetingId, user_id: A.id, type: 'insight', title: 'mine', start_ms: 0, end_ms: 10000 },
    ]))
    await must(admin.from('shares').insert([
      { slug: shareSlug, meeting_id: meetingId, start_ms: 0, end_ms: 15000, created_by: A.id },
      { slug: edgeSlug, meeting_id: meetingId, start_ms: 10000, end_ms: 20000, created_by: A.id },
    ]))
    await must(admin.from('ai_usage').insert({ user_id: A.id, kind: 'ask' }))

    // 1. anon reads seeded content, cannot write
    const m = await anon.from('meetings').select('id').eq('id', meetingId)
    check('anon can read meetings', !m.error && m.data?.length === 1, m.error)
    const w = await anon.from('meetings').insert({
      id: randomUUID(), slug: 'x', title: 'x', kind: 'standup', platform: 'zoom',
      started_at: new Date().toISOString(), duration_sec: 1, host_id: memberId,
    })
    denied('anon cannot insert meetings (42501)', w)
    const wa = await A.client.from('segments').insert({
      id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 99, start_ms: 1, end_ms: 2, text: 'x',
    })
    denied('authenticated cannot insert segments (42501)', wa)
    const anonHl = await anon.from('highlights').insert({ meeting_id: meetingId, user_id: null, type: 'insight', title: 'anon', start_ms: 0, end_ms: 1000 })
    denied('anon cannot insert highlights (42501)', anonHl)
    const anonSh = await anon.from('shares').insert({ slug: `an${suffix}`, meeting_id: meetingId, start_ms: 0, end_ms: 1000, created_by: A.id })
    denied('anon cannot insert shares (42501)', anonSh)
    const anonSum = await anon.from('summaries').insert({ id: randomUUID(), meeting_id: meetingId, template: 'sales', content, user_id: null, source: 'seed' })
    denied('anon cannot insert summaries (42501)', anonSum)

    // 2. summaries: seed visible to all, live row only to its owner, nobody but service role writes
    const sAnon = await anon.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('anon sees only seeded summary', !sAnon.error && sAnon.data?.length === 1 && sAnon.data[0].user_id === null, sAnon)
    const sA = await A.client.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('user A sees seeded + own summary', !sA.error && sA.data?.length === 2, sA)
    const sB = await B.client.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('user B sees only seeded summary', !sB.error && sB.data?.length === 1, sB)
    const sumBefore = await snap('summaries', 'meeting_id', [meetingId])
    const newContent = { sections: [{ heading: 'tampered', bullets: ['x'] }] }
    denied('A cannot insert a summary (42501)', await A.client.from('summaries').insert({
      id: randomUUID(), meeting_id: meetingId, template: 'sales', content: newContent, user_id: A.id, source: 'live' }))
    denied('A cannot update summaries (42501)', await A.client.from('summaries').update({ content: newContent }).eq('meeting_id', meetingId).select())
    denied('A cannot delete summaries (42501)', await A.client.from('summaries').delete().eq('meeting_id', meetingId).select())
    check('summaries unchanged after A\'s attempts (admin re-read)', (await snap('summaries', 'meeting_id', [meetingId])) === sumBefore)

    // 3. highlights
    const hAnon = await anon.from('highlights').select('id').eq('meeting_id', meetingId)
    check('anon sees only seeded highlight', !hAnon.error && hAnon.data?.length === 1, hAnon)
    const hB = await B.client.from('highlights').select('id').eq('meeting_id', meetingId)
    check("user B cannot see user A's highlight", !hB.error && hB.data?.length === 1 && hB.data[0].id === hlSeed, hB)
    const hl = (user_id: string | null, extra: Record<string, unknown> = {}) => ({
      meeting_id: meetingId, user_id, type: 'insight', title: 'ok', start_ms: 0, end_ms: 1000, ...extra,
    })
    denied('A cannot insert a highlight as B (42501)', await A.client.from('highlights').insert(hl(B.id, { title: 'spoof' })))
    denied('A cannot insert a highlight with user_id null (42501)', await A.client.from('highlights').insert(hl(null, { title: 'forged-null' })))
    const forged = await admin.from('highlights').select('id').in('title', ['spoof', 'forged-null'])
    check('forged highlights were not stored', !forged.error && forged.data?.length === 0, forged)
    const hOwn = await A.client.from('highlights').insert(hl(A.id, { type: 'feedback' })).select('id').single()
    check('A can insert own highlight', !hOwn.error && !!hOwn.data?.id, hOwn.error)

    const hlBefore = await snap('highlights', 'id', [hlSeed, hlA])
    filtered("B cannot update A's highlight (0 rows)", await B.client.from('highlights').update({ title: 'hijack' }).eq('id', hlA).select())
    filtered("B cannot delete A's highlight (0 rows)", await B.client.from('highlights').delete().eq('id', hlA).select())
    filtered('A cannot update a seeded highlight (0 rows)', await A.client.from('highlights').update({ title: 'hijack' }).eq('id', hlSeed).select())
    filtered('A cannot delete a seeded highlight (0 rows)', await A.client.from('highlights').delete().eq('id', hlSeed).select())
    check('highlights unchanged after tampering (admin re-read)', (await snap('highlights', 'id', [hlSeed, hlA])) === hlBefore)

    const hUpdOwn = await A.client.from('highlights').update({ title: 'mine-edited' }).eq('id', hlA).select('title')
    check('A can update own highlight', !hUpdOwn.error && hUpdOwn.data?.length === 1 && hUpdOwn.data[0].title === 'mine-edited', hUpdOwn)
    const hDelOwn = await A.client.from('highlights').delete().eq('id', hOwn.data!.id).select('id')
    const hGone = await admin.from('highlights').select('id').eq('id', hOwn.data!.id)
    check('A can delete own highlight', !hDelOwn.error && hDelOwn.data?.length === 1 && hGone.data?.length === 0, hDelOwn)

    denied('highlight longer than 5 minutes is rejected (23514)', await A.client.from('highlights').insert(hl(A.id, { end_ms: 400000 })), '23514')
    denied('highlight with negative start_ms is rejected (23514)', await A.client.from('highlights').insert(hl(A.id, { start_ms: -1 })), '23514')
    denied('highlight title over 80 chars is rejected (23514)', await A.client.from('highlights').insert(hl(A.id, { title: 't'.repeat(81) })), '23514')
    denied('highlight note over 280 chars is rejected (23514)', await A.client.from('highlights').insert(hl(A.id, { note: 'n'.repeat(281) })), '23514')

    // 4. ai_usage is service-role only
    denied('ai_usage not readable by clients (42501)', await A.client.from('ai_usage').select('id'))
    denied('ai_usage not writable by clients (42501)', await A.client.from('ai_usage').insert({ user_id: A.id, kind: 'ask' }))
    denied('ai_usage not readable by anon (42501)', await anon.from('ai_usage').select('id'))
    const usage = await admin.from('ai_usage').select('id').eq('user_id', A.id)
    check('ai_usage still has exactly the fixture row', !usage.error && usage.data?.length === 1, usage)

    // 5. shares
    denied('anon cannot list shares (42501)', await anon.from('shares').select('slug'))
    const shA = await A.client.from('shares').select('slug').eq('slug', shareSlug)
    check('creator sees own share', !shA.error && shA.data?.length === 1, shA)
    const shB = await B.client.from('shares').select('slug').eq('slug', shareSlug)
    check("B cannot see A's share", !shB.error && shB.data?.length === 0, shB)
    const shIns = (s: string, start_ms: number, end_ms: number, extra: Record<string, unknown> = {}) =>
      A.client.from('shares').insert({ slug: s, meeting_id: meetingId, start_ms, end_ms, created_by: A.id, ...extra })
    denied('A cannot create a share as B (42501)', await shIns(`sp${suffix}`, 0, 1000, { created_by: B.id }))
    check('A can create a share with a valid 5 minute window', !(await shIns(`ok${suffix}`, 0, 300000)).error)
    denied('share of 300001 ms is rejected (23514)', await shIns(`lg${suffix}`, 0, 300001), '23514')
    denied('share with end = start is rejected (23514)', await shIns(`bd${suffix}`, 5000, 5000), '23514')
    denied('share with end < start is rejected (23514)', await shIns(`rv${suffix}`, 5000, 1000), '23514')
    denied('share with negative start_ms is rejected (23514)', await shIns(`ng${suffix}`, -1, 1000), '23514')
    denied('share with a bad slug is rejected (23514)', await shIns(`Bad_${suffix}`, 0, 1000), '23514')
    denied('duplicate share slug is rejected (23505)', await shIns(shareSlug, 0, 1000), '23505')
    denied('share on a nonexistent meeting is rejected (23503)', await shIns(`gh${suffix}`, 0, 1000, { meeting_id: randomUUID() }), '23503')
    const shStored = await admin.from('shares').select('slug').in('slug', [
      `lg${suffix}`, `bd${suffix}`, `rv${suffix}`, `ng${suffix}`, `Bad_${suffix}`, `gh${suffix}`, `sp${suffix}`, `an${suffix}`])
    check('rejected shares were not stored', !shStored.error && shStored.data?.length === 0, shStored)

    const shBefore = await snap('shares', 'slug', [shareSlug])
    denied('shares has no UPDATE path (42501)', await A.client.from('shares').update({ end_ms: 16000 }).eq('slug', shareSlug).select())
    filtered("B cannot delete A's share (0 rows)", await B.client.from('shares').delete().eq('slug', shareSlug).select())
    check('share unchanged after update/delete attempts (admin re-read)', (await snap('shares', 'slug', [shareSlug])) === shBefore && shBefore !== '[]')
    const shDel = await A.client.from('shares').delete().eq('slug', `ok${suffix}`).select('slug')
    const shGone = await admin.from('shares').select('slug').eq('slug', `ok${suffix}`)
    check('A can delete own share', !shDel.error && shDel.data?.length === 1 && shGone.data?.length === 0, shDel)

    // 6. get_clip: only the window, window boundaries, no leakage from other meetings, no sharer identity
    const clip = await anon.rpc('get_clip', { p_slug: shareSlug })
    const segs = (clip.data?.segments ?? []) as { idx: number }[]
    check('get_clip returns only in-window segments', !clip.error && segs.length === 2 && segs.every((s) => s.idx < 2), clip)
    check('get_clip hides sharer identity', Boolean(clip.data) && !('created_by' in clip.data) && !JSON.stringify(clip.data).includes(A.id), clip.data)
    check('get_clip has no text from another meeting', !JSON.stringify(clip.data).includes('zulu'), clip.data)
    const edge = await anon.rpc('get_clip', { p_slug: edgeSlug }) // window 10000..20000 touches segment 0 (ends at 10000) and 2 (starts later)
    const edgeSegs = (edge.data?.segments ?? []) as { idx: number }[]
    check('get_clip boundary: touching-only segments are excluded', !edge.error && edgeSegs.length === 1 && edgeSegs[0].idx === 1, edge)
    const none = await anon.rpc('get_clip', { p_slug: 'does-not-exist' })
    check('get_clip returns null for unknown slug', none.data === null && !none.error, none)

    // 7. search_segments
    const hit = await anon.rpc('search_segments', { q: 'budget review', scope_meeting: meetingId })
    check('search finds a matching segment', (hit.data ?? []).some((r: { meeting_slug: string }) => r.meeting_slug === slug), hit.error)
    const dflt = await anon.rpc('search_segments', { q: `rlsq${suffix}` })
    check('search default scope (no scope args) finds it too', !dflt.error && (dflt.data ?? []).some((r: { meeting_slug: string }) => r.meeting_slug === slug), dflt.error)
    const byHost = await anon.rpc('search_segments', { q: 'alpha rollout', scope_host: memberId })
    check('search scope_host keeps the host\'s meetings', !byHost.error && byHost.data?.length === 1 && byHost.data[0].meeting_slug === slug, byHost)
    const byOtherHost = await anon.rpc('search_segments', { q: 'alpha rollout', scope_host: randomUUID() })
    check('search scope_host excludes other hosts', !byOtherHost.error && byOtherHost.data?.length === 0, byOtherHost)
    const wrongMeeting = await anon.rpc('search_segments', { q: 'alpha rollout', scope_meeting: meeting2Id })
    check('search scope_meeting excludes other meetings', !wrongMeeting.error && wrongMeeting.data?.length === 0, wrongMeeting)
    const cap = (n: number) => anon.rpc('search_segments', { q: 'capword', scope_meeting: meeting2Id, max_rows: n })
    const capBig = await cap(1000)
    check('search max_rows is capped at 100', !capBig.error && capBig.data?.length === 100, capBig.error ?? capBig.data?.length)
    const capSmall = await cap(5)
    check('search max_rows 5 returns 5', !capSmall.error && capSmall.data?.length === 5, capSmall.error)
    const capNeg = await cap(-1)
    check('search negative max_rows errors (2201W)', capNeg.error?.code === '2201W', capNeg)
    for (const q of ['!!!', '"', '   ', 'a'.repeat(500)]) {
      const r = await anon.rpc('search_segments', { q })
      check(`search returns empty for odd query ${JSON.stringify(q.slice(0, 12))}`, !r.error && Array.isArray(r.data) && r.data.length === 0, r.error ?? r.data)
    }

    // 8. views
    const ts = await anon.from('team_stats').select('member_id,calls,talk_pct').eq('member_id', memberId)
    check('team_stats is readable by anon', !ts.error && ts.data?.length === 1, ts.error)
    check('team_stats talk_pct is not diluted by two participant rows', ts.data?.[0]?.talk_pct === 50 && ts.data?.[0]?.calls === 1, ts.data)
    const cu = await anon.from('calendar_upcoming').select('id').limit(1)
    check('calendar_upcoming is readable by anon', !cu.error, cu.error)

    // 9. ask_answers: unique per (scope, prompt); read-only for clients
    const askRow = (scope: string) => ({ id: randomUUID(), prompt: askPrompt, scope, answer: { text: 't', citations: [] } })
    check('ask prompt may repeat across scopes', !(await admin.from('ask_answers').insert(askRow('my_calls'))).error
      && !(await admin.from('ask_answers').insert(askRow('team_calls'))).error)
    denied('ask prompt cannot repeat within a scope (23505)', await admin.from('ask_answers').insert(askRow('my_calls')), '23505')
    const askAnon = await anon.from('ask_answers').select('id').eq('prompt', askPrompt)
    check('anon can read ask_answers', !askAnon.error && askAnon.data?.length === 2, askAnon)
    denied('authenticated cannot insert ask_answers (42501)', await A.client.from('ask_answers').insert(askRow('my_calls')))
  } finally {
    const cleanup = [
      await admin.from('meetings').delete().in('id', [meetingId, meeting2Id]),
      await admin.from('team_members').delete().eq('id', memberId),
      await admin.from('ask_answers').delete().eq('prompt', askPrompt),
      ...(await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)))),
    ]
    check('cleanup calls succeeded', cleanup.every((r) => !r.error), cleanup.map((r) => r.error?.message).filter(Boolean))
    const left = await Promise.all([
      admin.from('meetings').select('id').in('id', [meetingId, meeting2Id]),
      admin.from('team_members').select('id').eq('id', memberId),
      admin.from('ask_answers').select('id').eq('prompt', askPrompt),
      admin.from('participants').select('id').in('meeting_id', [meetingId, meeting2Id]),
      admin.from('segments').select('id').in('meeting_id', [meetingId, meeting2Id]),
      admin.from('shares').select('slug').in('created_by', userIds),
      admin.from('highlights').select('id').in('user_id', userIds),
      admin.from('summaries').select('id').in('user_id', userIds),
      admin.from('ai_usage').select('id').in('user_id', userIds),
    ])
    check('cleanup verified: no fixture rows remain', left.every((r) => !r.error && r.data?.length === 0), left.map((r) => r.error ?? r.data?.length))
    const users = await Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id)))
    check('cleanup verified: test users are gone', users.every((r) => !r.data?.user), users.map((r) => r.data?.user?.id))
  }

  console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
