import { describe, expect, it } from 'vitest'
import { PlaybackStore } from '@/lib/playback'

describe('PlaybackStore', () => {
  it('does not advance while paused', () => {
    const store = new PlaybackStore(10_000)
    store.tick(500)
    expect(store.ms).toBe(0)
  })

  it('advances by delta times speed while playing', () => {
    const store = new PlaybackStore(10_000)
    store.play()
    store.tick(1000)
    store.setSpeed(2)
    store.tick(1000)
    expect(store.ms).toBe(3000)
  })

  it('stops at the end', () => {
    const store = new PlaybackStore(1000)
    store.play()
    store.tick(5000)
    expect(store.ms).toBe(1000)
    expect(store.playing).toBe(false)
  })

  it('play at the end restarts from zero', () => {
    const store = new PlaybackStore(1000, 1000)
    store.play()
    expect(store.ms).toBe(0)
    expect(store.playing).toBe(true)
  })

  it('clamps seek and skip to the duration', () => {
    const store = new PlaybackStore(10_000, 5000)
    store.seek(-50)
    expect(store.ms).toBe(0)
    store.seek(999_999)
    expect(store.ms).toBe(10_000)
    store.seek(5000)
    store.skip(-10_000)
    expect(store.ms).toBe(0)
  })

  it('clamps the initial time and notifies subscribers', () => {
    const store = new PlaybackStore(1000, 99_999)
    expect(store.ms).toBe(1000)
    let count = 0
    const unsubscribe = store.subscribe(() => count++)
    store.seek(10)
    store.toggle()
    unsubscribe()
    store.seek(20)
    expect(count).toBe(2)
  })
})
