import { cpSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assemble } from '@/seed/assemble'
import { fileOf, GEN_DIR, readJson, writeJson } from '@/seed/io'

type T = { lines: { speaker: string; text: string }[]; chapters: { title: string; start_idx: number }[] }

// Rebuild the hand-written inputs from the committed bundle; assembling them must reproduce it.
function stage() {
  const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
  cpSync(join(GEN_DIR, 'eng-standup'), join(dir, 'eng-standup'), { recursive: true })
  const at = (n: string) => fileOf('eng-standup', n, dir)
  const original = readJson<T>(at('transcript'))
  const ends = [...original.chapters.map((c) => c.start_idx).slice(1), original.lines.length]
  writeJson(at('lines'), {
    chapters: original.chapters.map((c, i) => ({
      title: c.title,
      lines: original.lines.slice(c.start_idx, ends[i]).map(({ speaker, text }) => ({ speaker, text })),
    })),
  })
  writeJson(at('picks'), {
    action_items: readJson<object[]>(at('actions')),
    highlights: readJson<object[]>(at('highlights')),
  })
  return { dir, at, original }
}

describe('assemble', () => {
  it('rebuilds a committed bundle from its hand-written parts', () => {
    const { dir, at, original } = stage()
    expect(assemble('eng-standup', dir, () => {})).toEqual([])
    expect(readJson(at('transcript'))).toEqual(original)
    expect(existsSync(at('lines'))).toBe(false)
    expect(existsSync(at('picks'))).toBe(false)
  })

  it('rejects chapter titles that differ from the brief and keeps the inputs', () => {
    const { dir, at } = stage()
    const lines = readJson<{ chapters: { title: string }[] }>(at('lines'))
    lines.chapters[0].title = 'Something else'
    writeJson(at('lines'), lines)
    expect(() => assemble('eng-standup', dir, () => {})).toThrow(/chapter titles/)
    expect(existsSync(at('lines'))).toBe(true)
  })
})
