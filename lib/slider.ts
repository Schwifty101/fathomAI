export type SliderKeyEvent = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }

/** The arrow keys move this far, and Page Up and Page Down a larger step (WAI-ARIA slider pattern). */
export const ARROW_STEP_MS = 5_000
export const PAGE_STEP_MS = 30_000

/** A timeline length the slider can draw: finite and positive, else 0, so no division by it can produce NaN. */
const usableDuration = (durationMs: number) => (Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0)

/** A position as a CSS percentage of the track, kept on the track. With no timeline to measure against it is 0%. */
export function trackPercent(valueMs: number, durationMs: number): string {
  const duration = usableDuration(durationMs)
  if (duration === 0 || Number.isNaN(valueMs)) return '0%'
  return `${Math.min(100, Math.max(0, (valueMs / duration) * 100))}%`
}

/** The slider's aria-value* numbers in whole seconds, always finite and inside the range. */
export function sliderAria(ms: number, durationMs: number): { min: 0; max: number; now: number } {
  const max = Math.round(usableDuration(durationMs) / 1000)
  const now = Number.isFinite(ms) ? Math.min(max, Math.max(0, Math.round(ms / 1000))) : 0
  return { min: 0, max, now }
}

/**
 * Where a key press should move the playhead, or null when the key is not for the slider. Keys held with a modifier
 * are left alone (Alt+Left is browser back).
 */
export function sliderTarget(event: SliderKeyEvent, ms: number, durationMs: number): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  const end = usableDuration(durationMs)
  const from = Number.isFinite(ms) ? ms : 0
  let to: number
  switch (event.key) {
    case 'ArrowRight': to = from + ARROW_STEP_MS; break
    case 'ArrowLeft': to = from - ARROW_STEP_MS; break
    case 'PageUp': to = from + PAGE_STEP_MS; break
    case 'PageDown': to = from - PAGE_STEP_MS; break
    case 'Home': to = 0; break
    case 'End': to = end; break
    default: return null
  }
  return Math.min(end, Math.max(0, to))
}
