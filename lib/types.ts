import type { HighlightType, SummaryContent, Template } from './schema'

export type Platform = 'zoom' | 'meet' | 'teams'

export type MeetingRow = {
  id: string; slug: string; title: string; kind: string; platform: Platform
  started_at: string; duration_sec: number; highlight_sec: number; host_id: string
}
export type MeetingListItem = MeetingRow & {
  host: { name: string; role: string } | null
  participants: { name: string; is_internal: boolean }[]
}
export type ParticipantRow = {
  id: string; name: string; role: string; is_internal: boolean
  talk_time_sec: number; questions: number; longest_monologue_sec: number
}
export type SegmentRow = { idx: number; participant_id: string; start_ms: number; end_ms: number; text: string }
export type ChapterRow = { start_ms: number; title: string }
export type ActionItemRow = { id: string; owner: string; task: string; due: string | null; start_ms: number }
export type HighlightRow = {
  id: string; user_id: string | null; type: HighlightType; title: string
  note: string | null; start_ms: number; end_ms: number
}
export type SummaryRow = { template: Template; content: SummaryContent; user_id: string | null; source: 'seed' | 'live' }

export type MeetingBundle = {
  meeting: MeetingRow & { host: { name: string; role: string } | null }
  participants: ParticipantRow[]
  segments: SegmentRow[]
  chapters: ChapterRow[]
  actionItems: ActionItemRow[]
  highlights: HighlightRow[]
  summaries: Partial<Record<Template, { content: SummaryContent; source: 'seed' | 'live' }>>
}

export type UpcomingEvent = { id: string; title: string; platform: Platform; starts_at: string }
export type TeamStatRow = {
  member_id: string; name: string; role: string; calls: number
  talk_sec: number; talk_pct: number; questions: number; longest_monologue_sec: number
}
export type AskCitation = { meeting_slug: string; segment_idx: number; start_ms: number; label: string }
export type AskAnswerRow = { id: string; prompt: string; scope: string; answer: { text: string; citations: AskCitation[] } }
export type SearchHit = {
  meeting_id: string; meeting_slug: string; meeting_title: string; segment_idx: number
  start_ms: number; speaker: string; snippet: string; rank: number
}
