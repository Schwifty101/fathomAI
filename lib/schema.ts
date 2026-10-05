import { z } from 'zod'
import { TEMPLATE_GUIDE } from './prompts'

export const HIGHLIGHT_TYPES = [
  'action_item', 'insight', 'positive', 'feedback', 'objection', 'tech_question',
] as const
export type HighlightType = (typeof HIGHLIGHT_TYPES)[number]

export const HIGHLIGHT_META: Record<HighlightType, { label: string; token: string }> = {
  action_item: { label: 'Action item', token: 'action' },
  insight: { label: 'Insight', token: 'insight' },
  positive: { label: 'Positive', token: 'positive' },
  feedback: { label: 'Feedback', token: 'feedback' },
  objection: { label: 'Objection', token: 'objection' },
  tech_question: { label: 'Tech question', token: 'tech' },
}
export const hlColor = (t: HighlightType) => `var(--color-hl-${HIGHLIGHT_META[t].token})`

export const TEMPLATES = ['general', 'sales', 'standup', 'project_review'] as const
export type Template = (typeof TEMPLATES)[number]
export const TEMPLATE_LABELS: Record<Template, string> = {
  general: 'General', sales: 'Sales', standup: 'Standup', project_review: 'Project review',
}

export const MEETING_KINDS = [
  'sales', 'standup', 'one_on_one', 'interview', 'postmortem', 'design_review', 'planning',
] as const
export const PLATFORMS = ['zoom', 'meet', 'teams'] as const
export const MAX_CLIP_MS = 300_000

// Postgres rejects '2026-02-31'; a regex alone would let it through the check.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (s) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s },
  { message: 'not a real calendar date' },
)
export const ASK_SCOPES = ['my_calls', 'team_calls'] as const
export type AskSeedScope = (typeof ASK_SCOPES)[number]
const MAX_SEGMENT_IDX = 100_000
const segmentIdx = z.number().int().min(0).max(MAX_SEGMENT_IDX)

export const summaryContentSchema = z.object({
  sections: z
    .array(z.object({ heading: z.string().min(1), bullets: z.array(z.string().min(1)).min(1) }))
    .min(1),
})
export type SummaryContent = z.infer<typeof summaryContentSchema>

export const lineSchema = z.object({ speaker: z.string().min(1), text: z.string().min(1) })

export const chapterLinesSchema = (speakers: readonly string[], mustSpeak: readonly string[] = []) =>
  z.array(lineSchema).min(1)
    .refine((ls) => ls.every((l) => speakers.includes(l.speaker)), {
      message: `speaker must be exactly one of: ${speakers.join(', ')}`,
    })
    .refine((ls) => mustSpeak.every((n) => ls.filter((l) => l.speaker === n).length >= 2), {
      message: `each of these people must speak at least twice in this chapter: ${mustSpeak.join(', ')}`,
    })

export const briefSchema = z.object({
  agenda: z.array(z.string().min(1)).min(1),
  chapters: z
    .array(z.object({
      title: z.string().min(1),
      beats: z.array(z.string().min(1)).min(1),
      minutes: z.number().positive(),
    }))
    .min(3),
})
export type Brief = z.infer<typeof briefSchema>

// The transcript is stamped toward targetMin, so a brief that plans a different length cannot land on it.
export const BRIEF_MINUTES_TOLERANCE = 0.05
export const briefFor = (targetMin: number) =>
  briefSchema.refine(
    (b) => Math.abs(b.chapters.reduce((sum, c) => sum + c.minutes, 0) - targetMin) <= targetMin * BRIEF_MINUTES_TOLERANCE,
    { message: `chapter minutes must add up to ${targetMin} (within 5%)` },
  )

export const actionItemsSchema = (speakers: readonly string[], maxIdx: number) =>
  z.object({
    action_items: z
      .array(z.object({
        owner: z.string().refine((o) => speakers.includes(o), { message: 'owner must be a participant' }),
        task: z.string().min(1),
        due_phrase: z.string().nullable(),
        segment_idx: z.number().int().min(0).max(maxIdx),
      }))
      .min(1),
  })

export const highlightPicksSchema = (maxIdx: number) =>
  z.object({
    highlights: z
      .array(z.object({
        segment_idx: z.number().int().min(0).max(maxIdx),
        type: z.enum(HIGHLIGHT_TYPES),
        title: z.string().min(1).max(80),
      }))
      .min(3)
      .max(6),
  })

// `allowed` (slug -> segment indices the model was shown) rejects citations to lines it never saw.
export const askAnswerSchema = (slugs: readonly string[], allowed?: ReadonlyMap<string, ReadonlySet<number>>) =>
  z.object({
    text: z.string().min(1),
    citations: z
      .array(z.object({
        meeting_slug: z.string().refine((s) => slugs.includes(s), { message: 'unknown meeting_slug' }),
        segment_idx: segmentIdx,
        label: z.string().min(1),
      }))
      .min(1),
  }).refine((a) => !allowed || a.citations.every((c) => allowed.get(c.meeting_slug)?.has(c.segment_idx)), {
    message: 'cite only meeting_slug and segment_idx pairs that appear in the notes',
  })

export const liveAskSchema = z.object({ text: z.string().min(1), refs: z.array(z.string()) })

// Shapes of the committed seed files (validated by seed:check)
export const transcriptFileSchema = z.object({
  lines: z
    .array(z.object({
      idx: z.number().int().min(0),
      speaker: z.string().min(1),
      text: z.string().min(1),
      start_ms: z.number().int().min(0),
      end_ms: z.number().int().min(1),
    }))
    .min(1),
  chapters: z.array(z.object({ title: z.string().min(1), start_idx: z.number().int().min(0) })).min(1),
  duration_ms: z.number().int().positive(),
})
export type TranscriptFile = z.infer<typeof transcriptFileSchema>

// A summary may omit sections the transcript does not support, but never invent headings.
export const summaryFor = (template: Template) =>
  summaryContentSchema.refine(
    (s) => s.sections.every((x) => TEMPLATE_GUIDE[template].headings.includes(x.heading)),
    { message: `headings must come from: ${TEMPLATE_GUIDE[template].headings.join(' | ')}` },
  ).refine((s) => new Set(s.sections.map((x) => x.heading)).size === s.sections.length, {
    message: 'each heading may appear only once',
  })

export const summariesFileSchema = z.object({
  general: summaryFor('general'),
  sales: summaryFor('sales'),
  standup: summaryFor('standup'),
  project_review: summaryFor('project_review'),
})

export const actionsFileSchema = z.array(z.object({
  owner: z.string().min(1),
  task: z.string().min(1),
  due: isoDate.nullable(),
  due_phrase: z.string().nullable().optional(), // spoken wording; seed:check fails if it did not resolve to `due`
  segment_idx: segmentIdx,
  start_ms: z.number().int().min(0),
}))

export const highlightsFileSchema = z.array(z.object({
  segment_idx: segmentIdx,
  type: z.enum(HIGHLIGHT_TYPES),
  title: z.string().min(1).max(80), // matches the highlights_title_len DB check
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(1),
}))

export const askFileSchema = z.array(z.object({
  prompt: z.string().min(1),
  scope: z.enum(ASK_SCOPES),
  text: z.string().min(1),
  citations: z.array(z.object({
    meeting_slug: z.string().min(1),
    segment_idx: segmentIdx,
    label: z.string().min(1),
  })).min(1),
}))
