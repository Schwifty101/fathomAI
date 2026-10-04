import { completeJson, type LlmClient } from '@/lib/llm'
import { expandToRun } from '@/lib/speaker-runs'
import {
  actionItemsSchema, briefSchema, chapterLinesSchema, highlightPicksSchema,
  summaryContentSchema, TEMPLATES, type Brief, type TranscriptFile,
} from '@/lib/schema'
import {
  actionItemsPrompt, briefPrompt, chapterPrompt, formatTranscript, highlightsPrompt,
  SYSTEM_ANALYST, SYSTEM_WRITER, summaryPrompt,
} from '@/lib/prompts'
import { resolveDue } from '../due'
import { exists, fileOf, GEN_DIR, readJson, writeJson } from '../io'
import { castOf, startedAt, type MeetingDef } from '../meetings'
import { stampTimestamps, type Line } from '../stamp'

export type GenOptions = { dir?: string; force?: boolean; log?: (message: string) => void }

const hashSeed = (value: string) => [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function generateMeeting(client: LlmClient, def: MeetingDef, opts: GenOptions = {}): Promise<void> {
  const { dir = GEN_DIR, force = false, log = console.log } = opts
  const cast = castOf(def)
  const names = cast.map((person) => person.name)
  const path = (name: string) => fileOf(def.slug, name, dir)
  const need = (name: string) => force || !exists(path(name))

  if (need('brief')) {
    log(`${def.slug}: brief`)
    const brief = await completeJson(client, {
      system: SYSTEM_WRITER, prompt: briefPrompt(def, cast), maxTokens: 2000,
    }, briefSchema)
    writeJson(path('brief'), brief)
  }
  const brief = readJson<Brief>(path('brief'))

  if (need('transcript')) {
    const lines: Line[] = []
    const chapters: { title: string; start_idx: number }[] = []
    for (let index = 0; index < brief.chapters.length; index++) {
      const chapter = brief.chapters[index]
      log(`${def.slug}: chapter ${index + 1}/${brief.chapters.length} "${chapter.title}"`)
      chapters.push({ title: chapter.title, start_idx: lines.length })
      const got = await completeJson(client, {
        system: SYSTEM_WRITER,
        prompt: chapterPrompt({
          def, cast, chapter, index, total: brief.chapters.length,
          prev: lines.slice(-15), words: Math.round(chapter.minutes * 150),
        }),
        maxTokens: 8000,
      }, chapterLinesSchema(names))
      lines.push(...got)
    }
    const stamped = stampTimestamps(lines, { targetMs: def.targetMin * 60_000, seed: hashSeed(def.slug) })
    const file: TranscriptFile = { lines: stamped, chapters, duration_ms: stamped.at(-1)!.end_ms }
    writeJson(path('transcript'), file)
  }
  const transcript = readJson<TranscriptFile>(path('transcript'))
  const text = formatTranscript(transcript.lines)
  const date = startedAt(def)
  const isoDate = date.toISOString().slice(0, 10)

  if (need('summaries')) {
    log(`${def.slug}: summaries`)
    const entries = await Promise.all(TEMPLATES.map(async (template) => [
      template,
      await completeJson(client, {
        system: SYSTEM_ANALYST,
        prompt: summaryPrompt(template, { title: def.title, date: isoDate, transcript: text }),
        maxTokens: 3000,
      }, summaryContentSchema),
    ] as const))
    writeJson(path('summaries'), Object.fromEntries(entries))
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
    writeJson(path('actions'), got.action_items.map((action) => ({
      owner: action.owner,
      task: action.task,
      due: resolveDue(action.due_phrase, date),
      segment_idx: action.segment_idx,
      start_ms: transcript.lines[action.segment_idx].start_ms,
    })))
  }

  if (need('highlights')) {
    log(`${def.slug}: highlights`)
    const got = await completeJson(client, {
      system: SYSTEM_ANALYST,
      prompt: highlightsPrompt({ title: def.title, transcript: text }),
      maxTokens: 1500,
    }, highlightPicksSchema(transcript.lines.length - 1))
    const segments = transcript.lines.map((line) => ({
      participant_id: line.speaker, start_ms: line.start_ms, end_ms: line.end_ms,
    }))
    writeJson(path('highlights'), got.highlights.flatMap((pick) => {
      const run = expandToRun(segments, pick.segment_idx)
      return run ? [{
        segment_idx: pick.segment_idx, type: pick.type, title: pick.title,
        start_ms: run.start_ms, end_ms: run.end_ms,
      }] : []
    }))
  }
}
