import { describe, expect, it } from 'vitest'
import { ASK_PROMPTS_BY_SCOPE } from '@/lib/prompts'
import { checkAsk, checkMeeting, type AskInfo, type MeetingFiles } from '@/seed/check'
import type { MeetingDef } from '@/seed/meetings'
import { stampTimestamps } from '@/seed/stamp'

const def: MeetingDef = {
  slug: 't', title: 'T', kind: 'standup', platform: 'zoom', daysAgo: 1, hourUtc: 9,
  host: 'priya', internal: ['priya', 'mei'], externals: [], targetMin: 1, topic: 'x',
}
const names = ['Priya Raman', 'Mei Tanaka']
const sentence = 'we should review the numbers and then decide what to ship this week'

function fixture(text = sentence, speakerOf = (i: number) => names[i % 2]): MeetingFiles {
  const raw = Array.from({ length: 12 }, (_, i) => ({ speaker: speakerOf(i), text }))
  const lines = stampTimestamps(raw, { targetMs: 60_000, seed: 1 })
  const content = (heading: string) => ({ sections: [{ heading, bullets: ['They met.'] }] })
  return {
    brief: { agenda: ['a'], chapters: ['A', 'B', 'C'].map((title) => ({ title, beats: ['b'], minutes: 1 / 3 })) },
    transcript: {
      lines,
      chapters: [{ title: 'A', start_idx: 0 }, { title: 'B', start_idx: 4 }, { title: 'C', start_idx: 8 }],
      duration_ms: lines.at(-1)!.end_ms,
    },
    summaries: { general: content('Overview'), sales: content('Pain points'), standup: content('Yesterday'), project_review: content('Goals') },
    actions: [{ owner: names[0], task: 'Ship it', due: '2026-10-09', due_phrase: 'Friday', segment_idx: 3, start_ms: lines[3].start_ms }],
    highlights: [0, 4, 8].map((i, k) => ({
      segment_idx: i, type: (['insight', 'objection', 'action_item'] as const)[k], title: 'A moment',
      start_ms: lines[i].start_ms, end_ms: lines[i].end_ms,
    })),
  }
}
const mut = (f: MeetingFiles, fn: (f: any) => void): MeetingFiles => {
  const copy = structuredClone(f) as any
  fn(copy)
  return copy
}

describe('checkMeeting', () => {
  it('passes a valid fixture', () => expect(checkMeeting(def, fixture())).toEqual([]))
  it('flags a speaker outside the cast', () => {
    const bad = mut(fixture(), (f) => { f.transcript.lines[2].speaker = 'Eve' })
    expect(checkMeeting(def, bad).join('\n')).toContain('unknown speaker')
  })
  it('flags non-monotonic timestamps', () => {
    const bad = mut(fixture(), (f) => { f.transcript.lines[5].start_ms = 0 })
    expect(checkMeeting(def, bad).join('\n')).toContain('not monotonic')
  })
  it('flags an unresolved relative due date', () => {
    const bad = mut(fixture(), (f) => { f.actions[0].due = 'Friday' })
    expect(checkMeeting(def, bad).join('\n')).toContain('actions.json invalid')
  })
  it('flags impossible calendar dates in due (Postgres would reject them)', () => {
    for (const due of ['2026-02-31', '2026-13-45']) {
      const bad = mut(fixture(), (f) => { f.actions[0].due = due })
      expect(checkMeeting(def, bad).join('\n'), due).toContain('not a real calendar date')
    }
  })
  it('flags a due phrase that did not resolve, and one that disagrees with its due date', () => {
    const unresolved = mut(fixture(), (f) => { f.actions[0].due_phrase = 'whenever we can'; f.actions[0].due = null })
    expect(checkMeeting(def, unresolved).join('\n')).toContain('unresolved due phrase "whenever we can"')
    const wrong = mut(fixture(), (f) => { f.actions[0].due = '2026-10-12' })
    expect(checkMeeting(def, wrong).join('\n')).toContain('does not match "Friday"')
  })
  it('flags an action anchor that does not match its line', () => {
    const bad = mut(fixture(), (f) => { f.actions[0].start_ms = 1 })
    expect(checkMeeting(def, bad).join('\n')).toContain('start_ms')
  })
  it('flags a highlight window longer than 5 minutes', () => {
    const bad = mut(fixture(), (f) => { f.highlights[0].end_ms = f.highlights[0].start_ms + 400_000 })
    expect(checkMeeting(def, bad).join('\n')).toContain('highlight window')
  })
  it('flags a highlight outside the meeting, off its line, or duplicating another window', () => {
    const outside = mut(fixture(), (f) => { f.highlights[0].end_ms = f.transcript.duration_ms + 1000 })
    expect(checkMeeting(def, outside).join('\n')).toContain('ends after the meeting')
    const offLine = mut(fixture(), (f) => { f.highlights[1].segment_idx = 9 })
    expect(checkMeeting(def, offLine).join('\n')).toContain('does not contain its segment_idx line')
    const dup = mut(fixture(), (f) => { Object.assign(f.highlights[1], { start_ms: f.highlights[0].start_ms, end_ms: f.highlights[0].end_ms, segment_idx: 0 }) })
    expect(checkMeeting(def, dup).join('\n')).toContain('duplicates another highlight')
    const negative = mut(fixture(), (f) => { f.highlights[0].segment_idx = -1 })
    expect(checkMeeting(def, negative).join('\n')).toContain('highlights.json invalid')
  })
  it('flags brief minutes that miss the target and chapters that differ from the brief', () => {
    const minutes = mut(fixture(), (f) => { f.brief.chapters[0].minutes = 1 })
    expect(checkMeeting(def, minutes).join('\n')).toContain('chapter minutes must add up to 1')
    const titles = mut(fixture(), (f) => { f.transcript.chapters[1].title = 'Renamed' })
    expect(checkMeeting(def, titles).join('\n')).toContain('do not match the brief')
    const count = mut(fixture(), (f) => { f.brief.chapters.push({ title: 'D', beats: ['b'], minutes: 0.0001 }) })
    expect(checkMeeting(def, count).join('\n')).toContain('do not match the brief')
  })
  it('flags a summary heading that is not in the template, but accepts omitted sections', () => {
    const bad = mut(fixture(), (f) => { f.summaries.standup.sections[0].heading = 'Budget and timeline' })
    expect(checkMeeting(def, bad).join('\n')).toContain('summaries.json invalid')
    const omitted = mut(fixture(), (f) => { f.summaries.standup = { sections: [{ heading: 'Blockers', bullets: ['x'] }] } })
    expect(checkMeeting(def, omitted)).toEqual([])
  })
  it('flags terse dialogue', () => {
    expect(checkMeeting(def, fixture('ok sure')).join('\n')).toContain('average words per line')
  })
  it('flags a showcase speaker with no talk time', () => {
    const show = { ...def, showcase: true }
    const bad = fixture(sentence, () => names[0])
    expect(checkMeeting(show, bad).join('\n')).toContain('talk share')
  })
  it('flags a duration far from the target', () => {
    const bad = mut(fixture(), (f) => { f.transcript.duration_ms = 600_000; f.transcript.lines.at(-1).end_ms = 600_000 })
    expect(checkMeeting(def, bad).join('\n')).toContain('duration')
  })
})

describe('checkAsk', () => {
  // 't' is hosted by the demo persona; 'o' is not. Only indices 3 and 5 of 't' were listed to the generator.
  const info: AskInfo = new Map([
    ['t', { lines: 12, citable: new Set([3, 5]), host: 'priya' }],
    ['o', { lines: 12, citable: new Set([2]), host: 'mei' }],
  ])
  const answer = (scope: string, prompt: string, slug = 't', idx = 3) => ({
    prompt, scope, text: 'x', citations: [{ meeting_slug: slug, segment_idx: idx, label: 'l' }],
  })
  const all = [
    ...ASK_PROMPTS_BY_SCOPE.my_calls.map((p) => answer('my_calls', p)),
    ...ASK_PROMPTS_BY_SCOPE.team_calls.map((p) => answer('team_calls', p, 'o', 2)),
  ]
  const errs = (rows: unknown) => checkAsk(rows, info).join('\n')
  it('passes when every prompt of both scopes is answered and citations resolve', () => expect(checkAsk(all, info)).toEqual([]))
  it('has three prompts per scope', () => {
    expect(ASK_PROMPTS_BY_SCOPE.my_calls).toHaveLength(3)
    expect(ASK_PROMPTS_BY_SCOPE.team_calls).toHaveLength(3)
  })
  it('flags citations past the transcript and negative indices', () => {
    const bad = structuredClone(all)
    bad[0].citations[0].segment_idx = 99
    expect(errs(bad)).toContain('does not resolve')
    bad[0].citations[0].segment_idx = -1
    expect(errs(bad)).toContain('ask.json invalid')
  })
  it('flags a citation in range but not among the indices the generator listed', () => {
    const bad = structuredClone(all)
    bad[0].citations[0].segment_idx = 4
    expect(errs(bad)).toContain('not an index the generator listed')
  })
  it('flags a My Calls answer that cites a meeting the demo persona did not host', () => {
    const bad = structuredClone(all)
    bad[0].citations[0] = { meeting_slug: 'o', segment_idx: 2, label: 'l' }
    expect(errs(bad)).toContain('not hosted by the demo persona')
  })
  it('flags a missing suggested prompt in either scope', () => {
    expect(errs(all.slice(1))).toContain('missing my_calls answer for "Next steps on projects?"')
    expect(errs(all.slice(0, -1))).toContain('missing team_calls answer')
  })
  it('flags a duplicate (scope, prompt) but allows the same prompt text in another scope', () => {
    expect(errs([...all, all[0]])).toContain('duplicate answer for my_calls')
    expect(errs([...all, { ...all[0], scope: 'team_calls' }])).not.toContain('duplicate')
  })
  it('flags an unknown scope', () => {
    expect(errs([...all, answer('everyone', 'Anything?')])).toContain('ask.json invalid')
  })
})
