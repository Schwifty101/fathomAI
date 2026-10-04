import { ImageResponse } from 'next/og'
import { getClip } from '@/lib/clip'
import { createAnonClient } from '@/lib/supabase/anon'

export const alt = 'Meeting clip'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const clip = await getClip(createAnonClient(), (await params).slug)
  const quote = clip?.segments[0] ? `“${clip.segments[0].text.slice(0, 180)}”` : 'This clip is no longer available'
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: 64, background: '#0e1013', color: '#eef1f5' }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#98a2b3' }}>Fathom Rebuild · Shared clip</div>
        <div style={{ display: 'flex', fontSize: 52, lineHeight: 1.25 }}>{quote}</div>
        <div style={{ display: 'flex', fontSize: 34, color: '#21baf3' }}>{clip?.title ?? ''}</div>
      </div>
    ),
    size,
  )
}
