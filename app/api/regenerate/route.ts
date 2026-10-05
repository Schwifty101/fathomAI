import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth'
import { llmFromRequest } from '@/lib/llm'
import { regenerate, RegenError, type RegenErrorCode } from '@/lib/regenerate'
import { makeRegenDb } from '@/lib/regenerate-db'
import { TEMPLATES } from '@/lib/schema'
import { createClient } from '@/lib/supabase/server'

// anthropicClient allows 20s per call and regenerate retries once on invalid JSON: 2 x 20s plus DB time fits in 60s.
export const maxDuration = 60

const body = z.object({ meetingSlug: z.string().min(1).max(100), template: z.enum(TEMPLATES) })
const STATUS: Record<RegenErrorCode, number> = {
  no_key: 503, no_session: 401, rate_limited: 429, not_found: 404, llm_failed: 502, bad_key: 400, unavailable: 503,
}
const MESSAGE: Record<RegenErrorCode, string> = {
  no_key: 'Live regeneration is not configured on this server',
  no_session: 'Sign in to regenerate summaries',
  rate_limited: 'Hourly regeneration limit reached',
  not_found: 'Meeting not found',
  llm_failed: 'The model returned an invalid summary. The saved one is unchanged.',
  bad_key: 'The provider rejected your API key. Check it in Your AI key.',
  unavailable: 'Regeneration is temporarily unavailable. Please try again.',
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const picked = llmFromRequest(req.headers, process.env.ANTHROPIC_API_KEY)
  if (picked === 'invalid') return NextResponse.json({ error: 'Your AI key settings are invalid' }, { status: 400 })
  try {
    const db = await createClient()
    const user = await getUser(db) // server-verified id; never taken from the request body
    const content = await regenerate(
      { llm: picked.llm, model: picked.model, userId: user?.id ?? null, db: makeRegenDb(db) },
      parsed.data,
    )
    return NextResponse.json({ content })
  } catch (e) {
    if (e instanceof RegenError) return NextResponse.json({ error: MESSAGE[e.code] }, { status: STATUS[e.code] })
    return NextResponse.json({ error: MESSAGE.unavailable }, { status: 500 })
  }
}
