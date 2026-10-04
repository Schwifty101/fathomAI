const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_WORD = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

// Models guess calendar dates badly, so they return the spoken phrase and code resolves it.
export function resolveDue(phrase: string | null, meetingDate: Date): string | null {
  if (!phrase) return null
  const p = phrase.toLowerCase().trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p
  const base = new Date(Date.UTC(meetingDate.getUTCFullYear(), meetingDate.getUTCMonth(), meetingDate.getUTCDate()))
  const cur = base.getUTCDay()
  if (/\btoday\b/.test(p)) return iso(base)
  if (/\btomorrow\b/.test(p)) return iso(addDays(base, 1))
  if (/\beod\b|end of (the )?day/.test(p)) return iso(base)
  if (/end of (the )?month/.test(p)) return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)))
  if (/end of (the )?next week/.test(p)) return iso(addDays(base, (5 - cur + 7) % 7 + 7))
  if (/end of (the )?week|\beow\b/.test(p)) return iso(addDays(base, (5 - cur + 7) % 7))
  if (/next week/.test(p)) return iso(addDays(base, (1 - cur + 7) % 7 || 7))
  const nextM = p.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/)
  if (nextM) {
    const offset = (DAYS.indexOf(nextM[1].slice(0, 3)) - cur + 7) % 7 || 7
    return iso(addDays(base, offset + 7))
  }
  const m = p.match(DAY_WORD)
  if (m) return iso(addDays(base, (DAYS.indexOf(m[1].slice(0, 3)) - cur + 7) % 7 || 7))
  return null
}
