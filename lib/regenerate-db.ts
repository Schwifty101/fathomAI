import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAll } from './queries'
import type { RegenDb } from './regenerate'
import { createAdminClient } from './supabase/admin'

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message)
}

export function makeRegenDb(db: SupabaseClient): RegenDb {
  // Lazy: a missing SUPABASE_SERVICE_ROLE_KEY must not break anything that never reaches the admin client.
  const admin = () => createAdminClient()
  return {
    async transcript(slug) {
      const { data: m, error } = await db.from('meetings').select('id,title,started_at').eq('slug', slug).maybeSingle()
      fail(error)
      if (!m) return null
      const { data: ps, error: pe } = await db.from('participants').select('id,name').eq('meeting_id', m.id)
      fail(pe)
      const name = new Map((ps ?? []).map((p) => [p.id, p.name as string]))
      const segs = await selectAll<{ idx: number; participant_id: string; text: string }>((from, to) =>
        db.from('segments').select('idx,participant_id,text').eq('meeting_id', m.id).order('idx').range(from, to))
      return {
        meetingId: m.id,
        title: m.title,
        startedAt: m.started_at,
        lines: segs.map((s) => ({ idx: s.idx, speaker: name.get(s.participant_id) ?? 'Unknown', text: s.text })),
      }
    },
    async usageCount(userId, sinceIso) {
      const { count, error } = await admin().from('ai_usage').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('kind', 'regenerate').gte('created_at', sinceIso)
      fail(error)
      return count ?? 0
    },
    async recordUsage(userId) {
      fail((await admin().from('ai_usage').insert({ user_id: userId, kind: 'regenerate' })).error)
    },
    async saveSummary(row) {
      // Authenticated users cannot insert summaries (RLS), so the service role writes, always with the
      // server-verified user id. onConflict targets the NULLS NOT DISTINCT constraint from the hardening migration.
      fail((await admin().from('summaries').upsert(
        {
          id: randomUUID(), meeting_id: row.meetingId, template: row.template, content: row.content,
          user_id: row.userId, source: 'live', model: row.model,
        },
        { onConflict: 'meeting_id,template,user_id' },
      )).error)
    },
  }
}
