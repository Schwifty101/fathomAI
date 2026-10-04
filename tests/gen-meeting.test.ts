import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LlmClient } from '@/lib/llm'
import { actionsFileSchema, briefSchema, highlightsFileSchema, summariesFileSchema, transcriptFileSchema } from '@/lib/schema'
import { generateMeeting } from '@/seed/gen/meeting'
import { generateAsk } from '@/seed/gen/ask'
import { fileOf, readJson } from '@/seed/io'
import type { MeetingDef } from '@/seed/meetings'

const def: MeetingDef = {
  slug: 'tiny', title: 'Tiny Sync', kind: 'standup', platform: 'zoom', daysAgo: 1, hourUtc: 9,
  host: 'priya', internal: ['priya', 'mei'], externals: [], targetMin: 6, topic: 'A tiny test meeting.',
}
const A = 'Priya Raman'
const B = 'Mei Tanaka'
const chapterLines = Array.from({ length: 6 }, (_, i) => ({
  speaker: i % 2 ? B : A,
  text: 'we should review the numbers and then decide what to ship this week',
}))

const fake: LlmClient = {
  async complete({ prompt }) {
    switch (prompt.split('\n')[0]) {
      case 'TASK: brief':
        return JSON.stringify({ agenda: ['a'], chapters: [1, 2, 3].map((i) => ({ title: `Chapter ${i}`, beats: ['beat'], minutes: 2 })) })
      case 'TASK: chapter':
        return '```json\n' + JSON.stringify(chapterLines) + '\n```'
      case 'TASK: summary':
        return JSON.stringify({ sections: [{ heading: 'Overview', bullets: ['They met.'] }] })
      case 'TASK: actions':
        return JSON.stringify({ action_items: [{ owner: A, task: 'Ship it', due_phrase: 'Friday', segment_idx: 4 }] })
      case 'TASK: highlights':
        return JSON.stringify({ highlights: [
          { segment_idx: 0, type: 'insight', title: 'Kickoff moment' },
          { segment_idx: 6, type: 'objection', title: 'A concern is raised' },
          { segment_idx: 12, type: 'action_item', title: 'Owner takes the task' },
        ] })
      default:
        throw new Error(`unexpected prompt: ${prompt.slice(0, 40)}`)
    }
  },
}
const never: LlmClient = { async complete() { throw new Error('should not be called') } }

describe('generateMeeting', () => {
  it('writes every file in the expected shape', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    for (const n of ['brief', 'transcript', 'summaries', 'actions', 'highlights']) {
      expect(existsSync(fileOf('tiny', n, dir))).toBe(true)
    }
    expect(briefSchema.safeParse(readJson(fileOf('tiny', 'brief', dir))).success).toBe(true)
    const t = transcriptFileSchema.parse(readJson(fileOf('tiny', 'transcript', dir)))
    expect(t.lines).toHaveLength(18)
    expect(t.chapters.map((c) => c.start_idx)).toEqual([0, 6, 12])
    expect(t.duration_ms).toBe(t.lines.at(-1)!.end_ms)
    expect(summariesFileSchema.safeParse(readJson(fileOf('tiny', 'summaries', dir))).success).toBe(true)
    expect(actionsFileSchema.safeParse(readJson(fileOf('tiny', 'actions', dir))).success).toBe(true)
  })
  it('resolves relative due phrases against the meeting date', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    const actions = actionsFileSchema.parse(readJson(fileOf('tiny', 'actions', dir)))
    expect(actions[0].due).toBe('2026-10-09')
  })
  it('expands highlight picks to speaker-run windows within 5 minutes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    const hl = highlightsFileSchema.parse(readJson(fileOf('tiny', 'highlights', dir)))
    expect(hl).toHaveLength(3)
    for (const h of hl) {
      expect(h.end_ms).toBeGreaterThan(h.start_ms)
      expect(h.end_ms - h.start_ms).toBeLessThanOrEqual(300_000)
    }
  })
  it('is resumable: existing files are not regenerated', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    await expect(generateMeeting(never, def, { dir, log: () => {} })).resolves.toBeUndefined()
  })
})

it('generates Ask answers with citations only to real transcript lines and then resumes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-'))
  await generateMeeting(fake, def, { dir, log: () => {} })
  const askClient: LlmClient = {
    async complete() {
      return JSON.stringify({ text: 'A grounded answer.', citations: [
        { meeting_slug: 'tiny', segment_idx: 0, label: 'Opening' },
        { meeting_slug: 'tiny', segment_idx: 99, label: 'Invalid' },
      ] })
    },
  }
  await generateAsk(askClient, [def], { dir, log: () => {} })
  const answers = readJson<{ citations: { segment_idx: number }[] }[]>(join(dir, 'ask.json'))
  expect(answers).toHaveLength(3)
  expect(answers.every((a) => a.citations.length === 1 && a.citations[0].segment_idx === 0)).toBe(true)
  await expect(generateAsk(never, [def], { dir, log: () => {} })).resolves.toBeUndefined()
})
