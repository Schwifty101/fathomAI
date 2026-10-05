type Listener = () => void

export class PlaybackStore {
  ms: number
  playing = false
  speed = 1
  private listeners = new Set<Listener>()

  constructor(readonly durationMs: number, initialMs = 0) {
    this.ms = this.clamp(initialMs)
  }

  private clamp(value: number) {
    return Math.min(this.durationMs, Math.max(0, value))
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  tick(deltaMs: number) {
    if (!this.playing) return
    this.ms = this.clamp(this.ms + deltaMs * this.speed)
    if (this.ms >= this.durationMs) this.playing = false
    this.emit()
  }

  play() {
    if (this.ms >= this.durationMs) this.ms = 0
    this.playing = true
    this.emit()
  }

  pause() {
    this.playing = false
    this.emit()
  }

  toggle() {
    this.playing ? this.pause() : this.play()
  }

  seek(ms: number) {
    this.ms = this.clamp(ms)
    this.emit()
  }

  skip(deltaMs: number) {
    this.seek(this.ms + deltaMs)
  }

  setSpeed(speed: number) {
    this.speed = speed
    this.emit()
  }
}

/** Pointer x to a time, measured against the track the playhead is drawn in (not the padded outer box). */
export function msFromX(clientX: number, left: number, width: number, durationMs: number): number {
  return width > 0 ? Math.min(1, Math.max(0, (clientX - left) / width)) * durationMs : 0
}

/**
 * The longest stretch one animation frame may advance the clock. Browsers stop frames in a hidden tab, so the first
 * frame after it resumes would otherwise carry the whole absence and throw the playhead forward.
 */
export const MAX_FRAME_MS = 250

export function frameDelta(now: number, last: number): number {
  return Math.min(MAX_FRAME_MS, Math.max(0, now - last))
}

export type FrameScheduler = {
  now: () => number
  request: (callback: (time: number) => void) => number
  cancel: (handle: number) => void
}

/** Drives `store.tick` from animation frames while it is playing, and idles while it is not. Returns a stop function. */
export function runClock(store: PlaybackStore, frames: FrameScheduler): () => void {
  let handle = 0
  let last = 0
  const frame = (time: number) => {
    store.tick(frameDelta(time, last))
    last = time
    handle = store.playing ? frames.request(frame) : 0
  }
  const start = () => {
    if (!handle && store.playing) {
      last = frames.now()
      handle = frames.request(frame)
    }
  }
  const unsubscribe = store.subscribe(start)
  start()
  return () => {
    unsubscribe()
    frames.cancel(handle)
  }
}
