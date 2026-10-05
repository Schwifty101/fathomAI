import { join } from 'node:path'
import { completeJson, type LlmClient } from '@/lib/llm'
import { ASK_PROMPTS_BY_SCOPE, askPrompt, SYSTEM_ANALYST } from '@/lib/prompts'
import { askAnswerSchema, ASK_SCOPES, type SummaryContent } from '@/lib/schema'
import { exists, fileOf, GEN_DIR, readJson, writeJson } from '../io'
import { startedAt, type MeetingDef } from '../meetings'
import { memberBySlug, TEAM } from '../team'
import type { GenOptions } from './meeting'

type ActionRow = { segment_idx: number; owner: string; task: string; due: string | null }
type HighlightRow = { segment_idx: number; type: string; title: string }

// The segment indices a model is shown for a meeting (its action items and highlights): the only valid citations.
export const citableIdx = (actions: { segment_idx: number }[], highlights: { segment_idx: number }[]) =>
  new Set([...actions, ...highlights].map((row) => row.segment_idx))

export async function generateAsk(client: LlmClient, defs: readonly MeetingDef[], opts: GenOptions = {}): Promise<void> {
  const { dir = GEN_DIR, force = false, log = console.log } = opts
  const out = join(dir, 'ask.json')
  if (!force && exists(out)) {
    log('ask: exists, skipping')
    return
  }
  const demo = TEAM.find((member) => member.demo)!
  const allowed = new Map<string, Set<number>>()
  const notes = new Map<string, string>()
  for (const def of defs) {
    const general = readJson<{ general: SummaryContent }>(fileOf(def.slug, 'summaries', dir)).general
    const actions = readJson<ActionRow[]>(fileOf(def.slug, 'actions', dir))
    const highlights = readJson<HighlightRow[]>(fileOf(def.slug, 'highlights', dir))
    allowed.set(def.slug, citableIdx(actions, highlights))
    notes.set(def.slug, [
      `## ${def.slug}: ${def.title} (${startedAt(def).toISOString().slice(0, 10)}, host ${memberBySlug.get(def.host)!.name})`,
      ...general.sections.flatMap((section) => [section.heading + ':', ...section.bullets.map((bullet) => `- ${bullet}`)]),
      'Action items:',
      ...actions.map((action) => `- [${action.segment_idx}] ${action.owner}: ${action.task}${action.due ? ` (due ${action.due})` : ''}`),
      'Highlights:',
      ...highlights.map((highlight) => `- [${highlight.segment_idx}] ${highlight.type}: ${highlight.title}`),
    ].join('\n'))
  }

  // My Calls = meetings the demo persona hosts (the app's host filter); Team Calls = every meeting.
  const scopes = {
    my_calls: {
      defs: defs.filter((def) => def.host === demo.slug),
      who: `"my" and "me" mean ${demo.name} (${demo.role}), who hosted every meeting in these notes.`,
    },
    team_calls: { defs, who: 'These notes cover every meeting across the whole team; nobody is "me".' },
  }
  const answers = []
  for (const scope of ASK_SCOPES) {
    const { defs: scoped, who } = scopes[scope]
    if (scoped.length === 0) throw new Error(`ask ${scope}: no meetings in scope`)
    const corpus = scoped.map((def) => notes.get(def.slug)).join('\n\n')
    const schema = askAnswerSchema(
      scoped.map((def) => def.slug),
      new Map(scoped.map((def) => [def.slug, allowed.get(def.slug)!])),
    )
    for (const prompt of ASK_PROMPTS_BY_SCOPE[scope]) {
      log(`ask [${scope}]: "${prompt}"`)
      const answer = await completeJson(client, {
        system: SYSTEM_ANALYST, prompt: askPrompt(prompt, corpus, who), maxTokens: 2000,
      }, schema)
      answers.push({ prompt, scope, text: answer.text, citations: answer.citations })
    }
  }
  writeJson(out, answers)
}
