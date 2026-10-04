import { join } from 'node:path'
import { completeJson, type LlmClient } from '@/lib/llm'
import { ASK_PROMPTS, askPrompt, SYSTEM_ANALYST } from '@/lib/prompts'
import { askAnswerSchema, type SummaryContent, type TranscriptFile } from '@/lib/schema'
import { exists, fileOf, GEN_DIR, readJson, writeJson } from '../io'
import { startedAt, type MeetingDef } from '../meetings'
import { memberBySlug } from '../team'
import type { GenOptions } from './meeting'

type ActionRow = { segment_idx: number; owner: string; task: string; due: string | null }
type HighlightRow = { segment_idx: number; type: string; title: string }

export async function generateAsk(client: LlmClient, defs: readonly MeetingDef[], opts: GenOptions = {}): Promise<void> {
  const { dir = GEN_DIR, force = false, log = console.log } = opts
  const out = join(dir, 'ask.json')
  if (!force && exists(out)) {
    log('ask: exists, skipping')
    return
  }
  const lineCounts = new Map<string, number>()
  const corpus = defs.map((def) => {
    const transcript = readJson<TranscriptFile>(fileOf(def.slug, 'transcript', dir))
    lineCounts.set(def.slug, transcript.lines.length)
    const general = readJson<{ general: SummaryContent }>(fileOf(def.slug, 'summaries', dir)).general
    const actions = readJson<ActionRow[]>(fileOf(def.slug, 'actions', dir))
    const highlights = readJson<HighlightRow[]>(fileOf(def.slug, 'highlights', dir))
    return [
      `## ${def.slug}: ${def.title} (${startedAt(def).toISOString().slice(0, 10)}, host ${memberBySlug.get(def.host)!.name})`,
      ...general.sections.flatMap((section) => [section.heading + ':', ...section.bullets.map((bullet) => `- ${bullet}`)]),
      'Action items:',
      ...actions.map((action) => `- [${action.segment_idx}] ${action.owner}: ${action.task}${action.due ? ` (due ${action.due})` : ''}`),
      'Highlights:',
      ...highlights.map((highlight) => `- [${highlight.segment_idx}] ${highlight.type}: ${highlight.title}`),
    ].join('\n')
  }).join('\n\n')

  const slugs = defs.map((def) => def.slug)
  const answers = []
  for (const prompt of ASK_PROMPTS) {
    log(`ask: "${prompt}"`)
    const answer = await completeJson(client, {
      system: SYSTEM_ANALYST, prompt: askPrompt(prompt, corpus), maxTokens: 2000,
    }, askAnswerSchema(slugs))
    const citations = answer.citations.filter((citation) =>
      citation.segment_idx < (lineCounts.get(citation.meeting_slug) ?? 0))
    if (citations.length === 0) throw new Error(`ask "${prompt}": no citation points at a real line`)
    answers.push({ prompt, scope: 'my_calls', text: answer.text, citations })
  }
  writeJson(out, answers)
}
