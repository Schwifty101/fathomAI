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
