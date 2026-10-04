'use server'

import { z } from 'zod'
import { getUser } from '@/lib/auth'
import { buildHighlight } from '@/lib/highlight'
import { selectAll } from '@/lib/queries'
import { HIGHLIGHT_TYPES } from '@/lib/schema'
import { clampWindow } from '@/lib/share'
import { newSlug } from '@/lib/slug'
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

const shareInput = z.object({
  meetingSlug: z.string().min(1).max(100),
  start_ms: z.number(),
  end_ms: z.number(),
})
const DAILY_SHARE_LIMIT = 20

export type CreateShareResult =
  | { ok: true; path: string; share: { slug: string; start_ms: number; end_ms: number } }
  | { ok: false; error: 'auth' | 'invalid' | 'not_found' | 'limit' | 'failed' }

export async function createShare(raw: unknown): Promise<CreateShareResult> {
  const parsed = shareInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const db = await createClient()
  const user = await getUser(db)
  if (!user) return { ok: false, error: 'auth' }

  const { data: meeting } = await db.from('meetings').select('id,duration_sec')
    .eq('slug', parsed.data.meetingSlug).maybeSingle()
  if (!meeting) return { ok: false, error: 'not_found' }
  const window = clampWindow(parsed.data.start_ms, parsed.data.end_ms, meeting.duration_sec * 1000)
  if (!window) return { ok: false, error: 'invalid' }

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count, error: countError } = await db.from('shares').select('slug', { count: 'exact', head: true })
    .gte('created_at', since)
  if (countError) return { ok: false, error: 'failed' }
  if ((count ?? 0) >= DAILY_SHARE_LIMIT) return { ok: false, error: 'limit' }

  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = newSlug()
    const { error } = await db.from('shares').insert({
      slug, meeting_id: meeting.id, created_by: user.id, ...window,
    })
    if (!error) return { ok: true, path: `/clip/${slug}`, share: { slug, ...window } }
    if (error.code !== '23505') break
  }
  return { ok: false, error: 'failed' }
}

export async function deleteShare(slug: string): Promise<{ ok: boolean }> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { ok: false }
  const db = await createClient()
  if (!(await getUser(db))) return { ok: false }
  const { data, error } = await db.from('shares').delete().eq('slug', slug).select('slug')
  return { ok: !error && !!data?.length }
}
