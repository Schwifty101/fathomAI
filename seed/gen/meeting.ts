import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { completeJson, type LlmClient } from '@/lib/llm'
import { expandToRun } from '@/lib/speaker-runs'
import {
  actionItemsSchema, briefFor, chapterLinesSchema, highlightPicksSchema,
  summaryFor, TEMPLATES, type Brief, type HighlightType, type Template, type TranscriptFile,
} from '@/lib/schema'
import {
  actionItemsPrompt, briefPrompt, chapterPrompt, formatTranscript, highlightsPrompt,
  SYSTEM_ANALYST, SYSTEM_WRITER, spotlight, summaryPrompt,
} from '@/lib/prompts'
import { resolveDue } from '../due'
import { exists, fileOf, GEN_DIR, readJson, writeJson } from '../io'
import { castOf, startedAt, type MeetingDef } from '../meetings'
import { stampTimestamps, type Line } from '../stamp'

export type GenOptions = { dir?: string; force?: boolean; log?: (message: string) => void }

export const hashSeed = (value: string) => [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Everything derived from the transcript's line indices; none of it may outlive the transcript it was made from.
const DERIVED = ['summaries', 'summaries.partial', 'actions', 'highlights']

// Pure steps shared with seed/assemble.ts (the hand-written bundle path), so both routes stamp and resolve alike.
export function buildTranscript(chunks: Line[][], titles: string[], def: MeetingDef, log: (m: string) => void = console.log): TranscriptFile {
  let start = 0
  const chapters = chunks.map((chunk, index) => {
    const entry = { title: titles[index], start_idx: start }
    start += chunk.length
    return entry
  })
  const stamped = stampTimestamps(chunks.flat(), { targetMs: def.targetMin * 60_000, seed: hashSeed(def.slug) })
  const duration = stamped.at(-1)!.end_ms
  const target = def.targetMin * 60_000
  if (Math.abs(duration - target) / target > (def.showcase ? 0.05 : 0.15)) {
    log(`${def.slug}: WARNING stamped ${Math.round(duration / 60_000)} min vs target ${def.targetMin}; seed:check will fail unless regenerated`)
  }
  return { lines: stamped, chapters, duration_ms: duration }
}

type ActionPick = { owner: string; task: string; due_phrase: string | null; segment_idx: number }
export function buildActions(picks: ActionPick[], transcript: TranscriptFile, def: MeetingDef, log: (m: string) => void = console.log) {
  const date = startedAt(def)
  return picks.map((action) => {
    const due = resolveDue(action.due_phrase, date)
    if (action.due_phrase && !due) log(`${def.slug}: WARNING unresolved due phrase "${action.due_phrase}" for "${action.task}"`)
    return {
      owner: action.owner,
      task: action.task,
      due,
      due_phrase: action.due_phrase,
      segment_idx: action.segment_idx,
      start_ms: transcript.lines[action.segment_idx].start_ms,
    }
  })
}

type HighlightPick = { segment_idx: number; type: HighlightType; title: string }
export function buildHighlights(picks: HighlightPick[], transcript: TranscriptFile) {
  const segments = transcript.lines.map((line) => ({
    participant_id: line.speaker, start_ms: line.start_ms, end_ms: line.end_ms,
  }))
  const seenRuns = new Set<number>()
  const rows = picks.flatMap((pick) => {
    const run = expandToRun(segments, pick.segment_idx)
    if (!run || seenRuns.has(run.startIdx)) return [] // two picks in one speaker run are one clip
    seenRuns.add(run.startIdx)
    return [{
      segment_idx: pick.segment_idx, type: pick.type, title: pick.title,
      start_ms: run.start_ms, end_ms: run.end_ms,
    }]
  })
  if (rows.length < 3) throw new Error(`highlights: picks fall in only ${rows.length} distinct speaker runs; re-run to retry`)
  return rows
}

export async function generateMeeting(client: LlmClient, def: MeetingDef, opts: GenOptions = {}): Promise<void> {
  const { dir = GEN_DIR, force = false, log = console.log } = opts
  const cast = castOf(def)
  const names = cast.map((person) => person.name)
  const path = (name: string) => fileOf(def.slug, name, dir)
  const need = (name: string) => force || !exists(path(name))
  const drop = (...files: string[]) => files.forEach((name) => rmSync(path(name), { force: true }))
  // ask.json cites transcript lines of every meeting, so a regenerated transcript voids it too.
  const dropAsk = () => rmSync(join(dir, 'ask.json'), { force: true })

  if (need('brief')) {
    log(`${def.slug}: brief`)
    const fresh = await completeJson(client, {
      system: SYSTEM_WRITER, prompt: briefPrompt(def, cast), maxTokens: 2000,
    }, briefFor(def.targetMin))
    drop('transcript', 'transcript.partial', ...DERIVED)
    dropAsk()
    writeJson(path('brief'), fresh)
  }
  const brief = readJson<Brief>(path('brief'))

  if (need('transcript')) {
    // Derived files go first: a crash after this point can only leave too little, never stale, data.
    drop(...DERIVED)
    dropAsk()
    if (force) drop('transcript.partial')
    // Chapters are saved as they finish, so a failure at chapter 7 of 8 keeps chapters 1-6.
    const saved = exists(path('transcript.partial'))
      ? z.array(chapterLinesSchema(names)).max(brief.chapters.length).safeParse(readJson(path('transcript.partial')))
      : null
    const chunks: Line[][] = saved?.success ? saved.data : []
    if (saved && !saved.success) log(`${def.slug}: ignoring unusable transcript.partial.json`)
    for (let index = chunks.length; index < brief.chapters.length; index++) {
      const chapter = brief.chapters[index]
      log(`${def.slug}: chapter ${index + 1}/${brief.chapters.length} "${chapter.title}"`)
      const mustSpeak = def.showcase ? spotlight(names, index, brief.chapters.length) : []
      chunks.push(await completeJson(client, {
        system: SYSTEM_WRITER,
        prompt: chapterPrompt({
          def, cast, chapter, index, total: brief.chapters.length,
          prev: chunks.flat().slice(-15), words: Math.round(chapter.minutes * 150),
        }),
        maxTokens: 8000,
      }, chapterLinesSchema(names, mustSpeak)))
      writeJson(path('transcript.partial'), chunks)
    }
    const file = buildTranscript(chunks, brief.chapters.map((chapter) => chapter.title), def, log)
    writeJson(path('transcript'), file)
    drop('transcript.partial')
  }
  const transcript = readJson<TranscriptFile>(path('transcript'))
  const text = formatTranscript(transcript.lines)
  const date = startedAt(def)
  const isoDate = date.toISOString().slice(0, 10)

  if (need('summaries')) {
    if (force) drop('summaries.partial')
    // Finished templates are kept in a partial file, so a resume only re-asks the ones that failed.
    const have: Partial<Record<Template, unknown>> = exists(path('summaries.partial')) ? readJson(path('summaries.partial')) : {}
    const todo = TEMPLATES.filter((template) => !summaryFor(template).safeParse(have[template]).success)
    log(`${def.slug}: summaries (${todo.join(', ') || 'all cached'})`)
    const settled = await Promise.allSettled(todo.map(async (template) => {
      have[template] = await completeJson(client, {
        system: SYSTEM_ANALYST,
        prompt: summaryPrompt(template, { title: def.title, date: isoDate, transcript: text }),
        maxTokens: 3000,
      }, summaryFor(template))
      writeJson(path('summaries.partial'), have)
    }))
    const failed = settled.flatMap((result, i) => (result.status === 'rejected' ? [`${todo[i]}: ${result.reason?.message ?? result.reason}`] : []))
    if (failed.length) throw new Error(`summaries failed for ${failed.join('; ')} (the rest are kept; re-run to retry)`)
    writeJson(path('summaries'), Object.fromEntries(TEMPLATES.map((template) => [template, have[template]])))
    drop('summaries.partial')
  }

  if (need('actions')) {
    log(`${def.slug}: action items`)
    const got = await completeJson(client, {
      system: SYSTEM_ANALYST,
      prompt: actionItemsPrompt({
        title: def.title, date: isoDate, weekday: WEEKDAYS[date.getUTCDay()], transcript: text, speakers: names,
      }),
      maxTokens: 2500,
    }, actionItemsSchema(names, transcript.lines.length - 1))
    writeJson(path('actions'), buildActions(got.action_items, transcript, def, log))
  }

  if (need('highlights')) {
    log(`${def.slug}: highlights`)
    const got = await completeJson(client, {
      system: SYSTEM_ANALYST,
      prompt: highlightsPrompt({ title: def.title, transcript: text }),
      maxTokens: 1500,
    }, highlightPicksSchema(transcript.lines.length - 1))
    const rows = buildHighlights(got.highlights, transcript)
    writeJson(path('highlights'), rows)
  }
}
