import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('app/globals.css', 'utf8')
const token = (name: string) => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`token --color-${name} not found as a 6-digit hex`)
  return match[1]
}
const luminance = (hex: string) => {
  const [red, green, blue] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
const ratio = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

describe('palette contrast', () => {
  const textPairs: [string, string][] = [
    ['fg', 'bg'], ['fg', 'surface'], ['muted', 'bg'], ['muted', 'surface'],
    ['accent-fg', 'accent'], ['danger', 'bg'],
  ]
  for (const [foreground, background] of textPairs) {
    it(`${foreground} on ${background} meets 4.5:1`, () =>
      expect(ratio(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5))
  }
  for (const type of ['action', 'insight', 'positive', 'feedback', 'objection', 'tech']) {
    it(`highlight ${type} is distinguishable on bg at 3:1`, () =>
      expect(ratio(token(`hl-${type}`), token('bg'))).toBeGreaterThanOrEqual(3))
  }
})
