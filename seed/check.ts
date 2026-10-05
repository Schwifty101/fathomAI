import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { ASK_PROMPTS_BY_SCOPE } from '@/lib/prompts'
import {
  actionsFileSchema, ASK_SCOPES, askFileSchema, briefFor, highlightsFileSchema, MAX_CLIP_MS,
  summariesFileSchema, transcriptFileSchema,
} from '@/lib/schema'
import { resolveDue } from './due'
import { exists, fileOf, GEN_DIR, readJson } from './io'
import { castOf, MEETINGS, startedAt, validateDefs, type MeetingDef } from './meetings'
import { citableIdx } from './gen/ask'
import { TEAM } from './team'

export type MeetingFiles = Record<'brief' | 'transcript' | 'summaries' | 'actions' | 'highlights', unknown>
const FILE_NAMES = ['brief', 'transcript', 'summaries', 'actions', 'highlights'] as const
const MIN_SHOWCASE_SHARE = 0.03

export function checkMeeting(def: MeetingDef, files: MeetingFiles): string[] {
  const errors: string[] = []
  const fail = (message: string) => errors.push(`${def.slug}: ${message}`)
  const results = {
    brief: briefFor(def.targetMin).safeParse(files.brief),
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
  if (results.brief.success) {
    const planned = results.brief.data.chapters.map((chapter) => chapter.title)
    const actual = transcript.chapters.map((chapter) => chapter.title)
    if (planned.length !== actual.length || planned.some((title, i) => title !== actual[i])) {
      fail(`transcript chapters do not match the brief (${actual.length} vs ${planned.length} planned)`)
    }
  }

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
      if (share < MIN_SHOWCASE_SHARE) fail(`${name} talk share is ${(share * 100).toFixed(1)}% (<${MIN_SHOWCASE_SHARE * 100}%)`)
    }
  }

  if (results.actions.success) {
    for (const action of results.actions.data) {
      if (action.segment_idx >= lines.length) fail(`action "${action.task}": segment_idx out of range`)
      else if (lines[action.segment_idx].start_ms !== action.start_ms) {
        fail(`action "${action.task}": start_ms does not match its line`)
      }
      if (!cast.includes(action.owner)) fail(`action "${action.task}": owner "${action.owner}" is not in the cast`)
      if (action.due_phrase) {
        const expected = resolveDue(action.due_phrase, startedAt(def))
        if (expected === null) {
          fail(`action "${action.task}": unresolved due phrase "${action.due_phrase}" (fix due_phrase or set it to null)`)
        } else if (expected !== action.due) {
          fail(`action "${action.task}": due ${action.due} does not match "${action.due_phrase}" (${expected})`)
        }
      }
    }
  }
  if (results.highlights.success) {
    const highlights = results.highlights.data
    if (highlights.length < 3 || highlights.length > 6) fail(`expected 3 to 6 highlights, found ${highlights.length}`)
    const windows = new Set<string>()
    for (const highlight of highlights) {
      const line = lines[highlight.segment_idx]
      if (!line) fail(`highlight "${highlight.title}": segment_idx out of range`)
      else if (highlight.start_ms > line.start_ms || highlight.end_ms <= line.start_ms) {
        fail(`highlight "${highlight.title}": window does not contain its segment_idx line`)
      }
      if (highlight.end_ms <= highlight.start_ms || highlight.end_ms - highlight.start_ms > MAX_CLIP_MS) {
        fail(`highlight window for "${highlight.title}" must be positive and at most 5 minutes`)
      }
      if (highlight.end_ms > transcript.duration_ms) fail(`highlight "${highlight.title}": window ends after the meeting`)
      const key = `${highlight.start_ms}-${highlight.end_ms}`
      if (windows.has(key)) fail(`highlight "${highlight.title}": duplicates another highlight's window`)
      windows.add(key)
    }
  }
  return errors
}

export type AskInfo = Map<string, { lines: number; citable: ReadonlySet<number>; host: string }>

export function checkAsk(ask: unknown, info: AskInfo): string[] {
  const parsed = askFileSchema.safeParse(ask)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return [`ask.json invalid: ${issue?.message} at ${issue?.path.join('.')}`]
  }
  const errors: string[] = []
  const demo = TEAM.find((member) => member.demo)!.slug
  const seen = new Set<string>()
  for (const answer of parsed.data) {
    const key = `${answer.scope}\n${answer.prompt}`
    if (seen.has(key)) errors.push(`ask.json: duplicate answer for ${answer.scope} "${answer.prompt}"`)
    seen.add(key)
    for (const citation of answer.citations) {
      const meeting = info.get(citation.meeting_slug)
      const at = `${citation.meeting_slug}#${citation.segment_idx}`
      if (!meeting || citation.segment_idx >= meeting.lines) {
        errors.push(`ask ${answer.scope} "${answer.prompt}": citation ${at} does not resolve`)
      } else if (!meeting.citable.has(citation.segment_idx)) {
        errors.push(`ask ${answer.scope} "${answer.prompt}": citation ${at} is not an index the generator listed`)
      }
      if (answer.scope === 'my_calls' && meeting && meeting.host !== demo) {
        errors.push(`ask my_calls "${answer.prompt}": cites ${citation.meeting_slug}, which is not hosted by the demo persona`)
      }
    }
  }
  for (const scope of ASK_SCOPES) {
    for (const prompt of ASK_PROMPTS_BY_SCOPE[scope]) {
      if (!seen.has(`${scope}\n${prompt}`)) errors.push(`ask.json: missing ${scope} answer for "${prompt}"`)
    }
  }
  return errors
}

export function runAll(dir: string = GEN_DIR): { errors: string[]; info: string[] } {
  const errors = [...validateDefs()]
  const info: string[] = []
  const askInfo: AskInfo = new Map()
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
      const highlights = highlightsFileSchema.safeParse(files.highlights)
      const actions = actionsFileSchema.safeParse(files.actions)
      askInfo.set(def.slug, {
        lines: transcript.data.lines.length,
        citable: citableIdx(actions.success ? actions.data : [], highlights.success ? highlights.data : []),
        host: def.host,
      })
      info.push(`${def.slug}: ${transcript.data.lines.length} lines, ${Math.round(transcript.data.duration_ms / 60_000)} min, ${highlights.success ? highlights.data.length : 0} highlights`)
    }
  }
  const askPath = join(dir, 'ask.json')
  if (!exists(askPath)) errors.push('ask.json is missing')
  else errors.push(...checkAsk(readJson(askPath), askInfo))
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
