import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { ASK_PROMPTS } from '@/lib/prompts'
import {
  actionsFileSchema, askFileSchema, briefSchema, highlightsFileSchema, MAX_CLIP_MS,
  summariesFileSchema, transcriptFileSchema,
} from '@/lib/schema'
import { exists, fileOf, GEN_DIR, readJson } from './io'
import { castOf, MEETINGS, validateDefs, type MeetingDef } from './meetings'

export type MeetingFiles = Record<'brief' | 'transcript' | 'summaries' | 'actions' | 'highlights', unknown>
const FILE_NAMES = ['brief', 'transcript', 'summaries', 'actions', 'highlights'] as const

export function checkMeeting(def: MeetingDef, files: MeetingFiles): string[] {
  const errors: string[] = []
  const fail = (message: string) => errors.push(`${def.slug}: ${message}`)
  const results = {
    brief: briefSchema.safeParse(files.brief),
    transcript: transcriptFileSchema.safeParse(files.transcript),
    summaries: summariesFileSchema.safeParse(files.summaries),
    actions: actionsFileSchema.safeParse(files.actions),
    highlights: highlightsFileSchema.safeParse(files.highlights),
  }
  for (const [name, result] of Object.entries(results)) {
    if (!result.success) {
      const issue = result.error.issues[0]
      fail(`${name}.json invalid: ${issue?.message} at ${issue?.path.join('.')}`)
    }
  }
  if (!results.transcript.success) return errors

  const transcript = results.transcript.data
  const cast = castOf(def).map((person) => person.name)
  const lines = transcript.lines
  lines.forEach((line, index) => {
    if (line.idx !== index) fail(`line ${index} has idx ${line.idx}`)
    if (!cast.includes(line.speaker)) fail(`line ${index}: unknown speaker "${line.speaker}"`)
    if (line.end_ms <= line.start_ms) fail(`line ${index}: end_ms must be after start_ms`)
    if (index > 0 && line.start_ms < lines[index - 1].start_ms) fail(`line ${index}: timestamps not monotonic`)
  })
  if (transcript.duration_ms !== lines.at(-1)!.end_ms) fail('duration_ms does not equal the last line end_ms')
  const target = def.targetMin * 60_000
  const tolerance = def.showcase ? 0.05 : 0.15
  if (Math.abs(transcript.duration_ms - target) / target > tolerance) {
    fail(`duration ${Math.round(transcript.duration_ms / 60_000)} min is outside ${tolerance * 100}% of ${def.targetMin} min`)
  }
  transcript.chapters.forEach((chapter, index) => {
    if (chapter.start_idx >= lines.length) fail(`chapter "${chapter.title}" starts past the end`)
    if (index > 0 && chapter.start_idx <= transcript.chapters[index - 1].start_idx) {
      fail(`chapter "${chapter.title}" is out of order`)
    }
  })
  if (transcript.chapters[0].start_idx !== 0) fail('first chapter must start at line 0')

  const words = lines.reduce((sum, line) => sum + line.text.trim().split(/\s+/).length, 0)
  if (words / lines.length < 7) {
    fail(`average words per line is ${(words / lines.length).toFixed(1)} (<7): dialogue looks terse`)
  }

  if (def.showcase) {
    const talk = new Map<string, number>()
    for (const line of lines) talk.set(line.speaker, (talk.get(line.speaker) ?? 0) + line.end_ms - line.start_ms)
    const total = [...talk.values()].reduce((sum, ms) => sum + ms, 0)
    for (const name of cast) {
      const share = (talk.get(name) ?? 0) / total
      if (share < 0.02) fail(`${name} talk share is ${(share * 100).toFixed(1)}% (<2%)`)
    }
  }

  if (results.actions.success) {
    for (const action of results.actions.data) {
      if (action.segment_idx >= lines.length) fail(`action "${action.task}": segment_idx out of range`)
      else if (lines[action.segment_idx].start_ms !== action.start_ms) {
        fail(`action "${action.task}": start_ms does not match its line`)
      }
      if (!cast.includes(action.owner)) fail(`action "${action.task}": owner "${action.owner}" is not in the cast`)
    }
  }
  if (results.highlights.success) {
    const highlights = results.highlights.data
    if (highlights.length < 3 || highlights.length > 6) fail(`expected 3 to 6 highlights, found ${highlights.length}`)
    for (const highlight of highlights) {
      if (highlight.segment_idx >= lines.length) fail(`highlight "${highlight.title}": segment_idx out of range`)
      if (highlight.end_ms <= highlight.start_ms || highlight.end_ms - highlight.start_ms > MAX_CLIP_MS) {
        fail(`highlight window for "${highlight.title}" must be positive and at most 5 minutes`)
      }
    }
  }
  return errors
}

export function checkAsk(ask: unknown, lineCounts: Map<string, number>): string[] {
  const parsed = askFileSchema.safeParse(ask)
  if (!parsed.success) return [`ask.json invalid: ${parsed.error.issues[0]?.message}`]
  const errors: string[] = []
  for (const prompt of ASK_PROMPTS) {
    if (!parsed.data.some((answer) => answer.prompt === prompt)) errors.push(`ask.json: missing answer for "${prompt}"`)
  }
  for (const answer of parsed.data) {
    for (const citation of answer.citations) {
      const count = lineCounts.get(citation.meeting_slug)
      if (count === undefined || citation.segment_idx >= count) {
        errors.push(`ask "${answer.prompt}": citation ${citation.meeting_slug}#${citation.segment_idx} does not resolve`)
      }
    }
  }
  return errors
}

export function runAll(dir: string = GEN_DIR): { errors: string[]; info: string[] } {
  const errors = [...validateDefs()]
  const info: string[] = []
  const counts = new Map<string, number>()
  for (const def of MEETINGS) {
    const missing = FILE_NAMES.filter((name) => !exists(fileOf(def.slug, name, dir)))
    if (missing.length) {
      errors.push(`${def.slug}: missing ${missing.join(', ')}`)
      continue
    }
    const files = Object.fromEntries(FILE_NAMES.map((name) => [name, readJson(fileOf(def.slug, name, dir))])) as MeetingFiles
    errors.push(...checkMeeting(def, files))
    const transcript = transcriptFileSchema.safeParse(files.transcript)
    if (transcript.success) {
      counts.set(def.slug, transcript.data.lines.length)
      const highlights = highlightsFileSchema.safeParse(files.highlights)
      info.push(`${def.slug}: ${transcript.data.lines.length} lines, ${Math.round(transcript.data.duration_ms / 60_000)} min, ${highlights.success ? highlights.data.length : 0} highlights`)
    }
  }
  const askPath = join(dir, 'ask.json')
  if (!exists(askPath)) errors.push('ask.json is missing')
  else errors.push(...checkAsk(readJson(askPath), counts))
  return { errors, info }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, info } = runAll()
  info.forEach((line) => console.log(line))
  if (errors.length) {
    errors.forEach((error) => console.error(`ERROR ${error}`))
    console.error(`\n${errors.length} problem(s)`)
    process.exit(1)
  }
  console.log('\nseed:check passed')
}
