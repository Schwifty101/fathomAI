import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ClipView } from '@/components/meeting/ClipView'
import { getClip } from '@/lib/clip'
import { createAnonClient } from '@/lib/supabase/anon'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const clip = await getClip(createAnonClient(), (await params).slug)
  if (!clip) return { title: 'Clip not found' }
  const quote = clip.segments[0]?.text.slice(0, 160) ?? 'A shared moment from a meeting'
  return { title: `${clip.title}: clip`, description: quote, openGraph: { title: clip.title, description: quote } }
}

export default async function ClipPage({ params }: { params: Promise<{ slug: string }> }) {
  const clip = await getClip(createAnonClient(), (await params).slug)
  if (!clip) notFound()
  return <ClipView clip={clip} />
}
