import { splitRuns, type Seg } from './speaker-runs'

export type ParticipantStats = { talk_time_sec: number; questions: number; longest_monologue_sec: number }

export function deriveParticipantStats(
  segs: readonly (Seg & { text: string })[],
): Map<string, ParticipantStats> {
  const talkMs = new Map<string, number>()
  const questions = new Map<string, number>()
  const longestMs = new Map<string, number>()
  for (const s of segs) {
    talkMs.set(s.participant_id, (talkMs.get(s.participant_id) ?? 0) + (s.end_ms - s.start_ms))
    questions.set(s.participant_id, (questions.get(s.participant_id) ?? 0) + (s.text.match(/\?/g)?.length ?? 0))
  }
  for (const run of splitRuns(segs)) {
    const id = segs[run.startIdx].participant_id
    longestMs.set(id, Math.max(longestMs.get(id) ?? 0, run.end_ms - run.start_ms))
  }
  const out = new Map<string, ParticipantStats>()
  for (const id of talkMs.keys()) {
    out.set(id, {
      talk_time_sec: Math.round(talkMs.get(id)! / 1000),
      questions: questions.get(id) ?? 0,
      longest_monologue_sec: Math.round((longestMs.get(id) ?? 0) / 1000),
    })
  }
  return out
}

export function unionSeconds(windows: readonly { start_ms: number; end_ms: number }[]): number {
  const sorted = [...windows].sort((a, b) => a.start_ms - b.start_ms)
  let total = 0
  let curStart = -1
  let curEnd = -1
  for (const w of sorted) {
    if (curEnd < 0 || w.start_ms > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart
      curStart = w.start_ms
      curEnd = w.end_ms
    } else curEnd = Math.max(curEnd, w.end_ms)
  }
  if (curEnd >= 0) total += curEnd - curStart
  return Math.round(total / 1000)
}
