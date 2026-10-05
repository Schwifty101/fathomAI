// Pure conformance checks: (schema model, extracted usage) in, a list of human-readable problems out.
// They take the schema and usage as arguments so the test file can also run them on deliberately broken
// copies and prove that each one can fail.
import { splitTop, stringLiteral, trimmed } from './schema-text'
import {
  allowedValues, conflictTargets, failingChecks, relationColumns, uniqueSets, type Schema,
} from './schema-sql'
import {
  COLUMN_METHODS, parseObjectText, parseSelect, typeShape, type DbOp, type RpcCall, type SelectTree, type SourceFile,
} from './schema-usage'

const where = (op: Pick<DbOp, 'file' | 'line'>, line = op.line) => `${op.file}:${line}`

export type Checked = { problems: string[]; unchecked: string[] }

// ---------------------------------------------------------------------------------------------
// (a) tables, columns, payload keys, filters, embedded selects
// ---------------------------------------------------------------------------------------------

function relationship(schema: Schema, parent: string, child: string): number {
  const down = schema.tables.get(parent)?.fks.filter((fk) => fk.refTable === child).length ?? 0
  const up = schema.tables.get(child)?.fks.filter((fk) => fk.refTable === parent).length ?? 0
  return down + up
}

function checkSelectTree(schema: Schema, table: string, tree: SelectTree, at: string, problems: string[]): void {
  const columns = relationColumns(schema, table)
  if (!columns) { problems.push(`${at}: select on unknown table or view "${table}"`); return }
  for (const issue of tree.issues) problems.push(`${at}: cannot analyse select item "${issue}" on ${table}`)
  for (const column of tree.columns) {
    if (!columns.includes(column)) problems.push(`${at}: select names ${table}.${column}, which does not exist`)
  }
  for (const embed of tree.embeds) {
    const label = `${embed.alias ? `${embed.alias}:` : ''}${embed.table}`
    if (!schema.tables.has(embed.table)) { problems.push(`${at}: embedded "${label}" under ${table} is not a table`); continue }
    if (embed.hint) { problems.push(`${at}: embedded "${label}" uses a !hint, which this check cannot verify`); continue }
    const count = relationship(schema, table, embed.table)
    if (count === 0) problems.push(`${at}: embedded "${label}" under ${table}: no foreign key links ${table} and ${embed.table} in either direction`)
    else if (count > 1) problems.push(`${at}: embedded "${label}" under ${table}: ${count} foreign keys link them, PostgREST needs a !hint`)
    checkSelectTree(schema, embed.table, embed.select, at, problems)
  }
}

const literalValues = (expr: string): string[] | null => {
  const t = expr.trim()
  const single = stringLiteral(t)
  if (single !== null) return [single]
  if (t.startsWith('[') && t.endsWith(']')) {
    const items = trimmed(splitTop(t.slice(1, -1), ',')).map(stringLiteral)
    return items.every((item) => item !== null) ? (items as string[]) : null
  }
  return null
}

export function checkReferences(schema: Schema, ops: DbOp[]): Checked {
  const problems: string[] = []
  const unchecked: string[] = []
  for (const op of ops) {
    const at = where(op)
    const columns = relationColumns(schema, op.table)
    if (!columns) { problems.push(`${at}: .from('${op.table}') names a table or view that no migration creates`); continue }
    const table = schema.tables.get(op.table)
    const isView = !table
    const column = (name: string, call: string, callLine: number) => {
      if (!columns.includes(name)) problems.push(`${where(op, callLine)}: ${call} names ${op.table}.${name}, which does not exist`)
    }
    const valueProblem = (name: string, values: string[], callLine: number, what: string) => {
      const allowed = allowedValues(schema, op.table, name)
      if (!allowed) return
      for (const value of values) {
        if (!allowed.includes(value)) problems.push(`${where(op, callLine)}: ${what} ${op.table}.${name} = '${value}', not one of ${allowed.join(' | ')}`)
      }
    }

    for (const call of op.calls) {
      const a0 = call.args[0] ?? ''
      if (call.method === 'select') {
        const text = stringLiteral(a0)
        if (a0 === '') continue // `.select()` after a write returns all columns
        if (text === null) { unchecked.push(`${op.file}: select() argument is not a string literal (${a0.slice(0, 40)})`); continue }
        checkSelectTree(schema, op.table, parseSelect(text), where(op, call.line), problems)
      } else if (call.method === 'match') {
        if (a0.startsWith('{')) for (const entry of parseObjectText(a0).entries) column(entry.key, '.match()', call.line)
        else unchecked.push(`${op.file}: match() argument is not an object literal`)
      } else if (call.method === 'or') {
        unchecked.push(`${op.file}: or() filter string is not analysed`)
      } else if (COLUMN_METHODS.includes(call.method)) {
        const name = stringLiteral(a0)
        if (name === null) { unchecked.push(`${op.file}: ${call.method}() column is not a string literal (${a0.slice(0, 30)})`); continue }
        if (name.includes('.')) { unchecked.push(`${op.file}: ${call.method}() column "${name}" is a path`); continue }
        column(name, `.${call.method}()`, call.line)
        if (['eq', 'neq'].includes(call.method)) {
          const values = literalValues(call.args[1] ?? '')
          if (values) valueProblem(name, values, call.line, `.${call.method}() compares`)
        } else if (call.method === 'in') {
          const values = literalValues(call.args[1] ?? '')
          if (values) valueProblem(name, values, call.line, '.in() lists')
        } else if (call.method === 'is' && (call.args[1] ?? '').trim() === 'null' && table) {
          const c = table.columns.get(name)
          if (c?.notNull) problems.push(`${where(op, call.line)}: .is('${name}', null) on NOT NULL column ${op.table}.${name} can never match`)
        }
      }
      if (['insert', 'upsert', 'update', 'delete'].includes(call.method) && isView) {
        problems.push(`${where(op, call.line)}: ${call.method}() on view ${op.table}, which the migrations do not make writable`)
      }
    }

    if (isView) continue
    for (const { method, payload } of op.payloads) {
      for (const { key, value } of payload.entries) {
        const col = table.columns.get(key)
        if (!col) { problems.push(`${at}: ${method}() payload key "${key}" is not a column of ${op.table}`); continue }
        if (col.generated) problems.push(`${at}: ${method}() payload writes ${op.table}.${key}, which is GENERATED (${col.generated})`)
        const values = literalValues(value)
        if (values) valueProblem(key, values, op.line, `${method}() writes`)
      }
      if (method === 'insert' || method === 'upsert') {
        const missing = [...table.columns.values()]
          .filter((col) => col.notNull && !col.hasDefault && !col.generated && !payload.entries.some((entry) => entry.key === col.name))
          .map((col) => col.name)
        if (missing.length && payload.unresolvedSpreads.length === 0) {
          problems.push(`${at}: ${method}() payload omits NOT NULL column(s) without a default: ${missing.join(', ')}`)
        } else if (missing.length) {
          unchecked.push(`${op.file}: ${method}() on ${op.table} has an unresolved spread (${payload.unresolvedSpreads.join(', ')}); required columns not checked`)
        }
      }
    }
  }
  return { problems, unchecked }
}

// ---------------------------------------------------------------------------------------------
// (b) onConflict targets
// ---------------------------------------------------------------------------------------------

export type ConflictReport = Checked & { targets: string[] }

export function checkOnConflict(schema: Schema, ops: DbOp[]): ConflictReport {
  const problems: string[] = []
  const unchecked: string[] = []
  const targets: string[] = []
  for (const op of ops) {
    const upsertCalls = op.calls.filter((call) => call.method === 'upsert')
    if (upsertCalls.length === 0) continue
    const table = schema.tables.get(op.table)
    if (!table) continue // reported by checkReferences
    const usable = conflictTargets(schema, op.table)
    const payloadKeys = op.payloads.filter((p) => p.method === 'upsert').map((p) => p.payload)
    for (const call of upsertCalls) {
      const options = call.args[1]
      const at = where(op, call.line)
      let columns: string[]
      if (options === undefined) {
        const pk = table.keys.find((key) => key.kind === 'primary key')
        if (!pk) { problems.push(`${at}: upsert() without onConflict on ${op.table}, which has no primary key`); continue }
        columns = pk.columns
        targets.push(`${op.table}(${columns.join(',')}) [default primary key]`)
      } else {
        const m = /onConflict\s*:\s*(['"])([^'"]*)\1/.exec(options)
        if (!m) { unchecked.push(`${op.file}: upsert() options on ${op.table} have no literal onConflict`); continue }
        columns = trimmed(m[2].split(','))
        targets.push(`${op.table}(${columns.join(',')})`)
      }
      for (const column of columns) {
        if (!table.columns.has(column)) problems.push(`${at}: onConflict names ${op.table}.${column}, which does not exist`)
      }
      const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
      if (!usable.some((target) => sameSet(target, columns))) {
        // an expression entry such as coalesce(user_id, ...) stands for the table columns it mentions
        const columnsOf = (key: { columns: string[] }) => key.columns.flatMap((entry) => (table.columns.has(entry) ? [entry] : (entry.match(/\b\w+\b/g) ?? []).filter((word) => table.columns.has(word))))
        const partial = table.keys.filter((key) => (key.partialWhere !== null || key.hasExpression) && sameSet(columnsOf(key), columns))
        problems.push(
          `${at}: onConflict (${columns.join(', ')}) on ${op.table} matches no primary key, unique constraint or plain unique index`
          + `${partial.length ? ` (${partial.map((key) => key.name).join(', ')} is partial or an expression index, which PostgREST cannot target)` : ''}`
          + `; usable targets: ${usable.map((target) => `(${target.join(', ')})`).join(' ') || 'none'}`,
        )
      }
      for (const payload of payloadKeys) {
        const missing = columns.filter((column) => !payload.entries.some((entry) => entry.key === column))
        if (missing.length && payload.unresolvedSpreads.length === 0) problems.push(`${at}: upsert payload on ${op.table} omits conflict column(s) ${missing.join(', ')}`)
      }
    }
  }
  return { problems, unchecked, targets }
}

// ---------------------------------------------------------------------------------------------
// (d) rpc calls
// ---------------------------------------------------------------------------------------------

export function checkRpc(schema: Schema, rpcs: RpcCall[]): Checked {
  const problems: string[] = []
  const unchecked: string[] = []
  for (const rpc of rpcs) {
    const at = `${rpc.file}:${rpc.line}`
    const fn = schema.functions.get(rpc.fn)
    if (!fn) { problems.push(`${at}: .rpc('${rpc.fn}') calls a function that no migration creates`); continue }
    if (rpc.keys === null || rpc.unresolvedSpreads.length) {
      unchecked.push(`${rpc.file}: rpc('${rpc.fn}') arguments are not an object literal`)
      continue
    }
    const names = fn.args.map((arg) => arg.name)
    for (const key of rpc.keys) {
      if (!names.includes(key)) problems.push(`${at}: rpc('${rpc.fn}') passes "${key}", but the function takes (${names.join(', ')})`)
    }
    for (const arg of fn.args) {
      if (!arg.hasDefault && !rpc.keys.includes(arg.name)) problems.push(`${at}: rpc('${rpc.fn}') omits required argument "${arg.name}"`)
    }
  }
  return { problems, unchecked }
}

// ---------------------------------------------------------------------------------------------
// Single-row reads must filter on a unique key (otherwise PostgREST answers 406 / PGRST116)
// ---------------------------------------------------------------------------------------------

export function checkSingleRowReads(schema: Schema, ops: DbOp[]): Checked & { checked: string[] } {
  const problems: string[] = []
  const unchecked: string[] = []
  const checked: string[] = []
  for (const op of ops) {
    const single = op.calls.find((call) => call.method === 'single' || call.method === 'maybeSingle')
    const writes = op.calls.some((call) => ['insert', 'upsert', 'update', 'delete'].includes(call.method))
    if (!single || writes) continue
    const eq = new Map<string, string>()
    for (const call of op.calls) {
      if (call.method !== 'eq') continue
      const name = stringLiteral(call.args[0] ?? '')
      if (name !== null) eq.set(name, (call.args[1] ?? '').trim())
    }
    const sets = uniqueSets(schema, op.table)
    const ok = sets.some((set) =>
      set.columns.every((column) => eq.has(column))
      && (set.where === null || (set.columns.length === 1 && set.where.trim() === set.columns[0] && eq.get(set.columns[0]) === 'true')))
    checked.push(`${op.table} by ${[...eq.keys()].join('+') || '(no filter)'}`)
    if (!ok) problems.push(`${where(op, single.line)}: ${single.method}() on ${op.table} filtered by [${[...eq.keys()].join(', ')}], which is not a unique key`)
  }
  return { problems, unchecked, checked }
}

// ---------------------------------------------------------------------------------------------
// (c) enums and limits shared with the application code
// ---------------------------------------------------------------------------------------------

export type ValueSet = { label: string; table: string; column: string; values: readonly string[] }

export type AppFacts = {
  /** Value lists in the application that must equal the database enum or CHECK list. */
  unions: ValueSet[]
  /** Values the application writes or seeds, which must be allowed by the database (a subset). */
  uses: ValueSet[]
  maxClipMs: number
  maxRunMs: number
  /** Whether an application schema accepts a highlight title of this length, one entry per schema. */
  titleSchemas: { label: string; accepts: (length: number) => boolean }[]
  /** Limits written as literals in components and server actions, read from source. */
  noteLimits: { label: string; max: number }[]
  /** Longest title buildHighlight produces for an over-long note, measured by calling it. */
  titleSliceMax: number
  /** Windows the application produces (clampWindow, buildHighlight), with a label. */
  windows: { label: string; start_ms: number; end_ms: number }[]
  /** Slugs the application generates or seeds. */
  slugs: string[]
  negativeStartRejected: { label: string; rejects: boolean }[]
}

const missingFrom = (a: readonly string[], b: readonly string[]) => a.filter((x) => !b.includes(x))
const sameValues = (name: string, app: readonly string[], db: readonly string[] | null): string[] => {
  if (!db) return [`${name}: no enum or CHECK constraint found in the migrations`]
  const onlyApp = missingFrom(app, db)
  const onlyDb = missingFrom(db, app)
  return onlyApp.length || onlyDb.length
    ? [`${name}: app has [${app.join(', ')}] but the database allows [${db.join(', ')}] (only in app: ${onlyApp.join(', ') || '-'}; only in database: ${onlyDb.join(', ') || '-'})`]
    : []
}

export function checkEnumsAndLimits(schema: Schema, facts: AppFacts): string[] {
  const problems: string[] = []
  for (const set of facts.unions) {
    problems.push(...sameValues(`${set.label} vs ${set.table}.${set.column}`, set.values, allowedValues(schema, set.table, set.column)))
  }
  for (const set of facts.uses) {
    const allowed = allowedValues(schema, set.table, set.column)
    if (!allowed) { problems.push(`${set.label}: ${set.table}.${set.column} has no enum or CHECK constraint`); continue }
    const bad = missingFrom(set.values, allowed)
    if (bad.length) problems.push(`${set.label} uses [${bad.join(', ')}], which ${set.table}.${set.column} does not allow (${allowed.join(' | ')})`)
  }

  // Rows are fully populated except for the field under test, so only that CHECK can decide.
  const highlight = (over: Record<string, unknown>) => ({ title: 'ok', note: null, start_ms: 0, end_ms: 1000, ...over })
  const share = (over: Record<string, unknown>) => ({ slug: 'demo-q4-clip', start_ms: 0, end_ms: 1000, ...over })
  const accepts = (tableName: string, row: Record<string, unknown>) => failingChecks(schema, tableName, row).length === 0
  for (const name of ['highlights', 'shares']) if (!schema.tables.has(name)) throw new Error(`migrations define no table ${name}`)

  // Highlight title length: every application schema must agree with the database at the boundary.
  const dbTitle = (n: number) => accepts('highlights', highlight({ title: 'x'.repeat(n) }))
  for (const schemaFact of facts.titleSchemas) {
    for (const n of [1, 40, 79, 80, 81, 82, 200]) {
      if (schemaFact.accepts(n) !== dbTitle(n)) {
        problems.push(`highlight title of ${n} characters: ${schemaFact.label} says ${schemaFact.accepts(n) ? 'ok' : 'too long'} but highlights CHECK says ${dbTitle(n) ? 'ok' : 'too long'}`)
      }
    }
  }
  if (!dbTitle(facts.titleSliceMax) || dbTitle(facts.titleSliceMax + 1)) {
    problems.push(`buildHighlight truncates titles to ${facts.titleSliceMax}, which is not the highlights CHECK limit`)
  }
  // Note length.
  const dbNote = (n: number) => accepts('highlights', highlight({ note: 'n'.repeat(n) }))
  if (!accepts('highlights', highlight({ note: null }))) problems.push('highlights CHECK rejects a NULL note')
  for (const limit of facts.noteLimits) {
    if (!dbNote(limit.max)) problems.push(`${limit.label} allows ${limit.max}-character notes, which highlights CHECK rejects`)
    if (dbNote(limit.max + 1)) problems.push(`${limit.label} stops at ${limit.max}, but highlights CHECK also accepts ${limit.max + 1}`)
  }
  // start_ms >= 0 and the five-minute window, on both tables that store ranges.
  for (const [name, make] of [['highlights', highlight], ['shares', share]] as const) {
    if (accepts(name, make({ start_ms: -1, end_ms: 1000 }))) problems.push(`${name}: a negative start_ms is accepted by the database`)
    if (!accepts(name, make({ start_ms: 0, end_ms: facts.maxClipMs }))) problems.push(`${name}: a window of MAX_CLIP_MS (${facts.maxClipMs} ms) is rejected by the database`)
    if (accepts(name, make({ start_ms: 0, end_ms: facts.maxClipMs + 1 }))) problems.push(`${name}: a window of MAX_CLIP_MS + 1 is accepted, so the database limit is looser than MAX_CLIP_MS`)
    if (accepts(name, make({ start_ms: 5000, end_ms: 5000 }))) problems.push(`${name}: an empty window (end = start) is accepted by the database`)
  }
  if (facts.maxRunMs !== facts.maxClipMs) problems.push(`MAX_RUN_MS (${facts.maxRunMs}) differs from MAX_CLIP_MS (${facts.maxClipMs})`)
  for (const w of facts.windows) {
    for (const name of ['highlights', 'shares'] as const) {
      const failed = failingChecks(schema, name, name === 'shares' ? share(w) : highlight(w))
      if (failed.length) problems.push(`${w.label} ${w.start_ms}..${w.end_ms} violates ${name} CHECK ${failed.join(', ')}`)
    }
  }
  for (const f of facts.negativeStartRejected) if (!f.rejects) problems.push(`${f.label} accepts a negative start_ms`)
  // Share slug format.
  for (const slug of facts.slugs) {
    if (!accepts('shares', share({ slug }))) problems.push(`slug "${slug}" violates the shares slug CHECK`)
  }
  for (const bad of ['Bad_slug', 'ab', '-abc', 'abc def', 'a'.repeat(65), '']) {
    if (accepts('shares', share({ slug: bad }))) problems.push(`the shares slug CHECK accepts "${bad.slice(0, 20)}", which the documented format forbids`)
  }
  return problems
}

/** ask_answers.scope: the column default must be a valid scope, and (separately) a CHECK should list the scopes. */
export function checkAskScope(schema: Schema, askScopes: readonly string[]): { defaultProblems: string[]; constraintProblems: string[] } {
  const column = schema.tables.get('ask_answers')?.columns.get('scope')
  if (!column) return { defaultProblems: ['ask_answers.scope does not exist'], constraintProblems: [] }
  const defaultValue = column.defaultExpr ? stringLiteral(column.defaultExpr) : null
  return {
    defaultProblems: defaultValue !== null && askScopes.includes(defaultValue)
      ? []
      : [`ask_answers.scope default ${column.defaultExpr ?? '(none)'} is not one of ${askScopes.join(' | ')}`],
    constraintProblems: sameValues('ASK_SCOPES vs ask_answers.scope', askScopes, allowedValues(schema, 'ask_answers', 'scope')),
  }
}

// ---------------------------------------------------------------------------------------------
// Row types in lib/types.ts and lib/clip.ts against the columns they describe
// ---------------------------------------------------------------------------------------------

export type RowTypeMapping = {
  type: string
  /** A table, view, or `rpc:function` whose result columns the type describes (the type's keys must be among them). */
  source: string
}

export function checkRowTypes(schema: Schema, sources: SourceFile[], mapping: RowTypeMapping[]): string[] {
  const problems: string[] = []
  for (const { type, source } of mapping) {
    const shape = typeShape(sources, type)
    if (!shape) { problems.push(`type ${type} was not found or is not a plain object type`); continue }
    let columns: string[] | null
    let nullable: Map<string, boolean> | null = null
    if (source.startsWith('rpc:')) {
      columns = schema.functions.get(source.slice(4))?.returnColumns ?? null
    } else {
      columns = relationColumns(schema, source)
      const table = schema.tables.get(source)
      if (table) nullable = new Map([...table.columns.values()].map((c) => [c.name, !c.notNull]))
    }
    if (!columns) { problems.push(`${type}: ${source} has no known columns`); continue }
    for (const [key, info] of shape) {
      if (!columns.includes(key)) { problems.push(`${type}.${key} is not a column of ${source}`); continue }
      const tsNullable = /\bnull\b/.test(info.type)
      const dbNullable = nullable?.get(key)
      if (dbNullable !== undefined && tsNullable !== dbNullable) {
        problems.push(`${type}.${key}: TypeScript says ${tsNullable ? 'nullable' : 'non-null'} but ${source}.${key} is ${dbNullable ? 'nullable' : 'NOT NULL'}`)
      }
    }
  }
  return problems
}

/** Keys of every `jsonb_build_object('k', v, ...)` call in a function body, in order of appearance. */
export function jsonObjectKeys(body: string): string[][] {
  const out: string[][] = []
  const re = /jsonb_build_object\s*\(/g
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let close = -1
    for (let i = open; i < body.length; i++) {
      if (body[i] === '\'') { i = body.indexOf('\'', i + 1); continue }
      if (body[i] === '(') depth++
      else if (body[i] === ')' && --depth === 0) { close = i; break }
    }
    if (close === -1) throw new Error('unbalanced jsonb_build_object call')
    const items = trimmed(splitTop(body.slice(open + 1, close), ',', { backslash: false }))
    out.push(items.filter((_, index) => index % 2 === 0).map((item) => stringLiteral(item) ?? item))
  }
  return out
}

export function checkClipShape(schema: Schema, sources: SourceFile[]): string[] {
  const fn = schema.functions.get('get_clip')
  if (!fn) return ['get_clip is not defined by the migrations']
  const calls = jsonObjectKeys(fn.body)
  if (calls.length < 2) return [`expected an outer and an inner jsonb_build_object in get_clip, found ${calls.length}`]
  const clip = typeShape(sources, 'Clip')
  if (!clip) return ['type Clip was not found']
  const problems: string[] = []
  const outer = calls[0]
  for (const key of clip.keys()) if (!outer.includes(key)) problems.push(`Clip.${key} is not returned by get_clip (returns ${outer.join(', ')})`)
  for (const key of outer) if (!clip.has(key)) problems.push(`get_clip returns "${key}", which type Clip does not declare`)
  const segmentsType = clip.get('segments')?.type ?? ''
  const literal = /^\{[\s\S]*\}(?=\[\]$)/.exec(segmentsType)?.[0]
  if (!literal) problems.push(`Clip.segments is not an inline object array type (${segmentsType.slice(0, 40)})`)
  else {
    const element = [...typeShapeOfLiteral(literal).keys()]
    const inner = calls[1]
    for (const key of element) if (!inner.includes(key)) problems.push(`Clip.segments[].${key} is not returned by get_clip (returns ${inner.join(', ')})`)
    for (const key of inner) if (!element.includes(key)) problems.push(`get_clip returns segments[].${key}, which type Clip does not declare`)
  }
  return problems
}

function typeShapeOfLiteral(literal: string): Map<string, unknown> {
  const body = literal.slice(1, literal.lastIndexOf('}'))
  return new Map(trimmed(splitTop(body, ';,\n', { angle: true })).map((entry) => [/^(\w+)/.exec(entry)?.[1] ?? entry, entry]))
}
