import { notFound } from 'next/navigation'
import { MeetingView } from '@/components/meeting/MeetingView'
import { getUser } from '@/lib/auth'
import { parseTimeParam } from '@/lib/format'
import { getMeetingBundle, getMyShares } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string | string[] }>
}) {
  const { id } = await params
  const { t } = await searchParams
  const db = await createClient()
  const user = await getUser(db)
  const bundle = await getMeetingBundle(db, id, user?.id ?? null)
  if (!bundle) notFound()
  const shares = user ? await getMyShares(db, bundle.meeting.id) : []
  return (
    <MeetingView
      bundle={bundle}
      userId={user?.id ?? null}
      liveAiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
      initialMs={parseTimeParam(t, bundle.meeting.duration_sec * 1000)}
      shares={shares}
    />
  )
}
