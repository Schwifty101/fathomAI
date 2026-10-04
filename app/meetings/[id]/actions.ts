'use server'

import { z } from 'zod'
import { getUser } from '@/lib/auth'
import { buildHighlight } from '@/lib/highlight'
import { selectAll } from '@/lib/queries'
import { HIGHLIGHT_TYPES } from '@/lib/schema'
import { createClient } from '@/lib/supabase/server'
import type { HighlightRow } from '@/lib/types'

const createInput = z.object({
  meetingSlug: z.string().min(1).max(100),
  segmentIdx: z.number().int().min(0),
  type: z.enum(HIGHLIGHT_TYPES),
  note: z.string().max(280).nullable().optional(),
})

export type CreateHighlightResult =
  | { ok: true; highlight: HighlightRow }
  | { ok: false; error: 'auth' | 'invalid' | 'not_found' | 'failed' }

export async function createHighlight(raw: unknown): Promise<CreateHighlightResult> {
  const parsed = createInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const db = await createClient()
  const user = await getUser(db)
  if (!user) return { ok: false, error: 'auth' }

  const { data: meeting } = await db.from('meetings').select('id').eq('slug', parsed.data.meetingSlug).maybeSingle()
  if (!meeting) return { ok: false, error: 'not_found' }
  const segments = await selectAll<{ participant_id: string; start_ms: number; end_ms: number; text: string }>(
    (from, to) => db.from('segments').select('participant_id,start_ms,end_ms,text')
      .eq('meeting_id', meeting.id).order('idx').range(from, to),
  )
  const draft = buildHighlight(segments, parsed.data.segmentIdx, parsed.data.type, parsed.data.note)
  if (!draft) return { ok: false, error: 'invalid' }

  const { data, error } = await db.from('highlights')
    .insert({ meeting_id: meeting.id, user_id: user.id, ...draft })
    .select('id,user_id,type,title,note,start_ms,end_ms').single()
  if (error || !data) return { ok: false, error: 'failed' }
  return { ok: true, highlight: data as HighlightRow }
}

export async function deleteHighlight(id: string): Promise<{ ok: boolean }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false }
  const db = await createClient()
  if (!(await getUser(db))) return { ok: false }
  const { error } = await db.from('highlights').delete().eq('id', id)
  return { ok: !error }
}
