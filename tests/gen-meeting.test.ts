import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LlmClient } from '@/lib/llm'
import { TEMPLATE_GUIDE } from '@/lib/prompts'
import {
  actionsFileSchema, askFileSchema, briefSchema, highlightsFileSchema, summariesFileSchema, transcriptFileSchema,
} from '@/lib/schema'
import { generateMeeting } from '@/seed/gen/meeting'
import { generateAsk } from '@/seed/gen/ask'
import { fileOf, readJson } from '@/seed/io'
import type { MeetingDef } from '@/seed/meetings'

const def: MeetingDef = {
  slug: 'tiny', title: 'Tiny Sync', kind: 'standup', platform: 'zoom', daysAgo: 3, hourUtc: 9,
  host: 'priya', internal: ['priya', 'mei'], externals: [], targetMin: 6, topic: 'A tiny test meeting.',
}
const A = 'Priya Raman'
const B = 'Mei Tanaka'
const chapterLines = Array.from({ length: 6 }, (_, i) => ({
  speaker: i % 2 ? B : A,
  text: 'we should review the numbers and then decide what to ship this week',
}))

type Hooks = { fail?: (task: string, prompt: string, call: number) => boolean; due?: string }
function makeFake(hooks: Hooks = {}): LlmClient & { log: string[] } {
  const calls = new Map<string, number>()
  const log: string[] = []
  return {
    log,
    async complete({ prompt }) {
      const task = prompt.split('\n')[0]
      const key = task === 'TASK: summary' ? prompt.match(/using the "(\w+)" template/)![1] : task
      const call = (calls.get(key) ?? 0) + 1
      calls.set(key, call)
      log.push(task === 'TASK: summary' ? `summary:${key}` : task === 'TASK: chapter' ? `chapter:${prompt.match(/chapter (\d+) of/)![1]}` : task)
      if (hooks.fail?.(key, prompt, call)) throw new Error('claude exited 1: transport down')
      switch (task) {
        case 'TASK: brief':
          return JSON.stringify({ agenda: ['a'], chapters: [1, 2, 3].map((i) => ({ title: `Chapter ${i}`, beats: ['beat'], minutes: 2 })) })
        case 'TASK: chapter':
          return '```json\n' + JSON.stringify(chapterLines) + '\n```'
        case 'TASK: summary':
          return JSON.stringify({ sections: [{ heading: TEMPLATE_GUIDE[key as 'general'].headings[0], bullets: ['They met.'] }] })
        case 'TASK: actions':
          return JSON.stringify({ action_items: [{ owner: A, task: 'Ship it', due_phrase: hooks.due ?? 'Friday', segment_idx: 4 }] })
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
}
const fake = makeFake()
const never: LlmClient = { async complete() { throw new Error('should not be called') } }
const quiet = () => {}
const tmp = () => mkdtempSync(join(tmpdir(), 'gen-'))

describe('generateMeeting', () => {
  it('writes every file in the expected shape', async () => {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
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
  it('writes atomically: no temp or partial files remain', async () => {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
    expect(readdirSync(join(dir, 'tiny')).sort()).toEqual(
      ['actions.json', 'brief.json', 'highlights.json', 'summaries.json', 'transcript.json'],
    )
  })
  it('resolves relative due phrases against the meeting date and keeps the phrase', async () => {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
    const actions = actionsFileSchema.parse(readJson(fileOf('tiny', 'actions', dir)))
    expect(actions[0].due).toBe('2026-10-09') // meeting Fri 10-02, "Friday" = next Friday
    expect(actions[0].due_phrase).toBe('Friday')
  })
  it('logs an unresolved due phrase instead of silently nulling it', async () => {
    const dir = tmp()
    const messages: string[] = []
    await generateMeeting(makeFake({ due: 'whenever we can' }), def, { dir, log: (m) => messages.push(m) })
    expect(messages.join('\n')).toContain('unresolved due phrase "whenever we can"')
    const actions = actionsFileSchema.parse(readJson(fileOf('tiny', 'actions', dir)))
    expect(actions[0]).toMatchObject({ due: null, due_phrase: 'whenever we can' })
  })
  it('expands highlight picks to speaker-run windows within 5 minutes', async () => {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
    const hl = highlightsFileSchema.parse(readJson(fileOf('tiny', 'highlights', dir)))
    expect(hl).toHaveLength(3)
    for (const h of hl) {
      expect(h.end_ms).toBeGreaterThan(h.start_ms)
      expect(h.end_ms - h.start_ms).toBeLessThanOrEqual(300_000)
    }
  })
  it('refuses highlight picks that collapse into fewer than three speaker runs', async () => {
    const dir = tmp()
    const client = makeFake()
    const complete = client.complete.bind(client)
    client.complete = async (req) => req.prompt.startsWith('TASK: highlights')
      ? JSON.stringify({ highlights: [0, 0, 0].map((segment_idx) => ({ segment_idx, type: 'insight', title: 'Same moment' })) })
      : complete(req)
    await expect(generateMeeting(client, def, { dir, log: quiet })).rejects.toThrow(/distinct speaker runs/)
  })
  it('is resumable: existing files are not regenerated', async () => {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
    await expect(generateMeeting(never, def, { dir, log: quiet })).resolves.toBeUndefined()
  })
  it('retries a brief whose chapter minutes miss the target', async () => {
    const dir = tmp()
    const client = makeFake()
    const complete = client.complete.bind(client)
    let briefs = 0
    client.complete = async (req) => {
      if (!req.prompt.startsWith('TASK: brief') || briefs++ > 0) return complete(req)
      return JSON.stringify({ agenda: ['a'], chapters: [1, 2, 3].map((i) => ({ title: `C${i}`, beats: ['b'], minutes: 5 })) })
    }
    await generateMeeting(client, def, { dir, log: quiet })
    expect(briefs).toBe(2)
    expect(readJson<{ chapters: { minutes: number }[] }>(fileOf('tiny', 'brief', dir)).chapters[0].minutes).toBe(2)
  })
})

describe('generateMeeting resume safety', () => {
  it('keeps finished chapters when a later chapter fails, then continues from there', async () => {
    const dir = tmp()
    const flaky = makeFake({ fail: (task, prompt) => task === 'TASK: chapter' && prompt.includes('chapter 3 of') })
    await expect(generateMeeting(flaky, def, { dir, log: quiet })).rejects.toThrow('transport down')
    expect(existsSync(fileOf('tiny', 'transcript', dir))).toBe(false)
    expect(readJson<unknown[]>(fileOf('tiny', 'transcript.partial', dir))).toHaveLength(2)
    const resumed = makeFake()
    await generateMeeting(resumed, def, { dir, log: quiet })
    expect(resumed.log.filter((l) => l.startsWith('chapter:'))).toEqual(['chapter:3'])
    expect(existsSync(fileOf('tiny', 'transcript.partial', dir))).toBe(false)
    expect(transcriptFileSchema.parse(readJson(fileOf('tiny', 'transcript', dir))).lines).toHaveLength(18)
  })
  it('keeps successful summaries and retries only the failed template', async () => {
    const dir = tmp()
    const flaky = makeFake({ fail: (task) => task === 'standup' })
    await expect(generateMeeting(flaky, def, { dir, log: quiet })).rejects.toThrow(/summaries failed for standup/)
    expect(Object.keys(readJson(fileOf('tiny', 'summaries.partial', dir))).sort()).toEqual(['general', 'project_review', 'sales'])
    expect(existsSync(fileOf('tiny', 'summaries', dir))).toBe(false)
    const resumed = makeFake()
    await generateMeeting(resumed, def, { dir, log: quiet })
    expect(resumed.log.filter((l) => l.startsWith('summary:'))).toEqual(['summary:standup'])
    expect(summariesFileSchema.safeParse(readJson(fileOf('tiny', 'summaries', dir))).success).toBe(true)
    expect(existsSync(fileOf('tiny', 'summaries.partial', dir))).toBe(false)
  })
  it('deleting transcript.json invalidates every file derived from it (and ask.json)', async () => {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
    writeFileSync(join(dir, 'ask.json'), '[]')
    // Mark derived files stale so we can see them replaced.
    for (const n of ['actions', 'highlights']) writeFileSync(fileOf('tiny', n, dir), '"STALE"')
    rmSync(fileOf('tiny', 'transcript', dir))
    const again = makeFake()
    await generateMeeting(again, def, { dir, log: quiet })
    expect(again.log).toContain('TASK: actions')
    expect(again.log).toContain('TASK: highlights')
    expect(again.log.filter((l) => l.startsWith('summary:'))).toHaveLength(4)
    expect(actionsFileSchema.safeParse(readJson(fileOf('tiny', 'actions', dir))).success).toBe(true)
    expect(existsSync(join(dir, 'ask.json'))).toBe(false)
  })
  it('regenerating the brief invalidates the transcript and everything after it', async () => {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
    rmSync(fileOf('tiny', 'brief', dir))
    const again = makeFake()
    await generateMeeting(again, def, { dir, log: quiet })
    expect(again.log.filter((l) => l.startsWith('chapter:'))).toHaveLength(3)
    expect(again.log).toContain('TASK: highlights')
  })
})

describe('generateAsk', () => {
  const other: MeetingDef = { ...def, slug: 'other', title: 'Other Sync', host: 'mei', daysAgo: 4 }
  async function bundle() {
    const dir = tmp()
    await generateMeeting(fake, def, { dir, log: quiet })
    await generateMeeting(fake, other, { dir, log: quiet })
    return dir
  }

  it('builds My Calls only from the demo persona hosted meetings and Team Calls from all', async () => {
    const dir = await bundle()
    const seen: { prompt: string }[] = []
    const client: LlmClient = {
      async complete({ prompt }) {
        seen.push({ prompt })
        return JSON.stringify({ text: 'A grounded answer.', citations: [{ meeting_slug: 'tiny', segment_idx: 0, label: 'Opening' }] })
      },
    }
    await generateAsk(client, [def, other], { dir, log: quiet })
    const rows = askFileSchema.parse(readJson(join(dir, 'ask.json')))
    expect(rows).toHaveLength(6)
    expect(rows.filter((r) => r.scope === 'my_calls')).toHaveLength(3)
    expect(rows.filter((r) => r.scope === 'team_calls')).toHaveLength(3)
    expect(new Set(rows.map((r) => `${r.scope}\n${r.prompt}`)).size).toBe(6)
    const mine = seen.filter((s) => s.prompt.includes('"my" and "me" mean Priya Raman'))
    expect(mine).toHaveLength(3)
    expect(mine.every((s) => s.prompt.includes('## tiny') && !s.prompt.includes('## other'))).toBe(true)
    expect(seen.filter((s) => !mine.includes(s)).every((s) => s.prompt.includes('## other'))).toBe(true)
  })
  it('rejects (and retries) citations to indices the model was not shown or to meetings outside the scope', async () => {
    const dir = await bundle()
    const replies = [
      // in range for the transcript (18 lines) but never listed in the notes
      { meeting_slug: 'tiny', segment_idx: 1, label: 'Not listed' },
      // listed for 'other', but 'other' is not hosted by the demo persona so not in My Calls
      { meeting_slug: 'other', segment_idx: 0, label: 'Out of scope' },
    ]
    let call = 0
    const client: LlmClient = {
      async complete() {
        const bad = call++ < replies.length
        return JSON.stringify({ text: 'x', citations: [bad ? replies[call - 1] : { meeting_slug: 'tiny', segment_idx: 4, label: 'ok' }] })
      },
    }
    await expect(generateAsk(client, [def, other], { dir, log: quiet })).rejects.toThrow(/failed validation/)
    expect(existsSync(join(dir, 'ask.json'))).toBe(false)
  })
  it('resumes: an existing ask.json is kept', async () => {
    const dir = await bundle()
    writeFileSync(join(dir, 'ask.json'), '[]')
    await expect(generateAsk(never, [def, other], { dir, log: quiet })).resolves.toBeUndefined()
  })
})
