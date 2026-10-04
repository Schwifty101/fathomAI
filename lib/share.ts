import { MAX_CLIP_MS } from './schema'

export function clampWindow(
  start: number,
  end: number,
  durationMs: number,
): { start_ms: number; end_ms: number } | null {
  if (![start, end, durationMs].every(Number.isFinite)) return null
  const from = Math.max(0, Math.round(start))
  const to = Math.min(Math.round(end), durationMs, from + MAX_CLIP_MS)
  return to > from ? { start_ms: from, end_ms: to } : null
}
