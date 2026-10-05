// Static extraction of every Supabase call in the application sources: `.from('t')` chains (select lists,
// filters, ordering, insert/upsert/update payload keys, onConflict) and `.rpc('f', {...})` calls.
// No type checker, no database: tolerant, bracket-aware scanning over comment-stripped source. Whatever it
// cannot resolve is recorded in `skips` instead of being guessed, and the test pins that list.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { closeIndex, lineAt, lineStarts, maskTs, splitTop, stringLiteral, trimmed } from './schema-text'

export type SourceFile = { file: string; text: string }
/** A condition an `if` puts in front of a chained call: `if (flag)` (set null) or `if (SET.has(param))`. */
export type Guard = { set: string | null; param: string }
export type Call = { method: string; args: string[]; line: number; guard: Guard | null }
export type Payload = { entries: { key: string; value: string }[]; unresolvedSpreads: string[] }
export type DbOp = {
  file: string
  line: number
  table: string
  /** How the table name was found: a literal, or the helper function it was passed through. */
  via: string
  calls: Call[]
  /** Parsed object literals of insert/upsert/update calls, in call order. */
  payloads: { method: string; payload: Payload }[]
}
export type RpcCall = { file: string; line: number; fn: string; keys: string[] | null; unresolvedSpreads: string[] }
export type Skip = { file: string; line: number; reason: string }
export type Usage = {
  ops: DbOp[]
  rpcs: RpcCall[]
  skips: Skip[]
  unknownMethods: { file: string; line: number; method: string }[]
}

const SCAN_DIRS = ['lib', 'app', 'seed', 'scripts', 'components']
const SCAN_FILES = ['middleware.ts']

/** Read the TypeScript sources that may talk to Supabase. Tests, generated seed data and build output are skipped. */
export function readSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const rel = relative(root, full).split('\\').join('/')
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules' || name === 'generated' || name === '.next') continue
        walk(full)
      } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
        out.push({ file: rel, text: readFileSync(full, 'utf8') })
      }
    }
  }
  for (const dir of SCAN_DIRS) walk(join(root, dir))
  for (const file of SCAN_FILES) out.push({ file, text: readFileSync(join(root, file), 'utf8') })
  return out
}

const JS_GLOBALS = new Set([
  'Array', 'Buffer', 'Object', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'Map', 'Set', 'String', 'Number', 'Symbol', 'Promise', 'JSON', 'Date',
])

const SELECT = 'select'
const WRITES = ['insert', 'upsert', 'update', 'delete']
const COLUMN_FIRST = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'overlaps',
  'textSearch', 'not', 'filter', 'order', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent',
]
const OTHER_KNOWN = [
  'match', 'or', 'limit', 'range', 'single', 'maybeSingle', 'csv', 'geojson', 'explain', 'rollback', 'returns',
  'setHeader', 'abortSignal', 'throwOnError', 'overrideTypes',
]
export const COLUMN_METHODS = COLUMN_FIRST
export const KNOWN_METHODS = new Set([SELECT, ...WRITES, ...COLUMN_FIRST, ...OTHER_KNOWN])

// ---------------------------------------------------------------------------------------------
// Object literals and type literals
// ---------------------------------------------------------------------------------------------

export type SpreadResolver = (name: string) => string[] | null

/** Parse `{ a: 1, b, 'c': x, ...rest }` (text must start at the opening brace). */
export function parseObjectText(text: string, resolveSpread: SpreadResolver = () => null): Payload {
  const body = text.slice(1, closeIndex(text, 0))
  const entries: Payload['entries'] = []
  const unresolvedSpreads: string[] = []
  for (const item of trimmed(splitTop(body, ','))) {
    let m: RegExpExecArray | null
    if (item.startsWith('...')) {
      const name = item.slice(3).trim()
      const keys = /^\w+$/.test(name) ? resolveSpread(name) : null
      if (keys) for (const key of keys) entries.push({ key, value: `...${name}` })
      else unresolvedSpreads.push(name)
    } else if ((m = /^(?:(\w+)|'([^']*)'|"([^"]*)")\s*:\s*([\s\S]*)$/.exec(item))) {
      entries.push({ key: m[1] ?? m[2] ?? m[3], value: m[4].trim() })
    } else if (/^\w+$/.test(item)) {
      entries.push({ key: item, value: item })
    } else unresolvedSpreads.push(item.slice(0, 40))
  }
  return { entries, unresolvedSpreads }
}

export type TypeKey = { type: string; optional: boolean }

/** Keys of a TypeScript type literal `{ a: string; b?: number }` (text must start at the opening brace). */
export function parseTypeLiteral(text: string): Map<string, TypeKey> {
  const body = text.slice(1, closeIndex(text, 0))
  const keys = new Map<string, TypeKey>()
  for (const entry of trimmed(splitTop(body, ';,\n', { angle: true }))) {
    const m = /^(?:readonly\s+)?(\w+)(\?)?\s*:\s*([\s\S]+)$/.exec(entry)
    if (!m) throw new Error(`cannot read type member "${entry.slice(0, 60)}"`)
    keys.set(m[1], { type: m[3].trim(), optional: !!m[2] })
  }
  return keys
}

/** Members of `type NAME = {...}` or an intersection of aliases and literals; null if it is anything else. */
export function typeShape(sources: SourceFile[], name: string, seen = new Set<string>()): Map<string, TypeKey> | null {
  if (seen.has(name)) return null
  seen.add(name)
  for (const source of sources) {
    const { clean } = maskTs(source.text)
    const m = new RegExp(`\\btype\\s+${name}\\s*=\\s*`).exec(clean)
    if (!m) continue
    let rest = clean.slice(m.index + m[0].length)
    // The alias ends at the first newline that is not inside brackets and not continuing with & or |.
    const pieces: string[] = []
    for (;;) {
      rest = rest.trimStart()
      let piece: string
      if (rest.startsWith('{')) piece = rest.slice(0, closeIndex(rest, 0) + 1)
      else {
        const word = /^[\w.]+(?:<[^>]*>)?(?:\[\])?/.exec(rest)
        if (!word) return null
        piece = word[0]
      }
      pieces.push(piece)
      rest = rest.slice(piece.length)
      const next = /^\s*&\s*/.exec(rest)
      if (!next) break
      rest = rest.slice(next[0].length)
    }
    const merged = new Map<string, TypeKey>()
    for (const piece of pieces) {
      const shape = piece.startsWith('{') ? parseTypeLiteral(piece) : /^\w+$/.test(piece) ? typeShape(sources, piece, seen) : null
      if (!shape) return null
      for (const [key, value] of shape) merged.set(key, value)
    }
    return merged
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------------------------

type FnDecl = { name: string; params: string[]; defaults: (string | null)[]; index: number }

function declarations(clean: string): FnDecl[] {
  const out: FnDecl[] = []
  const re = /(?:\basync\s+)?\bfunction\s+(\w+)\s*(?:<[^>]*>)?\s*\(|\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const open = m.index + m[0].length - 1
    let close: number
    try { close = closeIndex(clean, open) } catch { continue }
    if (m[2] !== undefined && !/^\s*(?::[^=]+)?=>/.test(clean.slice(close + 1, close + 80))) continue // a parenthesised value, not an arrow function
    const raw = trimmed(splitTop(clean.slice(open + 1, close), ',', { angle: true }))
    const params = raw.map((p) => /^(?:\.\.\.)?(\w+)/.exec(p)?.[1] ?? '')
    const defaults = raw.map((p) => { const at = p.search(/(?<![=!<>])=(?![=>])/); return at === -1 ? null : p.slice(at + 1).trim() })
    out.push({ name: m[1] ?? m[2], params, defaults, index: m.index })
  }
  return out
}

/** `const NAME = (args) => ({ ... })` helpers, by name, with the offset of the object's opening brace. */
function objectHelpers(clean: string): Map<string, number> {
  const out = new Map<string, number>()
  const re = /\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=>]+)?=>\s*\(\s*\{/g
  for (let m = re.exec(clean); m; m = re.exec(clean)) out.set(m[1], m.index + m[0].length - 1)
  return out
}

/** Keys that `...name` contributes inside `file`, or null when it cannot be resolved. */
function makeSpreadResolver(clean: string, sources: SourceFile[]): SpreadResolver {
  return (name) => {
    // (1) const name = someFunction(...): use that function's declared return type.
    const call = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*(?:await\\s+)?(\\w+)\\s*\\(`).exec(clean)
    if (call) {
      const keys = returnTypeKeys(sources, call[1])
      if (keys) return [...keys.keys()]
    }
    // (2) name is the parameter of `ARRAY.map((name) => ...)` and ARRAY is a const array of object literals.
    const map = new RegExp(`\\b(\\w+)\\s*\\.map\\(\\s*\\(?\\s*${name}\\b`).exec(clean)
    if (map) {
      // The array is `const R = [...]`, or a property `R: ARRAY` (such as `events: EVENTS`) naming a const array.
      const names = [map[1], ...[...clean.matchAll(new RegExp(`\\b${map[1]}\\s*:\\s*(\\w+)\\b`, 'g'))].map((x) => x[1])]
      for (const arrayName of names) {
        const decl = new RegExp(`\\bconst\\s+${arrayName}\\b[^=]*=\\s*\\[`).exec(clean)
        if (!decl) continue
        const open = decl.index + decl[0].length - 1
        const elements = trimmed(splitTop(clean.slice(open + 1, closeIndex(clean, open)), ','))
        const keySets = elements.filter((e) => e.startsWith('{')).map((e) => parseObjectText(e).entries.map((x) => x.key).sort().join(','))
        if (keySets.length > 0 && new Set(keySets).size === 1) return keySets[0].split(',')
      }
    }
    return null
  }
}

/** Declared return type of a function found in any source, as a set of keys; null when unavailable. */
function returnTypeKeys(sources: SourceFile[], fnName: string): Map<string, TypeKey> | null {
  for (const source of sources) {
    const { clean } = maskTs(source.text)
    const m = new RegExp(`\\bfunction\\s+${fnName}\\s*(?:<[^>]*>)?\\s*\\(`).exec(clean)
    if (!m) continue
    const open = m.index + m[0].length - 1
    const after = clean.slice(closeIndex(clean, open) + 1)
    const ret = /^\s*:\s*/.exec(after)
    if (!ret) return null
    const rest = after.slice(ret[0].length)
    if (rest.startsWith('{')) return parseTypeLiteral(rest.slice(0, closeIndex(rest, 0) + 1))
    const alias = /^(\w+)/.exec(rest)
    return alias ? typeShape(sources, alias[1]) : null
  }
  return null
}

type Chain = { calls: Call[]; end: number }

export function extractUsage(sources: SourceFile[]): Usage {
  const usage: Usage = { ops: [], rpcs: [], skips: [], unknownMethods: [] }
  for (const source of sources) scanFile(source, sources, usage)
  return usage
}

/** A row-building step of a loader plan: `{ table: 'x', rows: ... }` or a call of a helper that pushes one. */
type StepEntry = { table: string; line: number; payloads: Payload[] | null }
/** One concrete table a helper call resolves to; sink entries carry the plan step's own line and rows. */
type Resolved = { table: string; step: StepEntry | null; sinkVar: string | null }

function scanFile(source: SourceFile, sources: SourceFile[], usage: Usage): void {
  // JSX text (apostrophes, closing tags) defeats the string/regex masker, so .tsx files are scanned unmasked.
  const { clean, code } = source.file.endsWith('.tsx')
    ? { clean: source.text, code: new Uint8Array(source.text.length).fill(1) }
    : maskTs(source.text)
  const starts = lineStarts(source.text)
  const line = (index: number) => lineAt(starts, index)
  const skip = (index: number, reason: string) => usage.skips.push({ file: source.file, line: line(index), reason })
  const spreads = makeSpreadResolver(clean, sources)
  const helpers = objectHelpers(clean)
  const decls = declarations(clean)

  const readCall = (open: number) => {
    const close = closeIndex(clean, open)
    return { args: trimmed(splitTop(clean.slice(open + 1, close), ',')), end: close }
  }

  const walk = (start: number, guard: Guard | null = null): Chain => {
    const calls: Call[] = []
    let i = start
    const re = /\s*\.\s*([A-Za-z_$][\w$]*)\s*/y
    for (;;) {
      re.lastIndex = i
      const m = re.exec(clean)
      if (!m) break
      const open = i + m[0].length
      if (clean[open] !== '(') break // property access such as `.error`
      const { args, end } = readCall(open)
      calls.push({ method: m[1], args, line: line(open), guard })
      i = end + 1
    }
    return { calls, end: i }
  }

  // --- payload resolution -------------------------------------------------------------------
  const objectAt = (open: number): Payload => parseObjectText(clean.slice(open, closeIndex(clean, open) + 1), spreads)

  const payloadsOf = (expr: string): Payload[] | null => {
    const t = expr.trim()
    if (t.startsWith('{')) return [parseObjectText(t, spreads)]
    if (t.startsWith('[')) {
      const out: Payload[] = []
      for (const element of trimmed(splitTop(t.slice(1, closeIndex(t, 0)), ','))) {
        const found = payloadsOf(element.replace(/^\.\.\./, ''))
        if (!found) return null
        out.push(...found)
      }
      return out
    }
    const arrow = /=>\s*\(?\s*\{/.exec(t)
    if (arrow) return [parseObjectText(t.slice(arrow.index + arrow[0].length - 1), spreads)]
    const re = /\b(\w+)\s*\(/g
    for (let m = re.exec(t); m; m = re.exec(t)) {
      const open = helpers.get(m[1])
      if (open !== undefined) return [objectAt(open)]
    }
    return null
  }

  const finish = (op: Omit<DbOp, 'payloads'>, argSubstitute?: (arg: string) => string, override?: Payload[]): DbOp => {
    const payloads: DbOp['payloads'] = []
    for (const call of op.calls) {
      if (call.method !== 'insert' && call.method !== 'upsert' && call.method !== 'update') continue
      const expr = argSubstitute ? argSubstitute(call.args[0] ?? '') : call.args[0] ?? ''
      const found = override ?? payloadsOf(expr)
      if (!found) usage.skips.push({ file: source.file, line: call.line, reason: `${call.method} payload is not an object literal or local helper (${expr.slice(0, 50)})` })
      else for (const payload of found) payloads.push({ method: call.method, payload })
    }
    return { ...op, payloads }
  }

  // --- constants the loader resolves names through ------------------------------------------
  /** `const NAME = ['a', 'b'] as const` (any annotation): the string literals, or null. */
  const constStrings = (name: string): string[] | null => {
    const decl = new RegExp(`\\bconst\\s+${name}\\b[^=;]*=\\s*\\[`).exec(clean)
    if (!decl) return null
    const open = decl.index + decl[0].length - 1
    const values = trimmed(splitTop(clean.slice(open + 1, closeIndex(clean, open)), ',')).map(stringLiteral)
    return values.every((v) => v !== null) ? (values as string[]) : null
  }
  /** `const NAME = new Set<T>(['a', 'b'])`: the string literals, or null. */
  const constSet = (name: string): string[] | null => {
    const decl = new RegExp(`\\bconst\\s+${name}\\b[^=;]*=\\s*new\\s+Set\\s*(?:<[^>]*>)?\\s*\\(\\s*\\[`).exec(clean)
    if (!decl) return null
    const open = decl.index + decl[0].length - 1
    const values = trimmed(splitTop(clean.slice(open + 1, closeIndex(clean, open)), ',')).map(stringLiteral)
    return values.every((v) => v !== null) ? (values as string[]) : null
  }
  /** `const NAME = { key: 'literal', ... }`: its string-valued entries, or null. */
  const constStringMap = (name: string): Map<string, string> | null => {
    const decl = new RegExp(`\\bconst\\s+${name}\\b[^=;]*=\\s*\\{`).exec(clean)
    if (!decl) return null
    const entries = parseObjectText(clean.slice(decl.index + decl[0].length - 1, closeIndex(clean, decl.index + decl[0].length - 1) + 1)).entries
    const out = new Map<string, string>()
    for (const entry of entries) {
      const value = stringLiteral(entry.value)
      if (value === null) return null
      out.set(entry.key, value)
    }
    return out
  }

  /** for-of loops whose body contains `at`, outermost first. */
  const loopsAround = (at: number): { v: string; iter: string }[] => {
    const out: { v: string; iter: string }[] = []
    const re = /\bfor\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+([^()]*?)\s*\)\s*/g
    for (let m = re.exec(clean); m && m.index <= at; m = re.exec(clean)) {
      if (!code[m.index]) continue
      const bodyStart = m.index + m[0].length
      let end: number
      if (clean[bodyStart] === '{') end = closeIndex(clean, bodyStart)
      else { const nl = clean.indexOf('\n', bodyStart); end = nl === -1 ? clean.length : nl }
      if (at <= end) out.push({ v: m[1], iter: m[2] })
    }
    return out
  }

  // --- plan steps: `{ table: 'x', rows: <expr> }` and helpers that push `{ table, rows }` onto `steps` ---------
  let stepsCache: StepEntry[] | null = null
  let stepsConsumed = false
  const planSteps = (): StepEntry[] => {
    if (stepsCache) return stepsCache
    const out: StepEntry[] = []
    const literal = /\{\s*table\s*:\s*(['"])(\w+)\1\s*,\s*rows\s*:/g
    for (let m = literal.exec(clean); m; m = literal.exec(clean)) {
      if (!code[m.index]) continue
      const object = parseObjectText(clean.slice(m.index, closeIndex(clean, m.index) + 1), spreads)
      const rows = object.entries.find((entry) => entry.key === 'rows')
      out.push({ table: m[2], line: line(m.index), payloads: rows ? payloadsOf(rows.value) : null })
    }
    const pushes = /\bsteps\s*\.\s*push\(\s*\{\s*table\s*,\s*rows\b/g
    for (let m = pushes.exec(clean); m; m = pushes.exec(clean)) {
      if (!code[m.index]) continue
      const decl = decls.filter((d) => d.index < m.index).pop()
      const tableAt = decl?.params.indexOf('table') ?? -1
      const rowsAt = decl?.params.indexOf('rows') ?? -1
      if (!decl || tableAt === -1 || rowsAt === -1) { skip(m.index, 'steps.push({ table, rows }) is not inside a function taking (table, rows)'); continue }
      const callRe = new RegExp(`\\b${decl.name}\\s*\\(`, 'g')
      for (let c = callRe.exec(clean); c; c = callRe.exec(clean)) {
        if (!code[c.index] || clean[c.index - 1] === '.' || /\b(?:function|const|let)\s+$/.test(clean.slice(Math.max(0, c.index - 10), c.index))) continue
        const site = readCall(c.index + c[0].length - 1)
        const table = stringLiteral(site.args[tableAt] ?? '')
        if (table === null) { skip(c.index, `${decl.name}() pushes a plan step with a non-literal table`); continue }
        out.push({ table, line: line(c.index), payloads: payloadsOf(site.args[rowsAt] ?? '') })
      }
    }
    for (const step of out) {
      if (!step.payloads) usage.skips.push({ file: source.file, line: step.line, reason: `plan step rows for ${step.table} are not an object literal or local helper` })
    }
    stepsCache = out
    return out
  }

  /** The concrete tables a table argument stands for at `at`: a literal, a loop variable over a const array, or `step.table`. */
  const resolveTableArg = (expr: string, at: number): { entries: Resolved[] } | { reason: string } => {
    const t = expr.trim()
    const literal = stringLiteral(t)
    if (literal !== null) return { entries: [{ table: literal, step: null, sinkVar: null }] }
    const loopVar = /^(\w+)$/.exec(t)
    if (loopVar) {
      const loop = loopsAround(at).filter((l) => l.v === loopVar[1]).pop()
      if (!loop) return { reason: `${t} is not a literal or a for-of variable` }
      const inline = loop.iter.startsWith('[') ? trimmed(splitTop(loop.iter.slice(1, -1), ',')).map(stringLiteral) : null
      const list = inline ? (inline.every((v) => v !== null) ? (inline as string[]) : null) : /^\w+$/.test(loop.iter) ? constStrings(loop.iter) : null
      if (!list) return { reason: `for (const ${t} of ${loop.iter}) does not iterate a const array of string literals` }
      return { entries: list.map((table) => ({ table, step: null, sinkVar: null })) }
    }
    const member = /^(\w+)\.table$/.exec(t)
    if (member) {
      const loop = loopsAround(at).filter((l) => l.v === member[1]).pop()
      if (!loop || !/^\w+\.steps$/.test(loop.iter) || !/\breturn\s*\{\s*steps\b/.test(clean)) {
        return { reason: `${t} is not the table of a loop over the plan's .steps (a function returning { steps })` }
      }
      stepsConsumed = true
      const steps = planSteps()
      if (steps.length === 0) return { reason: 'no plan steps were found to resolve .table against' }
      return { entries: steps.map((step) => ({ table: step.table, step, sinkVar: member[1] })) }
    }
    return { reason: `${t.slice(0, 40)} is not a literal, loop variable or step.table` }
  }

  // --- .from(...) -------------------------------------------------------------------------------
  const guardBefore = (index: number): Guard | null => {
    const text = clean.slice(clean.lastIndexOf('\n', index) + 1, index)
    const has = /\bif\s*\(\s*(\w+)\.has\(\s*(\w+)\s*\)\s*\)\s*$/.exec(text)
    if (has) return { set: has[1], param: has[2] }
    const bare = /\bif\s*\(\s*(\w+)\s*\)\s*$/.exec(text)
    return bare ? { set: null, param: bare[1] } : null
  }

  const fromRe = /\.\s*from\s*\(/g
  for (let m = fromRe.exec(clean); m; m = fromRe.exec(clean)) {
    if (!code[m.index]) continue
    const receiver = /([A-Za-z_$][\w$]*)\s*$/.exec(clean.slice(Math.max(0, m.index - 60), m.index))
    if (receiver && JS_GLOBALS.has(receiver[1])) continue
    const open = m.index + m[0].length - 1
    const { args, end } = readCall(open)
    if (args.length !== 1) { skip(m.index, `.from() with ${args.length} arguments`); continue }
    const chain = walk(end + 1)
    let calls = chain.calls

    // A builder kept in a variable and extended later: `let q = db.from('t')...; if (x) q = q.eq(...)`.
    const assigned = /(?:\blet|\bconst|\bvar)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?[\w$.]+(?:\(\))?\s*$/.exec(clean.slice(Math.max(0, m.index - 120), m.index))
    if (assigned) {
      const name = assigned[1]
      const redeclared = new RegExp(`\\b(?:let|const|var)\\s+${name}\\b`, 'g')
      redeclared.lastIndex = chain.end
      const stop = redeclared.exec(clean)?.index ?? clean.length
      const cont = new RegExp(`\\b${name}\\s*=\\s*${name}\\b(?=\\s*\\.)`, 'g')
      cont.lastIndex = chain.end
      for (let c = cont.exec(clean); c && c.index < stop; c = cont.exec(clean)) {
        calls = calls.concat(walk(c.index + c[0].length, guardBefore(c.index)).calls)
      }
    }

    for (const call of calls) {
      if (!KNOWN_METHODS.has(call.method)) usage.unknownMethods.push({ file: source.file, line: call.line, method: call.method })
    }

    const tableLiteral = stringLiteral(args[0])
    if (tableLiteral !== null) {
      usage.ops.push(finish({ file: source.file, line: line(m.index), table: tableLiteral, via: 'literal', calls }))
      continue
    }

    // Dynamic table name: a parameter of the enclosing helper (resolved at every call site), or a loop variable.
    const ident = /^\w+$/.test(args[0]) ? args[0] : null
    if (!ident) { skip(m.index, `.from(${args[0].slice(0, 40)}) is not a literal or identifier`); continue }
    const enclosing = decls.filter((d) => d.index < m.index).pop()
    const paramIndex = enclosing ? enclosing.params.indexOf(ident) : -1
    if (enclosing && paramIndex !== -1) {
      let sites = 0
      const callRe = new RegExp(`\\b${enclosing.name}\\s*\\(`, 'g')
      for (let c = callRe.exec(clean); c; c = callRe.exec(clean)) {
        if (!code[c.index] || clean[c.index - 1] === '.' || /\bfunction\s+$/.test(clean.slice(Math.max(0, c.index - 12), c.index))) continue
        const site = readCall(c.index + c[0].length - 1)
        const tableArg = site.args[paramIndex] ?? ''
        const resolved = resolveTableArg(tableArg, c.index)
        if ('reason' in resolved) { skip(c.index, `${enclosing.name}() table argument cannot be resolved: ${resolved.reason}`); continue }
        sites++
        for (const entry of resolved.entries) {
          const bind = (arg: string): string => {
            const direct = enclosing.params.indexOf(arg.trim())
            if (direct !== -1) return site.args[direct] ?? arg
            const root = /^(\w+)\b/.exec(arg.trim())
            const rootIndex = root ? enclosing.params.indexOf(root[1]) : -1
            return rootIndex !== -1 ? site.args[rootIndex] ?? arg : arg
          }
          // `MAP[table] ?? 'default'` as a select list: the entry for this table, else the default.
          const lookup = (arg: string): string | null => {
            const l = /^(\w+)\[(\w+)\]\s*\?\?\s*(['"`])([^'"`]*)\3$/.exec(arg.trim())
            if (!l || l[2] !== ident) return null
            const map = constStringMap(l[1])
            return map ? `'${map.get(entry.table) ?? l[4]}'` : null
          }
          // Is a guarded call part of this expansion? Unknown truthiness counts as applied, so a mistake is not hidden.
          const applies = (guard: Guard | null): boolean => {
            if (guard === null) return true
            const at = enclosing.params.indexOf(guard.param)
            if (guard.set !== null) {
              const members = constSet(guard.set)
              if (!members) { skip(c.index, `guard ${guard.set}.has(${guard.param}) cannot be resolved: ${guard.set} is not a const Set of string literals`); return false }
              if (at === paramIndex) return members.includes(entry.table)
              const literal = stringLiteral(site.args[at] ?? '')
              if (literal === null) { skip(c.index, `guard ${guard.set}.has(${guard.param}) cannot be resolved for this call`); return false }
              return members.includes(literal)
            }
            if (at === -1) return true
            const given = site.args[at]?.trim() ?? enclosing.defaults[at]?.trim() ?? 'undefined'
            return !['false', 'undefined', 'null', '0', "''", '""'].includes(given)
          }
          const bound = calls
            .filter((call) => applies(call.guard))
            .map((call) => ({
              ...call,
              args: call.args.map((arg, k) => {
                if (k === 0 && WRITES.includes(call.method)) return arg
                if (k === 0 && call.method === 'select') { const looked = lookup(arg); if (looked !== null) return looked }
                return enclosing.params.includes(arg.trim()) ? bind(arg) : arg
              }),
            }))
          // Rows reach the helper as `step.rows` when the table came from a plan step: take that step's own rows.
          const writeCall = calls.find((call) => ['insert', 'upsert', 'update'].includes(call.method))
          const rowsParam = writeCall ? enclosing.params.indexOf(/^(\w+)\b/.exec((writeCall.args[0] ?? '').trim())?.[1] ?? '') : -1
          const rowsArg = rowsParam === -1 ? '' : (site.args[rowsParam] ?? '').trim()
          const override = entry.step && entry.step.payloads && rowsArg === `${entry.sinkVar}.rows` ? entry.step.payloads : undefined
          usage.ops.push(finish({
            file: source.file,
            line: entry.step ? entry.step.line : line(c.index),
            table: entry.table,
            via: entry.step ? `helper ${enclosing.name}() <- plan step` : `helper ${enclosing.name}()`,
            calls: bound,
          }, bind, override))
        }
      }
      if (sites === 0) skip(m.index, `${enclosing.name}() has no resolvable call sites for .from(${ident})`)
      continue
    }
    const resolved = resolveTableArg(ident, m.index)
    if ('reason' in resolved) { skip(m.index, `.from(${ident}) cannot be resolved: ${resolved.reason}`); continue }
    for (const entry of resolved.entries) {
      usage.ops.push(finish({ file: source.file, line: line(m.index), table: entry.table, via: `for-of ${ident}`, calls }))
    }
  }

  // Plan steps that no writer loop consumed would be rows nobody checked.
  if (!stepsConsumed && (/\bsteps\s*\.\s*push\(/.test(clean) || /\{\s*table\s*:\s*['"]\w+['"]\s*,\s*rows\s*:/.test(clean))) {
    skip(0, 'plan steps are built (steps.push / { table, rows }) but no loop over the plan\'s .steps writing step.table was resolved')
  }

  // --- .rpc(...) --------------------------------------------------------------------------------
  const rpcRe = /\.\s*rpc\s*\(/g
  for (let m = rpcRe.exec(clean); m; m = rpcRe.exec(clean)) {
    if (!code[m.index]) continue
    const { args } = readCall(m.index + m[0].length - 1)
    const fn = stringLiteral(args[0] ?? '')
    if (fn === null) { skip(m.index, '.rpc() with a non-literal function name'); continue }
    if (args.length === 1) { usage.rpcs.push({ file: source.file, line: line(m.index), fn, keys: [], unresolvedSpreads: [] }); continue }
    if (args[1].startsWith('{')) {
      const payload = parseObjectText(args[1], spreads)
      usage.rpcs.push({ file: source.file, line: line(m.index), fn, keys: payload.entries.map((e) => e.key), unresolvedSpreads: payload.unresolvedSpreads })
    } else {
      usage.rpcs.push({ file: source.file, line: line(m.index), fn, keys: null, unresolvedSpreads: [args[1].slice(0, 40)] })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// PostgREST select strings
// ---------------------------------------------------------------------------------------------

export type SelectTree = {
  star: boolean
  columns: string[]
  embeds: { alias: string | null; table: string; hint: string | null; select: SelectTree }[]
  issues: string[]
}

/** Parse `'id, name, host:team_members(name, role), participants!inner(name)'`. */
export function parseSelect(text: string): SelectTree {
  const tree: SelectTree = { star: false, columns: [], embeds: [], issues: [] }
  for (const item of trimmed(splitTop(text, ','))) {
    if (item === '*') { tree.star = true; continue }
    const embed = /^(?:(\w+):)?(\w+)(?:!(?!inner\b|left\b)(\w+))?(?:!(?:inner|left))?\s*\(([\s\S]*)\)$/.exec(item)
    if (embed) {
      tree.embeds.push({ alias: embed[1] ?? null, table: embed[2], hint: embed[3] ?? null, select: parseSelect(embed[4]) })
      continue
    }
    const column = /^(?:(\w+):)?(\w+)(?:::\w+)?$/.exec(item)
    if (column) tree.columns.push(column[2])
    else tree.issues.push(item)
  }
  return tree
}
