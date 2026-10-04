const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function groupByMonth<T extends { started_at: string }>(items: T[]): { label: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => b.started_at.localeCompare(a.started_at))
  const groups: { label: string; items: T[] }[] = []
  for (const item of sorted) {
    const label = monthFormat.format(new Date(item.started_at))
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}
