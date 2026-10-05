const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_WORD = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/
const NEXT_DAY = new RegExp(`\\bnext\\s+${DAY_WORD.source.slice(2, -2)}\\b`)
const COUNT: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, 'a couple of': 2, three: 3, four: 4, five: 5, six: 6 }
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const monthEnd = (d: Date, plus: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + plus + 1, 0))

// Models guess calendar dates badly, so they return the spoken phrase and code resolves it.
// Weeks are Mon-Fri; a weekend meeting counts the coming work week as "this week". Weekday names
// (and "<day> next week") win over the generic eod / next-week phrases. Anything unrecognised
// returns null: callers must surface that, never swallow it.
export function resolveDue(phrase: string | null, meetingDate: Date): string | null {
  if (!phrase) return null
  const p = phrase.toLowerCase().trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
    const d = new Date(`${p}T00:00:00Z`)
    return Number.isNaN(d.getTime()) || iso(d) !== p ? null : p
  }
  const base = new Date(Date.UTC(meetingDate.getUTCFullYear(), meetingDate.getUTCMonth(), meetingDate.getUTCDate()))
  const cur = base.getUTCDay()
  const thisMonday = addDays(base, cur === 0 ? 1 : cur === 6 ? 2 : 1 - cur)
  const nextWeek = /\b(next|following) week\b/.test(p)
  const day = p.match(DAY_WORD)
  if (day) {
    const idx = DAYS.indexOf(day[1].slice(0, 3))
    if (nextWeek) return iso(addDays(thisMonday, 7 + (idx + 6) % 7))
    const offset = (idx - cur + 7) % 7 || 7
    return iso(addDays(base, NEXT_DAY.test(p) ? offset + 7 : offset))
  }
  if (/\b(today|tonight|eod|cob)\b|end of (the )?day|close of business/.test(p)) {
    return /\btomorrow\b/.test(p) ? iso(addDays(base, 1)) : iso(base)
  }
  if (/\btomorrow\b/.test(p)) return iso(addDays(base, 1))
  if (/\b(end of (the )?next month|next month)\b/.test(p)) return iso(monthEnd(base, 1))
  if (/end of (the )?month|month[- ]end|\beom\b/.test(p)) return iso(monthEnd(base, 0))
  if (/end of (the )?(next|following) week/.test(p)) return iso(addDays(thisMonday, 11))
  if (/end of (the )?week|\beow\b/.test(p)) return iso(addDays(thisMonday, 4))
  if (nextWeek) return iso(addDays(thisMonday, 7))
  const span = p.match(/\bin (\d+|a couple of|an?|one|two|three|four|five|six) (day|week)s?\b/)
  if (span) {
    const n = COUNT[span[1]] ?? Number(span[1])
    return iso(addDays(base, n * (span[2] === 'week' ? 7 : 1)))
  }
  return null
}
