import { describe, expect, it } from 'vitest'
import { frameDelta, MAX_FRAME_MS, PlaybackStore, runClock } from '@/lib/playback'

// Manual animation frames: nothing runs until `frame(time)` is called, like a hidden tab.
function fakeFrames(startAt = 0) {
  let clock = startAt
  let nextHandle = 1
  const pending = new Map<number, (time: number) => void>()
  return {
    scheduler: {
      now: () => clock,
      request: (callback: (time: number) => void) => {
        pending.set(nextHandle, callback)
        return nextHandle++
      },
      cancel: (handle: number) => void pending.delete(handle),
    },
    pending: () => pending.size,
    frame(time: number) {
      clock = time
      const [handle, callback] = [...pending][0]
      pending.delete(handle)
      callback(time)
    },
  }
}

describe('frameDelta', () => {
  it('passes a normal frame through and caps a long gap', () => {
    expect(frameDelta(1016, 1000)).toBe(16)
    expect(frameDelta(61_000, 1000)).toBe(MAX_FRAME_MS)
  })

  it('never goes backwards', () => {
    expect(frameDelta(995, 1000)).toBe(0)
  })
})

describe('runClock', () => {
  it('advances by real frame time while playing', () => {
    const frames = fakeFrames(100)
    const store = new PlaybackStore(600_000)
    runClock(store, frames.scheduler)
    store.play()
    frames.frame(116)
    frames.frame(133)
    expect(store.ms).toBe(33)
  })

  it('does not jump forward when a hidden tab resumes', () => {
    const frames = fakeFrames()
    const store = new PlaybackStore(600_000)
    runClock(store, frames.scheduler)
    store.play()
    frames.frame(16)
    frames.frame(60_016) // sixty seconds without a frame
    expect(store.ms).toBe(16 + MAX_FRAME_MS)
  })

  it('does not step backwards when the first frame is timestamped before the start call', () => {
    const frames = fakeFrames(1000)
    const store = new PlaybackStore(600_000, 5000)
    runClock(store, frames.scheduler)
    store.play()
    frames.frame(996)
    expect(store.ms).toBe(5000)
  })

  it('stops scheduling frames after a pause and starts again on play', () => {
    const frames = fakeFrames()
    const store = new PlaybackStore(600_000)
    runClock(store, frames.scheduler)
    store.play()
    frames.frame(16)
    store.pause()
    frames.frame(32)
    expect(frames.pending()).toBe(0)
    expect(store.ms).toBe(16)
    store.play()
    expect(frames.pending()).toBe(1)
  })

  it('cancels the pending frame when stopped', () => {
    const frames = fakeFrames()
    const store = new PlaybackStore(600_000)
    const stop = runClock(store, frames.scheduler)
    store.play()
    expect(frames.pending()).toBe(1)
    stop()
    expect(frames.pending()).toBe(0)
    store.pause()
    store.play()
    expect(frames.pending()).toBe(0)
  })

  it('starts immediately when the store is already playing', () => {
    const frames = fakeFrames()
    const store = new PlaybackStore(600_000)
    store.play()
    runClock(store, frames.scheduler)
    expect(frames.pending()).toBe(1)
  })
})
