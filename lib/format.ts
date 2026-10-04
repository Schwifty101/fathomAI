export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const ss = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatMinutes(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60))
  return `${m} ${m === 1 ? 'min' : 'mins'}`
}

export function parseTimeParam(value: string | string[] | undefined, durationMs: number): number {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Number(raw)
  if (raw === undefined || raw === '' || !Number.isFinite(n)) return 0
  return Math.min(Math.max(0, Math.round(n)), durationMs)
}
