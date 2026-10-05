import { completeJson, LlmAuthError, type LlmClient } from './llm'
import { formatTranscript, SYSTEM_ANALYST, summaryPrompt, type TLine } from './prompts'
import { summaryFor, type SummaryContent, type Template } from './schema'

export type RegenErrorCode = 'no_key' | 'no_session' | 'rate_limited' | 'not_found' | 'llm_failed' | 'bad_key' | 'unavailable'
export class RegenError extends Error {
  constructor(readonly code: RegenErrorCode) {
    super(code)
  }
}

export interface RegenDb {
  transcript(slug: string): Promise<{ meetingId: string; title: string; startedAt: string; lines: TLine[] } | null>
  /** Reserve a slot first (insert), then count rows since `sinceIso` including this one. */
  recordUsage(userId: string): Promise<void>
  usageCount(userId: string, sinceIso: string): Promise<number>
  saveSummary(row: { meetingId: string; template: Template; userId: string; content: SummaryContent; model: string }): Promise<void>
}
export const REGEN_LIMIT_PER_HOUR = 5

export async function regenerate(
  deps: { llm: LlmClient | null; userId: string | null; db: RegenDb; model?: string; now?: () => Date },
  input: { meetingSlug: string; template: Template },
): Promise<SummaryContent> {
  if (!deps.llm) throw new RegenError('no_key')
  if (!deps.userId) throw new RegenError('no_session')

  let t: Awaited<ReturnType<RegenDb['transcript']>>
  try {
    t = await deps.db.transcript(input.meetingSlug)
  } catch {
    throw new RegenError('unavailable')
  }
  if (!t) throw new RegenError('not_found')

  // Reserve before counting so parallel requests cannot all read 0 and all call the model.
  // The attempt counts even if the model then fails. Any usage/DB failure fails closed:
  // there is no extractive fallback, and never an unmetered model call.
  const since = new Date((deps.now?.() ?? new Date()).getTime() - 3_600_000).toISOString()
  let used: number
  try {
    await deps.db.recordUsage(deps.userId)
    used = await deps.db.usageCount(deps.userId, since)
  } catch {
    throw new RegenError('unavailable')
  }
  if (used > REGEN_LIMIT_PER_HOUR) throw new RegenError('rate_limited')

  let content: SummaryContent
  try {
    content = await completeJson(
      deps.llm,
      {
        system: SYSTEM_ANALYST,
        prompt: summaryPrompt(input.template, { title: t.title, date: t.startedAt.slice(0, 10), transcript: formatTranscript(t.lines) }),
        maxTokens: 3000,
      },
      summaryFor(input.template), // template-allowed headings only, same as seeded summaries
    )
  } catch (error) {
    throw new RegenError(error instanceof LlmAuthError ? 'bad_key' : 'llm_failed')
  }
  try {
    await deps.db.saveSummary({
      meetingId: t.meetingId, template: input.template, userId: deps.userId, content,
      model: deps.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
    })
  } catch {
    throw new RegenError('unavailable')
  }
  return content
}
