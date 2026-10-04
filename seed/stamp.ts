export type Line = { speaker: string; text: string }
export type Stamped = Line & { idx: number; start_ms: number; end_ms: number }

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS_PER_SEC = 2.5

// LLM timestamps drift, so lines are timed in code: word count / pace with jitter, gaps,
// the occasional overlap, then uniformly scaled (0.8x-1.25x) toward the target duration.
export function stampTimestamps(
  lines: readonly Line[],
  opts: { targetMs: number; seed: number },
): Stamped[] {
  const rng = mulberry32(opts.seed)
  const durs: number[] = []
  const gaps: number[] = []
  lines.forEach((l, i) => {
    const words = l.text.trim().split(/\s+/).length
    durs.push((words / WORDS_PER_SEC) * 1000 * (0.85 + 0.3 * rng()))
    let gap = 150 + rng() * 750
    if (i > 0 && l.speaker !== lines[i - 1].speaker && rng() < 0.06) gap = -250
    gaps.push(gap)
  })
  const natural = durs.reduce((a, b) => a + b, 0) + gaps.slice(1).reduce((a, b) => a + b, 0)
  const scale = Math.min(1.25, Math.max(0.8, opts.targetMs / natural))
  let cursor = 1000
  let prevStart = 0
  return lines.map((l, i) => {
    if (i > 0) cursor += gaps[i] * scale
    let start = Math.round(cursor)
    if (i > 0 && start <= prevStart) start = prevStart + 1
    const end = Math.max(start + 400, Math.round(start + durs[i] * scale))
    cursor = end
    prevStart = start
    return { ...l, idx: i, start_ms: start, end_ms: end }
  })
}
