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

const dueFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/**
 * An action item's due date (the ISO `YYYY-MM-DD` of a Postgres date) as "Oct 2, 2026". Like every other time in the
 * app it is read in UTC, so a viewer west of Greenwich does not see the day before. Null when the text is not a real
 * calendar date, so the caller can show it as it came rather than "Invalid Date".
 */
export function formatDue(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return dueFormat.format(date)
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
