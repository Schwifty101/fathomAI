export type RovingEvent = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
export type RovingKeys = { prev: string; next: string; wrap: boolean }

/**
 * The index that should take focus after a key press in a roving-tabindex group, or null when the key is not for the
 * group. Keys held with a modifier are left alone (Alt+Left is browser back, Shift+Arrow extends a selection).
 */
export function rovingTarget(event: RovingEvent, current: number, count: number, keys: RovingKeys): number | null {
  if (count <= 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  switch (event.key) {
    case keys.next: return keys.wrap ? (current + 1) % count : Math.min(count - 1, current + 1)
    case keys.prev: return keys.wrap ? (current - 1 + count) % count : Math.max(0, current - 1)
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}
