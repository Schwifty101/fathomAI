/**
 * Whether a participant tile on the meeting card spans both columns of its two-column grid. The last tile does when
 * the count is odd (one or three), so the final row is never left with an empty cell that shows the grid background.
 */
export function tileSpansRow(count: number, index: number): boolean {
  return count % 2 === 1 && index === count - 1
}
