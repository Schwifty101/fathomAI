import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs on Node 22 or newer', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(22)
  })
})
