import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AskDb, AskScope } from './ask'
import { getDemoPersona, searchSegments } from './queries'
import type { AskAnswerRow } from './types'
import { createAdminClient } from './supabase/admin'

const NO_MEETING = '00000000-0000-0000-0000-000000000000'

async function scopeFilter(db: SupabaseClient, scope: AskScope): Promise<{ hostId?: string; meetingId?: string }> {
  if (scope.kind === 'team_calls') return {}
  if (scope.kind === 'my_calls') return { hostId: (await getDemoPersona(db))?.id ?? NO_MEETING }
  const { data, error } = await db.from('meetings').select('id').eq('slug', scope.slug).maybeSingle()
  if (error) throw new Error(error.message)
  return { meetingId: data?.id ?? NO_MEETING }
}

export function makeAskDb(db: SupabaseClient): AskDb {
  // Lazy: canned and extractive answers must work without SUPABASE_SERVICE_ROLE_KEY.
  const admin = () => createAdminClient()
  return {
    async suggested(prompt, scopeKind) {
      const { data, error } = await db.from('ask_answers').select('*').eq('scope', scopeKind)
      if (error) throw new Error(error.message)
      const normalize = (text: string) => text.trim().toLowerCase()
      return ((data ?? []) as AskAnswerRow[]).find((answer) => normalize(answer.prompt) === normalize(prompt)) ?? null
    },

    async search(query, scope, max) {
      return searchSegments(db, query, await scopeFilter(db, scope), max)
    },

    async notes(scope) {
      const filter = await scopeFilter(db, scope)
      let query = db.from('meetings').select('id,title')
      if (filter.hostId) query = query.eq('host_id', filter.hostId)
      if (filter.meetingId) query = query.eq('id', filter.meetingId)
      const { data: meetings, error: meetingError } = await query
      if (meetingError) throw new Error(meetingError.message)
      const ids = (meetings ?? []).map((meeting) => meeting.id)
      if (ids.length === 0) return ''
      const { data: summaries, error: summaryError } = await db.from('summaries')
        .select('meeting_id,content').in('meeting_id', ids).eq('template', 'general').is('user_id', null)
      if (summaryError) throw new Error(summaryError.message)
      const title = new Map((meetings ?? []).map((meeting) => [meeting.id, meeting.title]))
      return (summaries ?? []).map((summary) =>
        `## ${title.get(summary.meeting_id)}\n${(summary.content as { sections: { heading: string; bullets: string[] }[] }).sections.flatMap((section) => section.bullets).join('\n')}`,
      ).join('\n\n').slice(0, 6000)
    },

    async usageCount(userId, sinceIso) {
      const { count, error } = await admin().from('ai_usage').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('kind', 'ask').gte('created_at', sinceIso)
      if (error) throw new Error(error.message)
      return count ?? 0
    },

    async recordUsage(userId) {
      const { error } = await admin().from('ai_usage').insert({ user_id: userId, kind: 'ask' })
      if (error) throw new Error(error.message)
    },
  }
}
