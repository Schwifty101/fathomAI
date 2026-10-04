import type { Template } from './schema'

export const SYSTEM_WRITER =
  'You are a screenwriter producing realistic, natural, fully punctuated spoken dialogue for business meetings. Use complete sentences, never terse fragments. Output exactly the format requested and nothing else.'
export const SYSTEM_ANALYST =
  'You are a precise meeting analyst. Use only facts present in the material you are given. Write complete, plain sentences. Output exactly the format requested and nothing else.'

export type PromptMeeting = { title: string; kind: string; targetMin: number; topic: string; showcase?: boolean }
export type PromptPerson = { name: string; role: string }
export type TLine = { idx: number; speaker: string; text: string }

const COMPANY =
  'Company: Kestrel. Product: Kestrel Dispatch, route planning and dispatch software for regional freight carriers.'
const people = (cast: readonly PromptPerson[]) => cast.map((c) => `${c.name} (${c.role})`).join('; ')

export const formatTranscript = (lines: readonly TLine[]) =>
  lines.map((l) => `[${l.idx}] ${l.speaker}: ${l.text}`).join('\n')

export const TEMPLATE_GUIDE: Record<Template, { headings: string[]; focus: string }> = {
  general: {
    headings: ['Overview', 'Key points', 'Decisions', 'Open questions'],
    focus: 'A neutral recap of what was discussed and decided.',
  },
  sales: {
    headings: ['Pain points', 'Current solution', 'Budget and timeline', 'Objections', 'Next steps'],
    focus: 'A sales-call view: needs, constraints, and the buying process.',
  },
  standup: {
    headings: ['Yesterday', 'Today', 'Blockers'],
    focus: 'What each person did, will do, and what blocks them. Name the person in every bullet.',
  },
  project_review: {
    headings: ['Goals', 'Progress', 'Risks', 'Decisions', 'Next steps'],
    focus: 'A project-status review.',
  },
}

export function briefPrompt(def: PromptMeeting, cast: readonly PromptPerson[]): string {
  const long = def.targetMin >= 45
  return `TASK: brief
Plan a realistic ${def.targetMin}-minute ${def.kind.replace(/_/g, ' ')} meeting titled "${def.title}".
${COMPANY}
Topic: ${def.topic}
Participants: ${people(cast)}

Return ONLY JSON: {"agenda": string[], "chapters": [{"title": string, "beats": string[], "minutes": number}]}
Rules: ${long ? '6 to 8' : '3 to 5'} chapters in meeting order; chapter minutes add up to ${def.targetMin}; each chapter has 2 to 4 concrete beats with specific numbers, names or disagreements.`
}

export function chapterPrompt(a: {
  def: PromptMeeting
  cast: readonly PromptPerson[]
  chapter: { title: string; beats: string[]; minutes: number }
  index: number
  total: number
  prev: { speaker: string; text: string }[]
  words: number
}): string {
  const last = a.index === a.total - 1
  const prev = a.prev.length
    ? `Previous lines (continue naturally, do not repeat them):\n${a.prev.map((l) => `${l.speaker}: ${l.text}`).join('\n')}`
    : 'This is the start of the meeting: include greetings.'
  return `TASK: chapter
Write chapter ${a.index + 1} of ${a.total} ("${a.chapter.title}") of the meeting "${a.def.title}" as spoken dialogue.
${COMPANY}
Topic: ${a.def.topic}
Participants (use these exact names as speakers): ${people(a.cast)}
Chapter beats:
${a.chapter.beats.map((b) => `- ${b}`).join('\n')}
${prev}
${last ? 'This is the final chapter: end with a wrap-up and thanks.' : ''}
Length: about ${a.words} words in total.

Return ONLY JSON: [{"speaker": string, "text": string}]
Rules: each line is 1 to 3 sentences (8 to 35 words); natural back-and-forth with questions, interruptions, agreement and disagreement; ${a.def.showcase ? 'at least four different people speak in this chapter and everyone speaks over the whole meeting; ' : ''}stay in character and on topic; no stage directions.`
}

export function summaryPrompt(template: Template, ctx: { title: string; date: string; transcript: string }): string {
  const guide = TEMPLATE_GUIDE[template]
  return `TASK: summary
Summarize this meeting using the "${template}" template. ${guide.focus}
Meeting: "${ctx.title}" on ${ctx.date}.
Use exactly these section headings, in this order: ${guide.headings.join(' | ')}.

Return ONLY JSON: {"sections": [{"heading": string, "bullets": string[]}]}
Rules: 2 to 6 concise bullets per section, each a full sentence grounded in the transcript, naming people and numbers.

Transcript:
${ctx.transcript}`
}

export function actionItemsPrompt(ctx: {
  title: string; date: string; weekday: string; transcript: string; speakers: readonly string[]
}): string {
  return `TASK: actions
Extract the action items from this meeting. Meeting: "${ctx.title}", held on ${ctx.date} (${ctx.weekday}).

Return ONLY JSON: {"action_items": [{"owner": string, "task": string, "due_phrase": string | null, "segment_idx": number}]}
Rules: owner must be exactly one of: ${ctx.speakers.join(', ')}; task is an imperative sentence; due_phrase is the deadline wording as spoken ("Thursday", "end of week", "next week", "tomorrow") or null, and you must never compute a calendar date; segment_idx is the [number] of the line where the commitment was made. 3 to 8 items.

Transcript:
${ctx.transcript}`
}

export function highlightsPrompt(ctx: { title: string; transcript: string }): string {
  return `TASK: highlights
Pick 3 to 6 moments in "${ctx.title}" that a product or sales lead would bookmark.

Return ONLY JSON: {"highlights": [{"segment_idx": number, "type": "action_item" | "insight" | "positive" | "feedback" | "objection" | "tech_question", "title": string}]}
Rules: segment_idx is the [number] of a line inside the moment; title is 3 to 8 words; spread the picks across the meeting; use a variety of types where the transcript supports it.

Transcript:
${ctx.transcript}`
}

export const ASK_PROMPTS = [
  'Next steps on projects?',
  'Summarize my recent meetings',
  'Surprise me with an insight',
] as const

export function askPrompt(question: string, corpus: string): string {
  return `TASK: ask
You answer questions about a team's recent meetings using only the notes below.
Question: ${question}

Return ONLY JSON: {"text": string, "citations": [{"meeting_slug": string, "segment_idx": number, "label": string}]}
Rules: text is 3 to 6 plain-text sentences or short dash bullets; give 2 to 5 citations; each citation uses a meeting_slug and a segment_idx that both appear in the notes; label is a short phrase describing the cited moment.

Notes:
${corpus}`
}

export function liveAskPrompt(question: string, context: string): string {
  return `TASK: live-ask
Answer the question using only the excerpts below.
Question: ${question}

Return ONLY JSON: {"text": string, "refs": string[]}
Rules: text is 2 to 6 plain-text sentences; refs lists the excerpt ids (like "slug#12") you relied on; if the excerpts do not answer the question, say so in text and return an empty refs array.

Excerpts:
${context}`
}
