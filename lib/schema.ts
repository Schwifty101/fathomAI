import { z } from 'zod'

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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const summaryContentSchema = z.object({
  sections: z
    .array(z.object({ heading: z.string().min(1), bullets: z.array(z.string().min(1)).min(1) }))
    .min(1),
})
export type SummaryContent = z.infer<typeof summaryContentSchema>

export const lineSchema = z.object({ speaker: z.string().min(1), text: z.string().min(1) })

export const chapterLinesSchema = (speakers: readonly string[]) =>
  z.array(lineSchema).min(1).refine((ls) => ls.every((l) => speakers.includes(l.speaker)), {
    message: `speaker must be exactly one of: ${speakers.join(', ')}`,
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

export const askAnswerSchema = (slugs: readonly string[]) =>
  z.object({
    text: z.string().min(1),
    citations: z
      .array(z.object({
        meeting_slug: z.string().refine((s) => slugs.includes(s), { message: 'unknown meeting_slug' }),
        segment_idx: z.number().int().min(0),
        label: z.string().min(1),
      }))
      .min(1),
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

export const summariesFileSchema = z.object({
  general: summaryContentSchema,
  sales: summaryContentSchema,
  standup: summaryContentSchema,
  project_review: summaryContentSchema,
})

export const actionsFileSchema = z.array(z.object({
  owner: z.string().min(1),
  task: z.string().min(1),
  due: isoDate.nullable(),
  segment_idx: z.number().int().min(0),
  start_ms: z.number().int().min(0),
}))

export const highlightsFileSchema = z.array(z.object({
  segment_idx: z.number().int().min(0),
  type: z.enum(HIGHLIGHT_TYPES),
  title: z.string().min(1),
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(1),
}))

export const askFileSchema = z.array(z.object({
  prompt: z.string().min(1),
  scope: z.string().min(1),
  text: z.string().min(1),
  citations: z.array(z.object({
    meeting_slug: z.string().min(1),
    segment_idx: z.number().int().min(0),
    label: z.string().min(1),
  })).min(1),
}))
