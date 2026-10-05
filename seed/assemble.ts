// Builds a meeting bundle from hand-written parts, without `claude -p`:
//   npm run seed:assemble -- <slug>
// Reads seed/generated/<slug>/{brief,summaries,lines,picks}.json. Brief and summaries are final files.
// lines.json is { chapters: [{ title, lines: [{ speaker, text }] }] } and picks.json is
// { action_items: [{ owner, task, due_phrase, segment_idx }], highlights: [{ segment_idx, type, title }] }.
// Timestamps, due dates, highlight windows and chapter indices are computed here, as seed:gen does.
import { rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { actionItemsSchema, briefFor, chapterLinesSchema, highlightPicksSchema, type Brief } from '@/lib/schema'
import { checkMeeting, type MeetingFiles } from './check'
import { buildActions, buildHighlights, buildTranscript } from './gen/meeting'
import { fileOf, GEN_DIR, readJson, writeJson } from './io'
import { castOf, MEETINGS } from './meetings'

export function assemble(slug: string, dir: string = GEN_DIR, log: (m: string) => void = console.log): string[] {
  const def = MEETINGS.find((m) => m.slug === slug)
  if (!def) throw new Error(`no meeting "${slug}"`)
  const names = castOf(def).map((c) => c.name)
  const at = (name: string) => fileOf(slug, name, dir)

  const brief = briefFor(def.targetMin).parse(readJson<Brief>(at('brief')))
  const { chapters } = z.object({
    chapters: z.array(z.object({ title: z.string(), lines: chapterLinesSchema(names) })),
  }).parse(readJson(at('lines')))
  if (chapters.map((c) => c.title).join('\n') !== brief.chapters.map((c) => c.title).join('\n')) {
    throw new Error('lines.json chapter titles must equal brief.json chapter titles, in order')
  }
  const transcript = buildTranscript(chapters.map((c) => c.lines), chapters.map((c) => c.title), def, log)
  const maxIdx = transcript.lines.length - 1
  const picks = z.object({
    action_items: actionItemsSchema(names, maxIdx).shape.action_items,
    highlights: highlightPicksSchema(maxIdx).shape.highlights,
  }).parse(readJson(at('picks')))

  writeJson(at('transcript'), transcript)
  writeJson(at('actions'), buildActions(picks.action_items, transcript, def, log))
  writeJson(at('highlights'), buildHighlights(picks.highlights, transcript))

  const files = Object.fromEntries(
    ['brief', 'transcript', 'summaries', 'actions', 'highlights'].map((n) => [n, readJson(at(n))]),
  ) as MeetingFiles
  const errors = checkMeeting(def, files)
  if (!errors.length) ['lines', 'picks'].forEach((n) => rmSync(at(n), { force: true }))
  return errors
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2]
  if (!slug) throw new Error('usage: npm run seed:assemble -- <slug>')
  const errors = assemble(slug)
  if (errors.length) {
    errors.forEach((e) => console.error(`ERROR ${e}`))
    process.exit(1)
  }
  console.log(`${slug}: assembled and checked`)
}
