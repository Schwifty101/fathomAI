// Small text utilities shared by the static schema-conformance helpers. No dependencies: tolerant,
// bracket-aware scanning rather than a real parser. Every function throws on unbalanced input so a
// scanner that loses its place fails loudly instead of quietly returning less.

export type ScanOptions = {
  /** Treat a backslash as an escape inside quoted strings (TypeScript yes, SQL no). */
  backslash?: boolean
  /** Count < and > as brackets (TypeScript type literals only). */
  angle?: boolean
}

/** Index just past the string literal that opens at `i` (a quote or backtick). */
export function skipString(text: string, i: number, backslash = true): number {
  const quote = text[i]
  let j = i + 1
  while (j < text.length) {
    const c = text[j]
    if (backslash && c === '\\') { j += 2; continue }
    if (c === quote) return j + 1
    j++
  }
  throw new Error(`unterminated string starting at ${i}: ${text.slice(i, i + 40)}`)
}

const OPEN = '([{'
const CLOSE = ')]}'

/** Index of the bracket that closes the one opening at `openIdx`. */
export function closeIndex(text: string, openIdx: number, options: ScanOptions = {}): number {
  const backslash = options.backslash ?? true
  const want: string[] = []
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]
    if (c === '\'' || c === '"' || c === '`') { i = skipString(text, i, backslash) - 1; continue }
    if (OPEN.includes(c)) want.push(CLOSE[OPEN.indexOf(c)])
    else if (CLOSE.includes(c)) {
      if (want.pop() !== c) throw new Error(`mismatched bracket at ${i}: ${text.slice(Math.max(0, i - 30), i + 10)}`)
      if (want.length === 0) return i
    }
  }
  throw new Error(`no closing bracket for ${text[openIdx]} at ${openIdx}: ${text.slice(openIdx, openIdx + 60)}`)
}

/** Split on any of `seps` at bracket depth 0, skipping strings. Segments are not trimmed. */
export function splitTop(text: string, seps: string, options: ScanOptions = {}): string[] {
  const backslash = options.backslash ?? true
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\'' || c === '"' || c === '`') { i = skipString(text, i, backslash) - 1; continue }
    if (OPEN.includes(c)) depth++
    else if (CLOSE.includes(c)) depth--
    else if (options.angle && c === '<') depth++
    else if (options.angle && c === '>' && text[i - 1] !== '=') depth--
    else if (depth === 0 && seps.includes(c)) { out.push(text.slice(start, i)); start = i + 1 }
  }
  out.push(text.slice(start))
  return out
}

export const trimmed = (parts: string[]) => parts.map((part) => part.trim()).filter((part) => part !== '')

/** 1-based line number of a character offset. */
export function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}
export function lineAt(starts: number[], index: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= index) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/** A plain quoted string literal (no interpolation), unquoted; otherwise null. */
export function stringLiteral(expr: string): string | null {
  const t = expr.trim()
  const m = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1$/s.exec(t)
  if (!m) return null
  if (m[1] === '`' && m[2].includes('${')) return null
  return m[2].replace(/\\(['"`\\])/g, '$1')
}

/**
 * Blank out comments in TypeScript source and mark which characters are real code (not inside a string,
 * template text, regular expression or comment). Offsets and line numbers are preserved.
 */
export function maskTs(text: string): { clean: string; code: Uint8Array } {
  const n = text.length
  const clean = text.split('')
  const code = new Uint8Array(n)
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (clean[k] !== '\n') clean[k] = ' '
  }
  type Frame = { kind: 'tpl' } | { kind: 'expr'; depth: number }
  const stack: Frame[] = []
  let prev = '' // last significant code character, to tell a regular expression from a division
  let before = '' // the significant character before `prev` (a `!` after a value is a non-null assertion)
  let prevWord = ''
  let i = 0
  while (i < n) {
    const top = stack[stack.length - 1]
    const c = text[i]
    const d = text[i + 1]
    if (top?.kind === 'tpl') {
      if (c === '\\') { i += 2; continue }
      if (c === '`') { stack.pop(); prev = '`'; i++; continue }
      if (c === '$' && d === '{') { stack.push({ kind: 'expr', depth: 0 }); i += 2; prev = '{'; continue }
      i++
      continue
    }
    if (c === '/' && d === '/') {
      const j = text.indexOf('\n', i)
      const end = j === -1 ? n : j
      blank(i, end)
      i = end
      continue
    }
    if (c === '/' && d === '*') {
      const j = text.indexOf('*/', i + 2)
      const end = j === -1 ? n : j + 2
      blank(i, end)
      i = end
      continue
    }
    if (c === '\'' || c === '"') { i = skipString(text, i); prev = c; continue }
    if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue }
    const postfixBang = prev === '!' && /[\w)\]]/.test(before)
    if (c === '/' && !postfixBang && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || ['return', 'typeof', 'case', 'in', 'of'].includes(prevWord))) {
      let j = i + 1
      let inClass = false
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === '[') inClass = true
        else if (text[j] === ']') inClass = false
        else if (text[j] === '/' && !inClass) break
        else if (text[j] === '\n') throw new Error(`unterminated regular expression at ${i}`)
        j++
      }
      j++
      while (j < n && /[a-z]/i.test(text[j])) j++
      i = j
      prev = '/'
      prevWord = ''
      continue
    }
    // ordinary code character
    code[i] = 1
    if (top?.kind === 'expr') {
      if (c === '{') top.depth++
      else if (c === '}') {
        if (top.depth === 0) { stack.pop(); code[i] = 0; i++; continue }
        top.depth--
      }
    }
    if (!/\s/.test(c)) {
      before = prev
      prev = c
      if (/[A-Za-z_$]/.test(c)) {
        let j = i
        while (j < n && /[\w$]/.test(text[j])) j++
        prevWord = text.slice(i, j)
        for (let k = i; k < j; k++) code[k] = 1
        i = j
        prev = text[j - 1]
        continue
      }
      prevWord = ''
    }
    i++
  }
  if (stack.length) throw new Error('unterminated template literal while masking source')
  return { clean: clean.join(''), code }
}
