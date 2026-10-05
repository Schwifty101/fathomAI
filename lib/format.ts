export function formatMs(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
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
  if (raw === undefined || !/^\d+$/.test(raw) || !Number.isFinite(durationMs)) return 0
  return Math.min(Number(raw), durationMs)
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words[0][0] + (words.length > 1 ? words.at(-1)![0] : '')).toUpperCase()
}
