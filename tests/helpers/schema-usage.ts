// Static extraction of every Supabase call in the application sources: `.from('t')` chains (select lists,
// filters, ordering, insert/upsert/update payload keys, onConflict) and `.rpc('f', {...})` calls.
// No type checker, no database: tolerant, bracket-aware scanning over comment-stripped source. Whatever it
// cannot resolve is recorded in `skips` instead of being guessed, and the test pins that list.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { closeIndex, lineAt, lineStarts, maskTs, splitTop, stringLiteral, trimmed } from './schema-text'

export type SourceFile = { file: string; text: string }
export type Call = { method: string; args: string[]; line: number; guard: string | null }
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

type FnDecl = { name: string; params: string[]; index: number }

function declarations(clean: string): FnDecl[] {
  const out: FnDecl[] = []
  const re = /(?:\basync\s+)?\bfunction\s+(\w+)\s*(?:<[^>]*>)?\s*\(|\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const open = m.index + m[0].length - 1
    let close: number
    try { close = closeIndex(clean, open) } catch { continue }
    if (m[2] !== undefined && !/^\s*(?::[^=]+)?=>/.test(clean.slice(close + 1, close + 80))) continue // a parenthesised value, not an arrow function
    const params = trimmed(splitTop(clean.slice(open + 1, close), ',', { angle: true }))
      .map((p) => /^(?:\.\.\.)?(\w+)/.exec(p)?.[1] ?? '')
    out.push({ name: m[1] ?? m[2], params, index: m.index })
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
      const decl = new RegExp(`\\bconst\\s+${map[1]}\\b[^=]*=\\s*\\[`).exec(clean)
      if (decl) {
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

  const walk = (start: number, guard: string | null = null): Chain => {
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

  const payloadsOf = (expr: string, at: number): Payload[] | null => {
    const t = expr.trim()
    if (t.startsWith('{')) return [parseObjectText(t, spreads)]
    if (t.startsWith('[')) {
      const out: Payload[] = []
      for (const element of trimmed(splitTop(t.slice(1, closeIndex(t, 0)), ','))) {
        const found = payloadsOf(element.replace(/^\.\.\./, ''), at)
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

  const finish = (op: Omit<DbOp, 'payloads'>, argSubstitute?: (arg: string) => string): DbOp => {
    const payloads: DbOp['payloads'] = []
    for (const call of op.calls) {
      if (call.method !== 'insert' && call.method !== 'upsert' && call.method !== 'update') continue
      const expr = argSubstitute ? argSubstitute(call.args[0] ?? '') : call.args[0] ?? ''
      const found = payloadsOf(expr, 0)
      if (!found) usage.skips.push({ file: source.file, line: call.line, reason: `${call.method} payload is not an object literal or local helper (${expr.slice(0, 50)})` })
      else for (const payload of found) payloads.push({ method: call.method, payload })
    }
    return { ...op, payloads }
  }

  // --- .from(...) -------------------------------------------------------------------------------
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
        const lineStart = clean.lastIndexOf('\n', c.index) + 1
        const guard = /\bif\s*\(\s*(\w+)\s*\)\s*$/.exec(clean.slice(lineStart, c.index))?.[1] ?? null
        calls = calls.concat(walk(c.index + c[0].length, guard).calls)
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

    // Dynamic table name: resolve through the helper function's parameter, or a for-of literal list.
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
        const table = stringLiteral(site.args[paramIndex] ?? '')
        sites++
        if (table === null) { skip(c.index, `${enclosing.name}() called with a non-literal table`); continue }
        const bind = (arg: string): string => {
          const direct = enclosing.params.indexOf(arg.trim())
          if (direct !== -1) return site.args[direct] ?? arg
          const root = /^(\w+)\b/.exec(arg.trim())
          const rootIndex = root ? enclosing.params.indexOf(root[1]) : -1
          return rootIndex !== -1 ? site.args[rootIndex] ?? arg : arg
        }
        const bound = calls
          .filter((call) => call.guard === null || (enclosing.params.indexOf(call.guard) !== -1 && (site.args[enclosing.params.indexOf(call.guard)] ?? '').trim() === 'true'))
          .map((call) => ({ ...call, args: call.args.map((arg, k) => (k === 0 && WRITES.includes(call.method) ? arg : enclosing.params.includes(arg.trim()) ? bind(arg) : arg)) }))
        usage.ops.push(finish({ file: source.file, line: line(c.index), table, via: `helper ${enclosing.name}()`, calls: bound }, bind))
      }
      if (sites === 0) skip(m.index, `${enclosing.name}() has no call sites to resolve .from(${ident}) against`)
      continue
    }
    const loop = new RegExp(`\\bfor\\s*\\(\\s*(?:const|let)\\s+${ident}\\s+of\\s*\\[`, 'g')
    let found: RegExpExecArray | null = null
    for (let l = loop.exec(clean); l && l.index < m.index; l = loop.exec(clean)) found = l
    if (found) {
      const open = found.index + found[0].length - 1
      for (const element of trimmed(splitTop(clean.slice(open + 1, closeIndex(clean, open)), ','))) {
        const table = stringLiteral(element)
        if (table === null) skip(m.index, `for-of list for .from(${ident}) holds a non-literal`)
        else usage.ops.push(finish({ file: source.file, line: line(m.index), table, via: `for-of ${ident}`, calls }))
      }
      continue
    }
    skip(m.index, `.from(${ident}) could not be resolved`)
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
