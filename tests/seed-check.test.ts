import { describe, expect, it } from 'vitest'
import { checkAsk, checkMeeting, type MeetingFiles } from '@/seed/check'
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
  const content = { sections: [{ heading: 'Overview', bullets: ['They met.'] }] }
  return {
    brief: { agenda: ['a'], chapters: [1, 2, 3].map((i) => ({ title: `C${i}`, beats: ['b'], minutes: 1 })) },
    transcript: {
      lines,
      chapters: [{ title: 'A', start_idx: 0 }, { title: 'B', start_idx: 4 }, { title: 'C', start_idx: 8 }],
      duration_ms: lines.at(-1)!.end_ms,
    },
    summaries: { general: content, sales: content, standup: content, project_review: content },
    actions: [{ owner: names[0], task: 'Ship it', due: '2026-10-09', segment_idx: 3, start_ms: lines[3].start_ms }],
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
  it('flags an action anchor that does not match its line', () => {
    const bad = mut(fixture(), (f) => { f.actions[0].start_ms = 1 })
    expect(checkMeeting(def, bad).join('\n')).toContain('start_ms')
  })
  it('flags a highlight window longer than 5 minutes', () => {
    const bad = mut(fixture(), (f) => { f.highlights[0].end_ms = f.highlights[0].start_ms + 400_000 })
    expect(checkMeeting(def, bad).join('\n')).toContain('highlight window')
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
  const counts = new Map([['t', 12]])
  const answer = (prompt: string) => ({
    prompt, scope: 'my_calls', text: 'x', citations: [{ meeting_slug: 't', segment_idx: 3, label: 'l' }],
  })
  const all = ['Next steps on projects?', 'Summarize my recent meetings', 'Surprise me with an insight'].map(answer)
  it('passes when every prompt is answered and citations resolve', () => expect(checkAsk(all, counts)).toEqual([]))
  it('flags citations past the transcript', () => {
    const bad = structuredClone(all)
    bad[0].citations[0].segment_idx = 99
    expect(checkAsk(bad, counts).join('\n')).toContain('citation')
  })
  it('flags a missing suggested prompt', () => {
    expect(checkAsk(all.slice(1), counts).join('\n')).toContain('Next steps on projects?')
  })
})
