import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ask } from '@/lib/ask'
import { makeAskDb } from '@/lib/ask-db'
import { getUser } from '@/lib/auth'
import { anthropicClient } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'

const body = z.object({
  question: z.string().trim().min(1).max(500),
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('my_calls') }),
    z.object({ kind: z.literal('team_calls') }),
    z.object({ kind: z.literal('meeting'), slug: z.string().min(1).max(100) }),
  ]),
})

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const db = await createClient()
  const user = await getUser(db)
  const key = process.env.ANTHROPIC_API_KEY
  const result = await ask(
    { llm: key ? anthropicClient(key) : null, userId: user?.id ?? null, db: makeAskDb(db) },
    parsed.data,
  )
  return NextResponse.json(result)
}
