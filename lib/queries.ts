import type { SupabaseClient } from '@supabase/supabase-js'
import { TEMPLATES, type Template } from './schema'
import type {
  AskAnswerRow, MeetingBundle, MeetingListItem, SearchHit, ShareRow, SummaryRow, TeamStatRow, UpcomingEvent,
} from './types'

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

// PostgREST caps responses at 1000 rows; a transcript can exceed that.
export async function selectAll<T>(page: (from: number, to: number) => Page<T>, size = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < size) return out
  }
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

export function pickSummaries(rows: SummaryRow[], userId: string | null): MeetingBundle['summaries'] {
  const out: MeetingBundle['summaries'] = {}
  for (const template of TEMPLATES as readonly Template[]) {
    const own = userId ? rows.find((row) => row.template === template && row.user_id === userId) : undefined
    const seed = rows.find((row) => row.template === template && row.user_id === null)
    const chosen = own ?? seed
    if (chosen) out[template] = { content: chosen.content, source: chosen.source }
  }
  return out
}

export async function getDemoPersona(db: SupabaseClient): Promise<{ id: string; name: string } | null> {
  return unwrap(await db.from('team_members').select('id,name').eq('is_demo_user', true).maybeSingle())
}

export async function listMeetings(db: SupabaseClient, opts: { hostId?: string } = {}): Promise<MeetingListItem[]> {
  let query = db.from('meetings')
    .select('*, host:team_members(name, role), participants(name, is_internal)')
    .order('started_at', { ascending: false })
  if (opts.hostId) query = query.eq('host_id', opts.hostId)
  return unwrap(await query) as unknown as MeetingListItem[]
}

// My Calls. Without a demo persona there are no calls of "mine"; falling back to an unfiltered list would show
// every call under that label (the Ask scope for my_calls returns nothing in the same case, see lib/ask-db.ts).
export async function listMyMeetings(
  db: SupabaseClient,
): Promise<{ persona: { id: string; name: string } | null; meetings: MeetingListItem[] }> {
  const persona = await getDemoPersona(db)
  return { persona, meetings: persona ? await listMeetings(db, { hostId: persona.id }) : [] }
}

export async function getMeetingBundle(
  db: SupabaseClient,
  slug: string,
  userId: string | null,
): Promise<MeetingBundle | null> {
  const meeting = unwrap(await db.from('meetings').select('*, host:team_members(name, role)').eq('slug', slug).maybeSingle()) as MeetingBundle['meeting'] | null
  if (!meeting) return null
  const id = meeting.id
  const [participants, segments, chapters, actionItems, highlights, summaries] = await Promise.all([
    db.from('participants')
      .select('id,name,role,is_internal,talk_time_sec,questions,longest_monologue_sec')
      .eq('meeting_id', id).order('talk_time_sec', { ascending: false }),
    selectAll<MeetingBundle['segments'][number]>((from, to) =>
      db.from('segments').select('idx,participant_id,start_ms,end_ms,text')
        .eq('meeting_id', id).order('idx').range(from, to)),
    db.from('chapters').select('start_ms,title').eq('meeting_id', id).order('start_ms'),
    db.from('action_items').select('id,owner,task,due,start_ms').eq('meeting_id', id).order('start_ms'),
    db.from('highlights').select('id,user_id,type,title,note,start_ms,end_ms').eq('meeting_id', id).order('start_ms'),
    db.from('summaries').select('template,content,user_id,source').eq('meeting_id', id),
  ])
  return {
    meeting,
    participants: unwrap(participants) as MeetingBundle['participants'],
    segments,
    chapters: unwrap(chapters) as MeetingBundle['chapters'],
    actionItems: unwrap(actionItems) as MeetingBundle['actionItems'],
    highlights: unwrap(highlights) as MeetingBundle['highlights'],
    summaries: pickSummaries(unwrap(summaries) as SummaryRow[], userId),
  }
}

export async function listUpcoming(db: SupabaseClient): Promise<UpcomingEvent[]> {
  return unwrap(await db.from('calendar_upcoming').select('*').order('starts_at')) as UpcomingEvent[]
}

export async function getTeamStats(db: SupabaseClient): Promise<TeamStatRow[]> {
  return unwrap(await db.from('team_stats').select('*').order('calls', { ascending: false })) as TeamStatRow[]
}

export async function listAskAnswers(db: SupabaseClient): Promise<AskAnswerRow[]> {
  return unwrap(await db.from('ask_answers').select('*').order('prompt')) as AskAnswerRow[]
}

export async function searchSegments(
  db: SupabaseClient,
  q: string,
  scope: { hostId?: string; meetingId?: string } = {},
  max = 30,
): Promise<SearchHit[]> {
  return unwrap(await db.rpc('search_segments', {
    q, scope_host: scope.hostId ?? null, scope_meeting: scope.meetingId ?? null, max_rows: max,
  })) as SearchHit[]
}

export async function getMyShares(db: SupabaseClient, meetingId: string): Promise<ShareRow[]> {
  const result = await db.from('shares').select('slug,start_ms,end_ms')
    .eq('meeting_id', meetingId).order('created_at', { ascending: false })
  return unwrap(result) as ShareRow[]
}
