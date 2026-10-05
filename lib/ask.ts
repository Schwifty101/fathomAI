import { formatMs } from './format'
import { completeJson, LlmAuthError, type LlmClient } from './llm'
import { liveAskPrompt, SYSTEM_ANALYST } from './prompts'
import { liveAskSchema } from './schema'
import { stripMarks, toOrQuery } from './snippet'
import type { AskAnswerRow, SearchHit } from './types'

export type AskScope = { kind: 'my_calls' } | { kind: 'team_calls' } | { kind: 'meeting'; slug: string }
export type AskCite = { meeting_slug: string; start_ms: number; label: string }
export type AskResult = { mode: 'suggested' | 'live' | 'extractive'; text: string; citations: AskCite[]; notice?: string }

export interface AskDb {
  suggested(prompt: string, scopeKind: AskScope['kind']): Promise<AskAnswerRow | null>
  search(query: string, scope: AskScope, max: number): Promise<SearchHit[]>
  notes(scope: AskScope): Promise<string>
  /** Reserve a slot first (insert), then count rows since `sinceIso` including this one. */
  recordUsage(userId: string): Promise<void>
  usageCount(userId: string, sinceIso: string): Promise<number>
}
export type AskDeps = { llm: LlmClient | null; userId: string | null; db: AskDb; now?: () => Date }
export const ASK_LIMIT_PER_HOUR = 10

function extractive(question: string, hits: SearchHit[], notice: string): AskResult {
  if (hits.length === 0) {
    return { mode: 'extractive', text: 'No matching moments found in these calls.', citations: [], notice }
  }
  return {
    mode: 'extractive',
    text: `Closest moments for “${question}”:`,
    citations: hits.slice(0, 5).map((hit) => ({
      meeting_slug: hit.meeting_slug,
      start_ms: hit.start_ms,
      label: `${hit.meeting_title}: ${hit.speaker}, ${stripMarks(hit.snippet)}`,
    })),
    notice,
  }
}

export async function ask(deps: AskDeps, input: { question: string; scope: AskScope }): Promise<AskResult> {
  const question = input.question.trim()
  const suggested = await deps.db.suggested(question, input.scope.kind)
  if (suggested) {
    return {
      mode: 'suggested', text: suggested.answer.text,
      citations: suggested.answer.citations.map((citation) => ({
        meeting_slug: citation.meeting_slug, start_ms: citation.start_ms, label: citation.label,
      })),
    }
  }

  const hits = await deps.db.search(toOrQuery(question), input.scope, 8)
  if (!deps.llm) return extractive(question, hits, 'Live answers are unavailable. Showing the closest moments instead.')
  if (!deps.userId) return extractive(question, hits, 'Sign in with Google for live answers. Showing the closest moments instead.')

  // Reserve before counting so parallel requests cannot all read 0 and all call the model.
  // Any usage/DB failure degrades to extractive: never a 500, never an unmetered model call.
  const since = new Date((deps.now?.() ?? new Date()).getTime() - 3_600_000).toISOString()
  try {
    await deps.db.recordUsage(deps.userId)
    if ((await deps.db.usageCount(deps.userId, since)) > ASK_LIMIT_PER_HOUR) {
      return extractive(question, hits, 'Hourly live-answer limit reached. Showing the closest moments instead.')
    }
  } catch {
    return extractive(question, hits, 'Live answers are temporarily unavailable. Showing the closest moments instead.')
  }

  try {
    const byRef = new Map(hits.map((hit) => [`${hit.meeting_slug}#${hit.segment_idx}`, hit]))
    const excerpts = hits.map((hit) =>
      `[${hit.meeting_slug}#${hit.segment_idx} @ ${formatMs(hit.start_ms)}] ${hit.speaker}: ${stripMarks(hit.snippet)}`,
    ).join('\n')
    const notes = await deps.db.notes(input.scope)
    const output = await completeJson(
      deps.llm,
      { system: SYSTEM_ANALYST, prompt: liveAskPrompt(question, `${notes}\n\n${excerpts}`), maxTokens: 1500 },
      liveAskSchema,
      0, // one model call per request: a retry could exceed the route's maxDuration
    )
    const citations = output.refs.flatMap((ref) => {
      const hit = byRef.get(ref)
      return hit ? [{ meeting_slug: hit.meeting_slug, start_ms: hit.start_ms, label: `${hit.speaker} at ${formatMs(hit.start_ms)}` }] : []
    })
    return { mode: 'live', text: output.text, citations }
  } catch (error) {
    const notice = error instanceof LlmAuthError
      ? 'Your API key was rejected by the provider. Check it in Your AI key. Showing the closest moments instead.'
      : 'The live answer failed. Showing the closest moments instead.'
    return extractive(question, hits, notice)
  }
}
