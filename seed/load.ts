import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import { guardTarget } from '../scripts/guard-target'
import { deriveParticipantStats, unionSeconds } from '@/lib/stats'
import {
  actionsFileSchema, askFileSchema, highlightsFileSchema, summariesFileSchema, TEMPLATES, transcriptFileSchema,
  type SummaryContent, type TranscriptFile,
} from '@/lib/schema'
import { runAll } from './check'
import { fileOf, GEN_DIR, readJson } from './io'
import { castOf, MEETINGS, startedAt, type MeetingDef } from './meetings'
import { TEAM, type Member } from './team'
import { seedId } from './uuid'

// seed:load [--dry-run]
//
// PostgREST has no multi-statement transaction, so the load is ordered to fail safe:
//   1. validate everything and build every row in memory (no I/O);
//   2. read what is stale (reads only, so a read failure writes nothing);
//   3. upsert, parents before children, which only ever adds or updates rows;
//   4. once every upsert has succeeded, delete the stale rows, children before parents.
// A failure before step 4 leaves a superset of the old and new rows, never a half cleared table, and
// running the loader again converges. Rows users created (highlights and summaries with a user_id,
// shares) are never selected for deletion; the one exception is a meeting that left the bundle, whose
// user rows the foreign keys cascade away. That case is counted and logged as a WARNING before it happens.
// Every other seeded table has no client write grant, so any row in it that is not in the bundle is stale.
// `--dry-run` stops after step 2 and reports what the real run would write and delete.

type Row = Record<string, unknown>

const TABLES = [
  'team_members', 'meetings', 'participants', 'segments', 'chapters',
  'summaries', 'action_items', 'highlights', 'ask_answers', 'calendar_events',
] as const
type Table = (typeof TABLES)[number]

// Children before parents. meetings cascade to the rows under them; team_members come after meetings and
// participants because meetings.host_id and participants.member_id reference them without a cascade.
const PRUNE_ORDER: Table[] = [
  'segments', 'chapters', 'action_items', 'summaries', 'highlights', 'participants',
  'meetings', 'team_members', 'calendar_events', 'ask_answers',
]
// These tables also hold rows users create (user_id set). Only the seeded rows (user_id null) are ours.
const USER_OWNED = new Set<Table>(['summaries', 'highlights'])
const READ_COLUMNS: Partial<Record<Table, string>> = {
  team_members: 'id,is_demo_user', meetings: 'id,slug', ask_answers: 'id,scope,prompt',
}
const UPSERT_BATCH = 500
const DELETE_CHUNK = 100 // ids go in the request URL; 100 uuids stay well under typical URL limits

const EVENTS = [
  { title: 'Weekly Product Sync // Kestrel', platform: 'zoom', day_offset: 1, time_of_day: '10:00' },
  { title: 'Discovery Call // Brightline Couriers', platform: 'meet', day_offset: 1, time_of_day: '15:30' },
  { title: 'Engineering Standup', platform: 'zoom', day_offset: 2, time_of_day: '09:30' },
  { title: 'Customer Interview // Northgate Transport', platform: 'zoom', day_offset: 3, time_of_day: '17:00' },
  { title: 'Q4 Planning Checkpoint', platform: 'teams', day_offset: 5, time_of_day: '14:00' },
]

export type Bundle = {
  team: readonly Member[]
  meetings: {
    def: MeetingDef
    transcript: TranscriptFile
    summaries: Record<string, SummaryContent>
    actions: { owner: string; task: string; due: string | null; start_ms: number }[]
    highlights: { type: string; title: string; start_ms: number; end_ms: number }[]
  }[]
  ask: {
    prompt: string; scope: string; text: string
    citations: { meeting_slug: string; segment_idx: number; label: string }[]
  }[]
  events: readonly { title: string; platform: string; day_offset: number; time_of_day: string }[]
  model: string
}

function parseFile<T>(schema: z.ZodType<T>, path: string): T {
  const result = schema.safeParse(readJson(path))
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(`${path}: ${issue?.message} at ${issue?.path.join('.')}`)
  }
  return result.data
}

// Reads and schema-parses every file once, so what is loaded is exactly what was validated (parsing
// also drops keys the schemas do not know, such as an extra summary template the table would reject).
export function readBundle(dir: string = GEN_DIR): Bundle {
  return {
    team: TEAM,
    meetings: MEETINGS.map((def) => ({
      def,
      transcript: parseFile(transcriptFileSchema, fileOf(def.slug, 'transcript', dir)),
      summaries: parseFile(summariesFileSchema, fileOf(def.slug, 'summaries', dir)),
      actions: parseFile(actionsFileSchema, fileOf(def.slug, 'actions', dir)),
      highlights: parseFile(highlightsFileSchema, fileOf(def.slug, 'highlights', dir)),
    })),
    ask: parseFile(askFileSchema, join(dir, 'ask.json')),
    events: EVENTS,
    model: process.env.SEED_MODEL ?? 'sonnet',
  }
}

export type Step = { table: Table; rows: Row[]; meeting?: string }
export type Plan = { steps: Step[]; rows: Record<Table, Row[]> }

// Pure: turns the bundle into every row to upsert, or throws listing everything the database would reject
// (or that would leave dangling references) so nothing is written for a bundle that cannot load.
export function buildPlan(bundle: Bundle): Plan {
  const problems: string[] = []
  const duplicates = (what: string, keys: string[]) => {
    const seen = new Set<string>()
    for (const key of keys) {
      if (seen.has(key)) problems.push(`duplicate ${what} ${key}`)
      seen.add(key)
    }
  }
  const memberIds = new Set(bundle.team.map((member) => seedId('member', member.slug)))
  if (!bundle.meetings.length) problems.push('the bundle has no meetings (refusing to prune the whole database)')
  duplicates('team member', bundle.team.map((member) => member.slug))
  duplicates('meeting', bundle.meetings.map(({ def }) => def.slug))
  duplicates('calendar event', bundle.events.map((event) => event.title))

  const steps: Step[] = [{
    table: 'team_members',
    rows: bundle.team.map((member) => ({
      id: seedId('member', member.slug), name: member.name, role: member.role, is_demo_user: !!member.demo,
    })),
  }]
  const transcripts = new Map<string, TranscriptFile['lines']>()
  for (const { def, transcript, summaries, actions, highlights } of bundle.meetings) {
    const problem = (message: string) => problems.push(`${def.slug}: ${message}`)
    transcripts.set(def.slug, transcript.lines)
    const meetingId = seedId('meeting', def.slug)
    const cast = castOf(def)
    const participantId = (name: string) => seedId('participant', `${def.slug}:${name}`)
    const stats = deriveParticipantStats(transcript.lines.map((line) => ({
      participant_id: participantId(line.speaker), start_ms: line.start_ms, end_ms: line.end_ms, text: line.text,
    })))

    if (!memberIds.has(seedId('member', def.host))) problem(`host "${def.host}" is not on the team`)
    for (const person of cast) {
      if (person.member && !memberIds.has(seedId('member', person.member))) problem(`cast member "${person.member}" is not on the team`)
    }
    duplicates(`${def.slug}: participant`, cast.map((person) => person.name))
    duplicates(`${def.slug}: line idx`, transcript.lines.map((line) => String(line.idx)))
    duplicates(`${def.slug}: chapter start`, transcript.chapters.map((chapter) => String(chapter.start_idx)))
    const names = new Set(cast.map((person) => person.name))
    for (const line of transcript.lines) {
      if (!names.has(line.speaker)) problem(`line ${line.idx}: speaker "${line.speaker}" is not in the cast`)
    }
    for (const chapter of transcript.chapters) {
      if (!transcript.lines[chapter.start_idx]) problem(`chapter "${chapter.title}" starts at line ${chapter.start_idx}, past the last line`)
    }
    for (const template of Object.keys(summaries)) {
      if (!(TEMPLATES as readonly string[]).includes(template)) problem(`unknown summary template "${template}"`)
    }

    const at = (table: Table, rows: Row[]) => steps.push({ table, rows, meeting: def.slug })
    at('meetings', [{
      id: meetingId, slug: def.slug, title: def.title, kind: def.kind, platform: def.platform,
      started_at: startedAt(def).toISOString(), duration_sec: Math.round(transcript.duration_ms / 1000),
      highlight_sec: unionSeconds(highlights), host_id: seedId('member', def.host),
    }])
    at('participants', cast.map((person) => ({
      id: participantId(person.name), meeting_id: meetingId,
      member_id: person.member ? seedId('member', person.member) : null,
      name: person.name, role: person.role, is_internal: person.is_internal,
      talk_time_sec: stats.get(participantId(person.name))?.talk_time_sec ?? 0,
      questions: stats.get(participantId(person.name))?.questions ?? 0,
      longest_monologue_sec: stats.get(participantId(person.name))?.longest_monologue_sec ?? 0,
    })))
    at('segments', transcript.lines.map((line) => ({
      id: seedId('segment', `${def.slug}:${line.idx}`), meeting_id: meetingId,
      participant_id: participantId(line.speaker), idx: line.idx,
      start_ms: line.start_ms, end_ms: line.end_ms, text: line.text,
    })))
    at('chapters', transcript.chapters.map((chapter) => ({
      id: seedId('chapter', `${def.slug}:${chapter.start_idx}`), meeting_id: meetingId,
      start_ms: transcript.lines[chapter.start_idx]?.start_ms ?? 0, title: chapter.title,
    })))
    at('summaries', Object.entries(summaries).map(([template, content]) => ({
      id: seedId('summary', `${def.slug}:${template}`), meeting_id: meetingId,
      template, content, user_id: null, source: 'seed', model: bundle.model,
    })))
    at('action_items', actions.map((action, index) => ({
      id: seedId('action', `${def.slug}:${index}`), meeting_id: meetingId,
      owner: action.owner, task: action.task, due: action.due, start_ms: action.start_ms,
    })))
    at('highlights', highlights.map((highlight, index) => ({
      id: seedId('highlight', `${def.slug}:${index}`), meeting_id: meetingId,
      user_id: null, type: highlight.type, title: highlight.title,
      start_ms: highlight.start_ms, end_ms: highlight.end_ms,
    })))
  }

  duplicates('Ask answer', bundle.ask.map((answer) => `${answer.scope} "${answer.prompt}"`))
  steps.push({
    table: 'ask_answers',
    rows: bundle.ask.map((answer) => ({
      id: seedId('ask', `${answer.scope}\n${answer.prompt}`), prompt: answer.prompt, scope: answer.scope,
      answer: {
        text: answer.text,
        citations: answer.citations.map((citation) => {
          const line = transcripts.get(citation.meeting_slug)?.[citation.segment_idx]
          if (!line) problems.push(`Ask ${answer.scope} "${answer.prompt}": citation ${citation.meeting_slug}#${citation.segment_idx} is not a transcript line`)
          return {
            meeting_slug: citation.meeting_slug, label: citation.label, segment_idx: citation.segment_idx,
            start_ms: line?.start_ms ?? 0,
          }
        }),
      },
    })),
  })
  steps.push({ table: 'calendar_events', rows: bundle.events.map((event) => ({ id: seedId('event', event.title), ...event })) })

  if (problems.length) throw new Error(`seed bundle is invalid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
  const rows = Object.fromEntries(TABLES.map((table) => [
    table, steps.filter((step) => step.table === table).flatMap((step) => step.rows),
  ])) as Record<Table, Row[]>
  return { steps, rows }
}

async function readRows(db: SupabaseClient, table: Table): Promise<Row[]> {
  const found: Row[] = []
  for (;;) {
    // The server caps every response (1000 rows by default), so page until a page comes back empty.
    let query = db.from(table).select(READ_COLUMNS[table] ?? 'id').order('id').range(found.length, found.length + 999)
    if (USER_OWNED.has(table)) query = query.is('user_id', null)
    const { data, error } = await query
    if (error) throw new Error(`read ${table}: ${error.message}`)
    if (!data?.length) return found
    found.push(...(data as unknown as Row[]))
  }
}

async function upsert(db: SupabaseClient, table: Table, rows: Row[]) {
  for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
    const { error } = await db.from(table).upsert(rows.slice(index, index + UPSERT_BATCH), { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

async function deleteIds(db: SupabaseClient, table: Table, ids: string[]) {
  for (let index = 0; index < ids.length; index += DELETE_CHUNK) {
    let query = db.from(table).delete().in('id', ids.slice(index, index + DELETE_CHUNK))
    if (USER_OWNED.has(table)) query = query.is('user_id', null)
    const { error } = await query
    if (error) throw new Error(`prune ${table}: ${error.message}`)
  }
}

async function countRows(db: SupabaseClient, table: string, meetingIds?: string[], userOnly = false): Promise<number> {
  let query = db.from(table).select('*', { count: 'exact', head: true })
  if (meetingIds) query = query.in('meeting_id', meetingIds)
  if (userOnly) query = query.not('user_id', 'is', null)
  const { count, error } = await query
  if (error) throw new Error(`${table} count: ${error.message}`)
  return count ?? 0
}

export type Report = {
  dryRun: boolean
  upserted: Record<Table, number>
  pruned: Record<Table, number> // deleted by id (in a dry run, the number that would be)
  demoted: number // old demo persona rows un-flagged so the new one can take the unique index
  cascaded: { meetings: string[]; highlights: number; summaries: number; shares: number }
  counts: Record<Table, number> // rows in each table when the call returns
}

const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const zeroed = () => Object.fromEntries(TABLES.map((table) => [table, 0])) as Record<Table, number>

export async function loadSeed(
  db: SupabaseClient,
  bundle: Bundle,
  options: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<Report> {
  const log = options.log ?? console.log
  const plan = buildPlan(bundle)

  // Everything below is read-only until the upserts start.
  const planned = Object.fromEntries(TABLES.map((table) => [table, new Set(plan.rows[table].map((row) => row.id))])) as Record<Table, Set<unknown>>
  const stale = Object.fromEntries(TABLES.map((table) => [table, [] as string[]])) as Record<Table, string[]>
  const staleMeetings: { id: string; slug: string }[] = []
  let demoted: string[] = []
  let askCollisions: string[] = []
  const demoId = plan.rows.team_members.find((row) => row.is_demo_user)?.id
  const askIds = new Map(plan.rows.ask_answers.map((row) => [`${row.scope}\n${row.prompt}`, row.id]))
  for (const table of TABLES) {
    const existing = await readRows(db, table)
    stale[table] = existing.filter((row) => !planned[table].has(row.id)).map((row) => row.id as string)
    if (table === 'meetings') {
      staleMeetings.push(...existing.filter((row) => !planned.meetings.has(row.id)).map((row) => ({ id: row.id as string, slug: row.slug as string })))
    }
    if (table === 'team_members' && demoId) {
      demoted = existing.filter((row) => row.is_demo_user === true && row.id !== demoId).map((row) => row.id as string)
    }
    if (table === 'ask_answers') {
      // A row from an older id scheme with the same (scope, prompt) would violate UNIQUE (scope, prompt)
      // when its replacement is upserted, so it has to go just before that upsert.
      const collides = (row: Row) => askIds.has(`${row.scope}\n${row.prompt}`) && askIds.get(`${row.scope}\n${row.prompt}`) !== row.id
      askCollisions = existing.filter(collides).map((row) => row.id as string)
      stale.ask_answers = stale.ask_answers.filter((id) => !askCollisions.includes(id))
    }
  }

  const staleIds = staleMeetings.map((meeting) => meeting.id)
  const cascaded = {
    meetings: staleMeetings.map((meeting) => meeting.slug),
    highlights: staleIds.length ? await countRows(db, 'highlights', staleIds, true) : 0,
    summaries: staleIds.length ? await countRows(db, 'summaries', staleIds, true) : 0,
    shares: staleIds.length ? await countRows(db, 'shares', staleIds) : 0,
  }
  const pruned = zeroed()
  for (const table of TABLES) pruned[table] = stale[table].length + (table === 'ask_answers' ? askCollisions.length : 0)
  const upserted = zeroed()
  for (const table of TABLES) upserted[table] = plan.rows[table].length

  if (cascaded.highlights + cascaded.summaries + cascaded.shares > 0) {
    log(`WARNING: pruning meeting ${cascaded.meetings.join(', ')} also removes `
      + `${noun(cascaded.highlights, 'user highlight', 'user highlights')}, `
      + `${noun(cascaded.summaries, 'user summary', 'user summaries')} and ${noun(cascaded.shares, 'share', 'shares')} `
      + '(foreign keys cascade from meetings)')
  }

  const countAll = async () => {
    const counts = zeroed()
    for (const table of TABLES) counts[table] = await countRows(db, table)
    return counts
  }
  if (options.dryRun) {
    for (const table of TABLES) log(`dry run ${table}: upsert ${upserted[table]}, prune ${pruned[table]}`)
    if (demoted.length) log(`dry run team_members: demote ${demoted.length} old demo persona row(s)`)
    log('dry run: nothing was written')
    return { dryRun: true, upserted, pruned, demoted: demoted.length, cascaded, counts: await countAll() }
  }

  for (const step of plan.steps) {
    if (step.table === 'team_members' && demoted.length) {
      const { error } = await db.from('team_members').update({ is_demo_user: false }).in('id', demoted)
      if (error) throw new Error(`demote team_members: ${error.message}`)
    }
    if (step.table === 'ask_answers' && askCollisions.length) await deleteIds(db, 'ask_answers', askCollisions)
    await upsert(db, step.table, step.rows)
    if (step.table === 'segments') log(`loaded ${step.meeting}: ${step.rows.length} segments`)
  }
  for (const table of PRUNE_ORDER) {
    await deleteIds(db, table, stale[table])
    if (pruned[table]) log(`pruned ${table}: ${pruned[table]}`)
  }
  return { dryRun: false, upserted, pruned, demoted: demoted.length, cascaded, counts: await countAll() }
}

async function main() {
  guardTarget() // refuses a wrong target; runs before the client below and before anything is read or written
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--dry-run')
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(' ')} (the only option is --dry-run)`)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { errors } = runAll()
  if (errors.length) {
    errors.forEach((error) => console.error(`ERROR ${error}`))
    throw new Error('seed:check failed; fix the data before loading')
  }
  const report = await loadSeed(db, readBundle(), { dryRun: process.argv.includes('--dry-run') })
  for (const [table, count] of Object.entries(report.counts)) console.log(`${table}: ${count}`)
}

// Not a module-level side effect, so tests can import loadSeed without the guard or a client.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
