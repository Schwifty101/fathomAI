/**
 * The one participant order the app uses: longest speaker first, ties by id. Lane colours are assigned by position
 * (lib/lanes.ts), so the meeting card and the meeting page must sort the same way to colour a person the same.
 */
export function sortByTalk<T extends { id: string; talk_time_sec: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.talk_time_sec - a.talk_time_sec || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
