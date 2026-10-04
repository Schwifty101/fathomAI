export const RUN_GAP_MS = 3000
export const MAX_RUN_MS = 300_000

export type Seg = { participant_id: string; start_ms: number; end_ms: number }
export type Run = { startIdx: number; endIdx: number; start_ms: number; end_ms: number }

const continues = (prev: Seg, cur: Seg) =>
  prev.participant_id === cur.participant_id && cur.start_ms - prev.end_ms < RUN_GAP_MS

// Last segment whose start_ms <= ms; -1 before the first segment.
export function findActiveIdx(segs: readonly Seg[], ms: number): number {
  let lo = 0
  let hi = segs.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segs[mid].start_ms <= ms) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

export function splitRuns(segs: readonly Seg[]): Run[] {
  const runs: Run[] = []
  let startIdx = 0
  for (let i = 1; i <= segs.length; i++) {
    if (i === segs.length || !continues(segs[i - 1], segs[i])) {
      runs.push({ startIdx, endIdx: i - 1, start_ms: segs[startIdx].start_ms, end_ms: segs[i - 1].end_ms })
      startIdx = i
    }
  }
  return runs
}

// The speaker run containing idx, with the time window clamped to MAX_RUN_MS.
// startIdx/endIdx describe the full run; start_ms/end_ms the (possibly clamped) window.
export function expandToRun(segs: readonly Seg[], idx: number): Run | null {
  if (idx < 0 || idx >= segs.length) return null
  let a = idx
  let b = idx
  while (a > 0 && continues(segs[a - 1], segs[a])) a--
  while (b < segs.length - 1 && continues(segs[b], segs[b + 1])) b++
  let start = segs[a].start_ms
  let end = segs[b].end_ms
  if (end - start > MAX_RUN_MS) {
    const mid = segs[idx].start_ms
    start = Math.max(start, mid - MAX_RUN_MS / 2)
    end = Math.min(end, start + MAX_RUN_MS)
    start = Math.max(segs[a].start_ms, end - MAX_RUN_MS)
  }
  return { startIdx: a, endIdx: b, start_ms: start, end_ms: end }
}
