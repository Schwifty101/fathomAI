import type { SupabaseClient } from '@supabase/supabase-js'

export type Clip = {
  slug: string
  meeting_slug: string
  title: string
  start_ms: number
  end_ms: number
  segments: { idx: number; start_ms: number; end_ms: number; speaker: string; text: string }[]
}

export async function getClip(db: SupabaseClient, slug: string): Promise<Clip | null> {
  const { data, error } = await db.rpc('get_clip', { p_slug: slug })
  if (error) throw new Error(error.message)
  return (data as Clip | null) ?? null
}
