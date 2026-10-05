import { createClient } from '@supabase/supabase-js'
import { guardTarget } from './guard-target'

guardTarget()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
// The two demo clips need a real auth user: shares.created_by is NOT NULL and references auth.users
// ON DELETE CASCADE (init migration), so deleting this user would delete both clips and break the
// public /clip/demo-q4-clip page. It is therefore reused on every run (looked up by email, created
// only the first time) and deliberately never cleaned up. Its password is random and never stored.
const EMAIL = 'demo-clips@example.test'

async function ownerId(): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data) throw new Error(`listUsers failed: ${error?.message ?? 'no data'}`)
    const found = data.users.find((user) => user.email === EMAIL)
    if (found) return found.id
    if (data.users.length < 200) break
  }
  const { data: created, error } = await db.auth.admin.createUser({
    email: EMAIL,
    password: crypto.randomUUID(),
    email_confirm: true,
  })
  if (error) throw error
  return created.user.id
}

async function main() {
  const { data: meeting, error: meetingError } = await db.from('meetings').select('id')
    .eq('slug', 'q4-planning').single()
  if (meetingError || !meeting) throw new Error('q4-planning must be loaded before demo clips')
  const { data: highlights, error: highlightError } = await db.from('highlights')
    .select('start_ms,end_ms,title').eq('meeting_id', meeting.id).is('user_id', null).order('start_ms').limit(2)
  if (highlightError) throw highlightError
  if (!highlights || highlights.length < 2) throw new Error('q4-planning needs two seeded highlights')

  const owner = await ownerId()
  const slugs = ['demo-q4-clip', 'demo-q4-clip-2']
  for (const [index, highlight] of highlights.entries()) {
    const { error } = await db.from('shares').upsert({
      slug: slugs[index], meeting_id: meeting.id,
      start_ms: highlight.start_ms, end_ms: highlight.end_ms,
      created_by: owner,
    }, { onConflict: 'slug' })
    if (error) throw error
    console.log(`clip /clip/${slugs[index]}: ${highlight.title}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
