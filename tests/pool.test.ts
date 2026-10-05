import { describe, expect, it } from 'vitest'
import type { LlmClient } from '@/lib/llm'
import { limitClient, pool, retryClient } from '@/seed/pool'

describe('pool', () => {
  it('never exceeds the concurrency limit and runs every item', async () => {
    let running = 0
    let max = 0
    const done: number[] = []
    await pool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++
      max = Math.max(max, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      done.push(n)
    })
    expect(max).toBe(2)
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('rejects a non-positive size instead of silently doing nothing', async () => {
    await expect(pool([1], 0, async () => {})).rejects.toThrow(/at least 1/)
  })
  it('stops handing out work after fn throws', async () => {
    const started: number[] = []
    await expect(pool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n)
      await new Promise((r) => setTimeout(r, 2))
      if (n === 2) throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(started.length).toBeLessThan(6)
  })
})

describe('limitClient', () => {
  it('caps concurrent complete() calls across all callers', async () => {
    let running = 0
    let max = 0
    const inner: LlmClient = {
      async complete() {
        running++
        max = Math.max(max, running)
        await new Promise((r) => setTimeout(r, 5))
        running--
        return 'ok'
      },
    }
    const limited = limitClient(inner, 3)
    await Promise.all(Array.from({ length: 10 }, () => limited.complete({ prompt: 'p' })))
    expect(max).toBe(3)
  })
  it('releases the slot when a call fails', async () => {
    const limited = limitClient({ async complete() { throw new Error('x') } }, 1)
    await expect(limited.complete({ prompt: 'p' })).rejects.toThrow('x')
    await expect(limited.complete({ prompt: 'p' })).rejects.toThrow('x')
  })
})

describe('retryClient', () => {
  const flaky = (failures: number): LlmClient & { calls: number } => ({
    calls: 0,
    async complete() {
      if (this.calls++ < failures) throw new Error('claude exited 1: network down')
      return 'ok'
    },
  })
  it('retries transport errors with backoff and then succeeds', async () => {
    const waits: number[] = []
    const inner = flaky(2)
    const client = retryClient(inner, { retries: 2, baseMs: 100, sleep: async (ms) => { waits.push(ms) } })
    expect(await client.complete({ prompt: 'p' })).toBe('ok')
    expect(inner.calls).toBe(3)
    expect(waits).toEqual([100, 200])
  })
  it('gives up after the cap and rethrows the last error', async () => {
    const inner = flaky(99)
    const client = retryClient(inner, { retries: 2, baseMs: 1, sleep: async () => {} })
    await expect(client.complete({ prompt: 'p' })).rejects.toThrow('network down')
    expect(inner.calls).toBe(3)
  })
})
