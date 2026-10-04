import { describe, expect, it } from 'vitest'
import { pool } from '@/seed/pool'

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
})
