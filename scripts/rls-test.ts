import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

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
  const partId = randomUUID()
  const slug = `rls-test-${suffix}`
  const shareSlug = `rls${suffix}`
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
    await must(admin.from('meetings').insert({
      id: meetingId, slug, title: 'RLS fixture', kind: 'standup', platform: 'zoom',
      started_at: new Date().toISOString(), duration_sec: 420, host_id: memberId,
    }))
    await must(admin.from('participants').insert({
      id: partId, meeting_id: meetingId, member_id: memberId, name: 'RLS Tester', role: 'qa', is_internal: true,
    }))
    await must(admin.from('segments').insert([
      { id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 0, start_ms: 0, end_ms: 10000, text: 'alpha rollout plan for friday' },
      { id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 1, start_ms: 10000, end_ms: 20000, text: 'beta budget review next week' },
      { id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 2, start_ms: 400000, end_ms: 410000, text: 'gamma wrap up and thanks' },
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
    await must(admin.from('shares').insert({ slug: shareSlug, meeting_id: meetingId, start_ms: 0, end_ms: 15000, created_by: A.id }))
    await must(admin.from('ai_usage').insert({ user_id: A.id, kind: 'ask' }))

    // 1. anon reads seeded content, cannot write
    const m = await anon.from('meetings').select('id').eq('id', meetingId)
    check('anon can read meetings', m.data?.length === 1, m.error)
    const w = await anon.from('meetings').insert({
      id: randomUUID(), slug: 'x', title: 'x', kind: 'standup', platform: 'zoom',
      started_at: new Date().toISOString(), duration_sec: 1, host_id: memberId,
    })
    check('anon cannot insert meetings', !!w.error, w)
    const wa = await A.client.from('segments').insert({
      id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 99, start_ms: 1, end_ms: 2, text: 'x',
    })
    check('authenticated cannot insert segments', !!wa.error, wa)

    // 2. summaries: seed visible to all, live row only to its owner
    const sAnon = await anon.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('anon sees only seeded summary', sAnon.data?.length === 1 && sAnon.data[0].user_id === null, sAnon)
    const sA = await A.client.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('user A sees seeded + own summary', sA.data?.length === 2, sA)
    const sB = await B.client.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('user B sees only seeded summary', sB.data?.length === 1, sB)

    // 3. highlights
    const hAnon = await anon.from('highlights').select('id').eq('meeting_id', meetingId)
    check('anon sees only seeded highlight', hAnon.data?.length === 1, hAnon)
    const hB = await B.client.from('highlights').select('id').eq('meeting_id', meetingId)
    check("user B cannot see user A's highlight", hB.data?.length === 1 && hB.data[0].id === hlSeed, hB)
    const hSpoof = await A.client.from('highlights').insert({
      meeting_id: meetingId, user_id: B.id, type: 'insight', title: 'spoof', start_ms: 0, end_ms: 1000,
    })
    check('A cannot insert a highlight as B', !!hSpoof.error, hSpoof)
    const hOwn = await A.client.from('highlights').insert({
      meeting_id: meetingId, user_id: A.id, type: 'feedback', title: 'ok', start_ms: 0, end_ms: 1000,
    })
    check('A can insert own highlight', !hOwn.error, hOwn.error)
    const hUpd = await B.client.from('highlights').update({ title: 'hijack' }).eq('id', hlA).select()
    check("B cannot update A's highlight", (hUpd.data?.length ?? 0) === 0, hUpd)
    const hDel = await B.client.from('highlights').delete().eq('id', hlA).select()
    check("B cannot delete A's highlight", (hDel.data?.length ?? 0) === 0, hDel)
    const hLong = await A.client.from('highlights').insert({
      meeting_id: meetingId, user_id: A.id, type: 'insight', title: 'long', start_ms: 0, end_ms: 400000,
    })
    check('highlight longer than 5 minutes is rejected (23514)', hLong.error?.code === '23514', hLong)

    // 4. ai_usage is service-role only
    const uA = await A.client.from('ai_usage').select('id')
    check('ai_usage invisible to clients', (uA.data?.length ?? 0) === 0, uA)
    const uIns = await A.client.from('ai_usage').insert({ user_id: A.id, kind: 'ask' })
    check('ai_usage not writable by clients', !!uIns.error, uIns)

    // 5. shares
    const shAnon = await anon.from('shares').select('slug')
    check('anon cannot list shares', (shAnon.data?.length ?? 0) === 0, shAnon)
    const shA = await A.client.from('shares').select('slug').eq('slug', shareSlug)
    check('creator sees own share', shA.data?.length === 1, shA)
    const shB = await B.client.from('shares').select('slug').eq('slug', shareSlug)
    check("B cannot see A's share", (shB.data?.length ?? 0) === 0, shB)
    const shSpoof = await A.client.from('shares').insert({
      slug: `sp${suffix}`, meeting_id: meetingId, start_ms: 0, end_ms: 1000, created_by: B.id,
    })
    check('A cannot create a share as B', !!shSpoof.error, shSpoof)
    const shIns = (slug: string, start_ms: number, end_ms: number) =>
      A.client.from('shares').insert({ slug, meeting_id: meetingId, start_ms, end_ms, created_by: A.id })
    const shOk = await shIns(`ok${suffix}`, 0, 300000)
    check('A can create a share with a valid 5 minute window', !shOk.error, shOk.error)
    const shLong = await shIns(`lg${suffix}`, 0, 300001)
    check('share of 300001 ms is rejected (23514)', shLong.error?.code === '23514', shLong)
    const shEq = await shIns(`bd${suffix}`, 5000, 5000)
    check('share with end = start is rejected (23514)', shEq.error?.code === '23514', shEq)
    const shRev = await shIns(`rv${suffix}`, 5000, 1000)
    check('share with end < start is rejected (23514)', shRev.error?.code === '23514', shRev)
    const shStored = await admin.from('shares').select('slug').in('slug', [`lg${suffix}`, `bd${suffix}`, `rv${suffix}`])
    check('rejected shares were not stored', !shStored.error && shStored.data?.length === 0, shStored)

    // 6. get_clip returns only the window and no sharer identity
    const clip = await anon.rpc('get_clip', { p_slug: shareSlug })
    const segs = (clip.data?.segments ?? []) as { idx: number }[]
    check('get_clip returns only in-window segments', segs.length === 2 && segs.every((s) => s.idx < 2), clip)
    check('get_clip hides sharer identity', Boolean(clip.data) && !('created_by' in clip.data), clip.data)
    const none = await anon.rpc('get_clip', { p_slug: 'does-not-exist' })
    check('get_clip returns null for unknown slug', none.data === null && !none.error, none)

    // 7. search_segments
    const hit = await anon.rpc('search_segments', { q: 'budget review', scope_meeting: meetingId })
    check('search finds a matching segment', (hit.data ?? []).some((r: { meeting_slug: string }) => r.meeting_slug === slug), hit.error)
    for (const q of ['!!!', '"', '   ', 'a'.repeat(500)]) {
      const r = await anon.rpc('search_segments', { q })
      check(`search returns empty for odd query ${JSON.stringify(q.slice(0, 12))}`, !r.error && Array.isArray(r.data) && r.data.length === 0, r.error ?? r.data)
    }

    // 8. team_stats readable
    const ts = await anon.from('team_stats').select('member_id').eq('member_id', memberId)
    check('team_stats is readable by anon', ts.data?.length === 1, ts.error)
  } finally {
    await admin.from('meetings').delete().eq('id', meetingId)
    await admin.from('team_members').delete().eq('id', memberId)
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  }

  console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
