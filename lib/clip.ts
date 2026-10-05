import { cache } from 'react'
import { createAnonClient } from './supabase/anon'

export type Clip = {
  slug: string
  meeting_slug: string
  title: string
  start_ms: number
  end_ms: number
  segments: { idx: number; start_ms: number; end_ms: number; speaker: string; text: string }[]
}

// cache() keys on args, so take only the slug: page, metadata and OG image share one RPC per request.
export const getClip = cache(async (slug: string): Promise<Clip | null> => {
  const { data, error } = await createAnonClient().rpc('get_clip', { p_slug: slug })
  if (error) throw new Error(error.message)
  return (data as Clip | null) ?? null
})
