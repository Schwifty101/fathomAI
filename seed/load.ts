import { guardTarget } from '../scripts/guard-target'; guardTarget() // refuses a wrong target; runs before the client below
import { createClient } from '@supabase/supabase-js'
import { deriveParticipantStats, unionSeconds } from '@/lib/stats'
import type { SummaryContent, TranscriptFile } from '@/lib/schema'
import { runAll } from './check'
import { fileOf, readJson } from './io'
import { castOf, MEETINGS, startedAt } from './meetings'
import { TEAM } from './team'
import { seedId } from './uuid'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function upsert(table: string, rows: object[], batch = 500) {
  for (let index = 0; index < rows.length; index += batch) {
    const { error } = await db.from(table).upsert(rows.slice(index, index + batch), { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

async function clearSeeded(table: string, meetingId: string, seededOnly = false) {
  let query = db.from(table).delete().eq('meeting_id', meetingId)
  if (seededOnly) query = query.is('user_id', null)
  const { error } = await query
  if (error) throw new Error(`clear ${table}: ${error.message}`)
}

const EVENTS = [
  { title: 'Weekly Product Sync // Kestrel', platform: 'zoom', day_offset: 1, time_of_day: '10:00' },
  { title: 'Discovery Call // Brightline Couriers', platform: 'meet', day_offset: 1, time_of_day: '15:30' },
  { title: 'Engineering Standup', platform: 'zoom', day_offset: 2, time_of_day: '09:30' },
  { title: 'Customer Interview // Northgate Transport', platform: 'zoom', day_offset: 3, time_of_day: '17:00' },
  { title: 'Q4 Planning Checkpoint', platform: 'teams', day_offset: 5, time_of_day: '14:00' },
]

async function main() {
  const { errors } = runAll()
  if (errors.length) {
    errors.forEach((error) => console.error(`ERROR ${error}`))
    throw new Error('seed:check failed; fix the data before loading')
  }

  await upsert('team_members', TEAM.map((member) => ({
    id: seedId('member', member.slug), name: member.name, role: member.role, is_demo_user: !!member.demo,
  })))

  const lineCounts = new Map<string, TranscriptFile['lines']>()
  for (const def of MEETINGS) {
    const transcript = readJson<TranscriptFile>(fileOf(def.slug, 'transcript'))
    const summaries = readJson<Record<string, SummaryContent>>(fileOf(def.slug, 'summaries'))
    const actions = readJson<{ owner: string; task: string; due: string | null; start_ms: number }[]>(fileOf(def.slug, 'actions'))
    const highlights = readJson<{ type: string; title: string; start_ms: number; end_ms: number }[]>(fileOf(def.slug, 'highlights'))
    lineCounts.set(def.slug, transcript.lines)

    const meetingId = seedId('meeting', def.slug)
    const cast = castOf(def)
    const participantId = (name: string) => seedId('participant', `${def.slug}:${name}`)
    const stats = deriveParticipantStats(transcript.lines.map((line) => ({
      participant_id: participantId(line.speaker), start_ms: line.start_ms, end_ms: line.end_ms, text: line.text,
    })))

    await clearSeeded('chapters', meetingId)
    await clearSeeded('action_items', meetingId)
    await clearSeeded('segments', meetingId)
    await clearSeeded('summaries', meetingId, true)
    await clearSeeded('highlights', meetingId, true)

    await upsert('meetings', [{
      id: meetingId, slug: def.slug, title: def.title, kind: def.kind, platform: def.platform,
      started_at: startedAt(def).toISOString(), duration_sec: Math.round(transcript.duration_ms / 1000),
      highlight_sec: unionSeconds(highlights), host_id: seedId('member', def.host),
    }])
    await upsert('participants', cast.map((person) => ({
      id: participantId(person.name), meeting_id: meetingId,
      member_id: person.member ? seedId('member', person.member) : null,
      name: person.name, role: person.role, is_internal: person.is_internal,
      talk_time_sec: stats.get(participantId(person.name))?.talk_time_sec ?? 0,
      questions: stats.get(participantId(person.name))?.questions ?? 0,
      longest_monologue_sec: stats.get(participantId(person.name))?.longest_monologue_sec ?? 0,
    })))
    await upsert('segments', transcript.lines.map((line) => ({
      id: seedId('segment', `${def.slug}:${line.idx}`), meeting_id: meetingId,
      participant_id: participantId(line.speaker), idx: line.idx,
      start_ms: line.start_ms, end_ms: line.end_ms, text: line.text,
    })))
    await upsert('chapters', transcript.chapters.map((chapter) => ({
      id: seedId('chapter', `${def.slug}:${chapter.start_idx}`), meeting_id: meetingId,
      start_ms: transcript.lines[chapter.start_idx].start_ms, title: chapter.title,
    })))
    await upsert('summaries', Object.entries(summaries).map(([template, content]) => ({
      id: seedId('summary', `${def.slug}:${template}`), meeting_id: meetingId,
      template, content, user_id: null, source: 'seed', model: process.env.SEED_MODEL ?? 'sonnet',
    })))
    await upsert('action_items', actions.map((action, index) => ({
      id: seedId('action', `${def.slug}:${index}`), meeting_id: meetingId,
      owner: action.owner, task: action.task, due: action.due, start_ms: action.start_ms,
    })))
    await upsert('highlights', highlights.map((highlight, index) => ({
      id: seedId('highlight', `${def.slug}:${index}`), meeting_id: meetingId,
      user_id: null, type: highlight.type, title: highlight.title,
      start_ms: highlight.start_ms, end_ms: highlight.end_ms,
    })))
    console.log(`loaded ${def.slug}: ${transcript.lines.length} segments`)
  }

  const ask = readJson<{
    prompt: string; scope: string; text: string
    citations: { meeting_slug: string; segment_idx: number; label: string }[]
  }[]>(`${process.cwd()}/seed/generated/ask.json`)
  await upsert('ask_answers', ask.map((answer) => ({
    id: seedId('ask', answer.prompt), prompt: answer.prompt, scope: answer.scope,
    answer: {
      text: answer.text,
      citations: answer.citations.map((citation) => ({
        meeting_slug: citation.meeting_slug,
        label: citation.label,
        segment_idx: citation.segment_idx,
        start_ms: lineCounts.get(citation.meeting_slug)![citation.segment_idx].start_ms,
      })),
    },
  })))
  await upsert('calendar_events', EVENTS.map((event) => ({ id: seedId('event', event.title), ...event })))

  for (const table of [
    'team_members', 'meetings', 'participants', 'segments', 'chapters',
    'summaries', 'action_items', 'highlights', 'ask_answers', 'calendar_events',
  ]) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
    if (error) throw new Error(`${table} count: ${error.message}`)
    console.log(`${table}: ${count}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
