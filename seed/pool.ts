import type { LlmClient } from '@/lib/llm'

export async function pool<T>(
  items: readonly T[],
  n: number,
  fn: (item: T, i: number) => Promise<void>,
): Promise<void> {
  if (!(n >= 1)) throw new Error(`pool size must be at least 1, got ${n}`)
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++
      try {
        await fn(items[i], i)
      } catch (error) {
        failed = true // no new work is started; in-flight calls finish on their own
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
}

// One shared cap on concurrent model calls, however many callers (meetings x summary templates) there are.
export function limitClient(client: LlmClient, max: number): LlmClient {
  let active = 0
  const waiters: (() => void)[] = []
  return {
    async complete(req) {
      while (active >= max) await new Promise<void>((resolve) => waiters.push(resolve))
      active++
      try {
        return await client.complete(req)
      } finally {
        active--
        waiters.shift()?.()
      }
    },
  }
}

// Transport failures (spawn error, non-zero exit, timeout) retry with doubling backoff. Parse failures
// are a different retry, in completeJson. ponytail: retries every error, including a spent quota; it
// only costs baseMs * (2^retries - 1) before failing, so no error classification.
export function retryClient(
  client: LlmClient,
  opts: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): LlmClient {
  const { retries = 2, baseMs = 3000, sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)) } = opts
  return {
    async complete(req) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await client.complete(req)
        } catch (error) {
          if (attempt >= retries) throw error
          await sleep(baseMs * 2 ** attempt)
        }
      }
    },
  }
}
