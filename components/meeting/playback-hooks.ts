'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PlaybackStore } from '@/lib/playback'
import { findActiveIdx, type Seg } from '@/lib/speaker-runs'

export function useActiveIdx(store: PlaybackStore, segments: readonly Seg[]): number {
  const snapshot = () => findActiveIdx(segments, store.ms)
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

export function usePlaying(store: PlaybackStore): boolean {
  return useSyncExternalStore(store.subscribe, () => store.playing, () => store.playing)
}

export function useSpeed(store: PlaybackStore): number {
  return useSyncExternalStore(store.subscribe, () => store.speed, () => store.speed)
}

export function useMs(store: PlaybackStore, intervalMs = 100): number {
  const [ms, setMs] = useState(store.ms)
  useEffect(() => {
    let last = 0
    setMs(store.ms)
    return store.subscribe(() => {
      const now = performance.now()
      if (!store.playing || now - last >= intervalMs) {
        last = now
        setMs(store.ms)
      }
    })
  }, [store, intervalMs])
  return ms
}

export function useClock(store: PlaybackStore): void {
  useEffect(() => {
    let raf = 0
    let last = 0
    const frame = (time: number) => {
      store.tick(time - last)
      last = time
      raf = store.playing ? requestAnimationFrame(frame) : 0
    }
    const start = () => {
      if (!raf && store.playing) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    const unsubscribe = store.subscribe(start)
    start()
    return () => {
      unsubscribe()
      cancelAnimationFrame(raf)
    }
  }, [store])
}
