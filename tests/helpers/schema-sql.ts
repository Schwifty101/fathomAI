// Static model of supabase/migrations/*.sql, built with tolerant regexes (no SQL parser, no database).
// Migrations are applied in file-name order, so a later `alter table ... drop constraint` or
// `create or replace function` really replaces what an earlier file declared. The builder throws when it
// extracts nothing, and collects every statement it did not understand in `unrecognised`, so a
// migration that outgrows the regexes fails a test instead of passing vacuously.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeIndex, skipString, splitTop, stringLiteral, trimmed } from './schema-text'

export type MigrationFile = { name: string; sql: string }

export type Column = {
  name: string
  type: string
  notNull: boolean
  hasDefault: boolean
  /** Text of the DEFAULT expression, when it is a literal or a simple call. */
  defaultExpr: string | null
  generated: 'identity' | 'stored' | null
  references: { table: string; column: string } | null
}
export type Check = { table: string; name: string; expr: string; file: string }
export type Key = {
  table: string
  name: string
  columns: string[]
  kind: 'primary key' | 'unique constraint' | 'unique index'
  partialWhere: string | null
  hasExpression: boolean
  nullsNotDistinct: boolean
  file: string
}
export type ForeignKey = { table: string; columns: string[]; refTable: string; refColumns: string[] }
export type Table = {
  name: string
  columns: Map<string, Column>
  checks: Check[]
  keys: Key[]
  fks: ForeignKey[]
}
export type View = { name: string; columns: string[] }
export type FnArg = { name: string; type: string; hasDefault: boolean }
export type Fn = { name: string; args: FnArg[]; returns: string; returnColumns: string[] | null; attrs: string; body: string }
export type Schema = {
  files: string[]
  tables: Map<string, Table>
  views: Map<string, View>
  enums: Map<string, string[]>
  functions: Map<string, Fn>
  /** Non-unique and unique indexes by name, for completeness. */
  indexes: Map<string, { table: string; columns: string[]; unique: boolean }>
  /** Statements that matched no known form. A test requires this to be empty. */
  unrecognised: string[]
  /** How many `create table` statements the statement splitter saw, to cross-check the table parser. */
  createTableStatements: number
}

export function readMigrations(dir: string): MigrationFile[] {
  const names = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
  if (names.length === 0) throw new Error(`no .sql files found in ${dir}`)
  return names.map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
}

const ident = (raw: string) => raw.replace(/"/g, '').replace(/^public\./i, '').toLowerCase()

/** Comments removed, then split on `;` outside string literals and dollar-quoted bodies. */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const d = sql[i + 1]
    if (c === '-' && d === '-') {
      const j = sql.indexOf('\n', i)
      i = j === -1 ? sql.length : j
      continue
    }
    if (c === '/' && d === '*') {
      const j = sql.indexOf('*/', i + 2)
      if (j === -1) throw new Error('unterminated block comment in migration')
      current += ' '
      i = j + 2
      continue
    }
    if (c === '\'') {
      const j = skipString(sql, i, false)
      current += sql.slice(i, j)
      i = j
      continue
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64))
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length)
        if (end === -1) throw new Error(`unterminated dollar-quoted body ${m[0]}`)
        current += sql.slice(i, end + m[0].length)
        i = end + m[0].length
        continue
      }
    }
    if (c === ';') {
      if (current.trim()) out.push(current.trim())
      current = ''
      i++
      continue
    }
    current += c
    i++
  }
  if (current.trim()) out.push(current.trim())
  return out.map((statement) => statement.replace(/\s+/g, ' '))
}

const inner = (text: string, open: number) => text.slice(open + 1, closeIndex(text, open, { backslash: false }))
const SQL = { backslash: false } as const

function flatten(text: string): string {
  // Replace every parenthesised group with () so keyword tests ignore expressions inside them.
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      const j = closeIndex(text, i, SQL)
      out += '()'
      i = j
    } else out += text[i]
  }
  return out
}

function newTable(name: string): Table {
  return { name, columns: new Map(), checks: [], keys: [], fks: [] }
}

function addColumn(table: Table, part: string, file: string): void {
  const head = /^("?\w+"?)\s+(.*)$/s.exec(part)
  if (!head) throw new Error(`cannot read column definition in ${table.name}: ${part.slice(0, 60)}`)
  const name = ident(head[1])
  const rest = head[2]
  const typeMatch = /^((?:double\s+precision|character\s+varying|timestamp(?:tz)?(?:\s+with(?:out)?\s+time\s+zone)?|[\w.]+)(?:\s*\([\d\s,]+\))?(?:\s*\[\])?)/i.exec(rest)
  if (!typeMatch) throw new Error(`cannot read the type of ${table.name}.${name}: ${rest.slice(0, 60)}`)
  const type = typeMatch[1].trim().toLowerCase()
  const after = rest.slice(typeMatch[0].length)
  const flat = flatten(after)
  const primary = /\bprimary\s+key\b/i.test(flat)
  const identity = /\bgenerated\s+(?:always|by\s+default)\s+as\s+identity\b/i.test(flat)
  const stored = /\bgenerated\s+always\s+as\s*\(\)\s*stored\b/i.test(flat)
  const ref = /\breferences\s+([\w."]+)\s*\(\s*(\w+)\s*\)/i.exec(after)
  const column: Column = {
    name,
    type,
    notNull: /\bnot\s+null\b/i.test(flat) || primary,
    hasDefault: /\bdefault\b/i.test(flat) || identity || stored,
    defaultExpr: /\bdefault\s+('(?:[^']|'')*'|[\w.]+(?:\([^)]*\))?)/i.exec(after)?.[1] ?? null,
    generated: identity ? 'identity' : stored ? 'stored' : null,
    references: ref ? { table: ident(ref[1]), column: ident(ref[2]) } : null,
  }
  table.columns.set(name, column)
  if (ref) table.fks.push({ table: table.name, columns: [name], refTable: ident(ref[1]), refColumns: [ident(ref[2])] })
  if (primary) {
    table.keys.push({ table: table.name, name: `${table.name}_pkey`, columns: [name], kind: 'primary key', partialWhere: null, hasExpression: false, nullsNotDistinct: false, file })
  }
  if (/\bunique\b/i.test(flat)) {
    table.keys.push({ table: table.name, name: `${table.name}_${name}_key`, columns: [name], kind: 'unique constraint', partialWhere: null, hasExpression: false, nullsNotDistinct: /\bunique\s+nulls\s+not\s+distinct\b/i.test(flat), file })
  }
  let from = 0
  for (;;) {
    const at = after.slice(from).search(/\bcheck\s*\(/i)
    if (at === -1) break
    const open = from + at + after.slice(from + at).indexOf('(')
    table.checks.push({ table: table.name, name: `${table.name}_${name}_check`, expr: inner(after, open).trim(), file })
    from = closeIndex(after, open, SQL) + 1
  }
}

function addTableConstraint(table: Table, raw: string, file: string): boolean {
  let text = raw.trim()
  let name: string | null = null
  const named = /^constraint\s+(\w+)\s+(.*)$/is.exec(text)
  if (named) { name = ident(named[1]); text = named[2] }
  const cols = (open: number) => trimmed(splitTop(inner(text, open), ',', SQL)).map(ident)
  let m = /^primary\s+key\s*\(/i.exec(text)
  if (m) {
    const columns = cols(m[0].length - 1)
    for (const column of columns) { const c = table.columns.get(column); if (c) c.notNull = true }
    table.keys.push({ table: table.name, name: name ?? `${table.name}_pkey`, columns, kind: 'primary key', partialWhere: null, hasExpression: false, nullsNotDistinct: false, file })
    return true
  }
  m = /^unique\s*(nulls\s+not\s+distinct|nulls\s+distinct)?\s*\(/i.exec(text)
  if (m) {
    const columns = cols(m[0].length - 1)
    table.keys.push({ table: table.name, name: name ?? `${table.name}_${columns.join('_')}_key`, columns, kind: 'unique constraint', partialWhere: null, hasExpression: false, nullsNotDistinct: /not\s+distinct/i.test(m[1] ?? ''), file })
    return true
  }
  m = /^check\s*\(/i.exec(text)
  if (m) {
    table.checks.push({ table: table.name, name: name ?? `${table.name}_check`, expr: inner(text, m[0].length - 1).trim(), file })
    return true
  }
  m = /^foreign\s+key\s*\(([^)]*)\)\s*references\s+([\w."]+)\s*\(([^)]*)\)/i.exec(text)
  if (m) {
    table.fks.push({ table: table.name, columns: trimmed(m[1].split(',')).map(ident), refTable: ident(m[2]), refColumns: trimmed(m[3].split(',')).map(ident) })
    return true
  }
  return false
}

function parseView(statement: string): View | null {
  const m = /^create\s+(?:or\s+replace\s+)?view\s+([\w."]+)\s*(?:with\s*\([^)]*\)\s*)?as\s+/i.exec(statement)
  if (!m) return null
  const query = statement.slice(m[0].length)
  // The outermost select is the first one at bracket depth 0 (CTE bodies sit inside parentheses).
  let depth = 0
  let selectAt = -1
  let fromAt = -1
  for (let i = 0; i < query.length; i++) {
    const c = query[i]
    if (c === '\'') { i = skipString(query, i, false) - 1; continue }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0) {
      const word = /^(select|from)\b/i.exec(query.slice(i))
      const boundary = i === 0 || /[\s)]/.test(query[i - 1])
      if (word && boundary) {
        if (word[1].toLowerCase() === 'select' && selectAt === -1) selectAt = i + 6
        else if (word[1].toLowerCase() === 'from' && selectAt !== -1 && fromAt === -1) { fromAt = i; break }
      }
    }
  }
  if (selectAt === -1 || fromAt === -1) throw new Error(`cannot find the select list of view ${m[1]}`)
  const items = trimmed(splitTop(query.slice(selectAt, fromAt), ',', SQL))
  const columns = items.map((item) => {
    const alias = /\bas\s+("?\w+"?)\s*$/i.exec(item)
    if (alias) return ident(alias[1])
    const plain = /(?:^|\.)("?\w+"?)\s*$/.exec(item)
    if (!plain) throw new Error(`cannot name view column "${item}" in ${m[1]}`)
    return ident(plain[1])
  })
  return { name: ident(m[1]), columns }
}

function parseFunction(statement: string): Fn | null {
  const m = /^create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/i.exec(statement)
  if (!m) return null
  const open = m[0].length - 1
  const close = closeIndex(statement, open, SQL)
  const args = trimmed(splitTop(statement.slice(open + 1, close), ',', SQL)).map((arg): FnArg => {
    const a = /^(?:(?:in|out|inout|variadic)\s+)?(\w+)\s+(.+?)(?:\s+default\s+.+|\s*=\s*.+)?$/is.exec(arg)
    if (!a) throw new Error(`cannot read function argument "${arg}" of ${m[1]}`)
    return { name: ident(a[1]), type: a[2].trim().toLowerCase(), hasDefault: /\s(?:default\s|=\s)/i.test(` ${arg.slice(a[1].length)}`) }
  })
  const tail = statement.slice(close + 1)
  const returns = /^\s*returns\s+(table\s*\(|\w+(?:\s*\[\])?)/i.exec(tail)
  if (!returns) throw new Error(`cannot read the return type of ${m[1]}`)
  let returnColumns: string[] | null = null
  let returnType = returns[1].trim().toLowerCase()
  let afterReturns = tail.slice(returns[0].length)
  if (/^table\s*\($/i.test(returns[1].trim())) {
    const tableOpen = tail.indexOf('(', tail.search(/returns/i))
    returnColumns = trimmed(splitTop(inner(tail, tableOpen), ',', SQL)).map((col) => ident(col.split(/\s+/)[0]))
    returnType = 'table'
    afterReturns = tail.slice(closeIndex(tail, tableOpen, SQL) + 1)
  }
  const bodyMatch = /\$([A-Za-z_]\w*)?\$([\s\S]*)\$\1\$|\bas\s+'([\s\S]*)'/i.exec(afterReturns)
  return {
    name: ident(m[1]),
    args,
    returns: returnType,
    returnColumns,
    attrs: (bodyMatch ? afterReturns.slice(0, bodyMatch.index) : afterReturns).trim().toLowerCase(),
    body: bodyMatch ? (bodyMatch[2] ?? bodyMatch[3] ?? '') : '',
  }
}

const KNOWN_AND_IGNORED = [
  /^create\s+policy\b/i,
  /^grant\b/i,
  /^revoke\b/i,
  /^alter\s+default\s+privileges\b/i,
  /^create\s+extension\b/i,
  /^comment\s+on\b/i,
]

function removeConstraint(schema: Schema, tableName: string, name: string, ifExists: boolean): void {
  const table = schema.tables.get(tableName)
  if (!table) throw new Error(`alter table ${tableName}: unknown table`)
  const before = table.checks.length + table.keys.length + table.fks.length
  table.checks = table.checks.filter((c) => c.name !== name)
  table.keys = table.keys.filter((k) => k.name !== name)
  if (before === table.checks.length + table.keys.length + table.fks.length && !ifExists) {
    throw new Error(`migration drops constraint ${tableName}.${name}, which the parser never saw created (implicit names are ${tableName}_<column>_key / _check)`)
  }
}

export function buildSchema(files: MigrationFile[]): Schema {
  if (files.length === 0) throw new Error('buildSchema: no migration files')
  const schema: Schema = {
    files: files.map((file) => file.name),
    tables: new Map(), views: new Map(), enums: new Map(), functions: new Map(), indexes: new Map(),
    unrecognised: [], createTableStatements: 0,
  }
  for (const file of files) {
    for (const statement of splitStatements(file.sql)) {
      const head = statement.slice(0, 80)
      let m: RegExpExecArray | null

      if (/^create\s+table\b/i.test(statement)) {
        schema.createTableStatements++
        m = /^create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(/i.exec(statement)
        if (!m) throw new Error(`cannot read the table name in: ${head}`)
        const table = newTable(ident(m[1]))
        for (const part of trimmed(splitTop(inner(statement, m[0].length - 1), ',', SQL))) {
          if (/^(?:constraint\s+\w+\s+)?(?:primary\s+key|unique|check|foreign\s+key)\b/i.test(part)) {
            if (!addTableConstraint(table, part, file.name)) throw new Error(`cannot read table constraint in ${table.name}: ${part.slice(0, 60)}`)
          } else addColumn(table, part, file.name)
        }
        schema.tables.set(table.name, table)
      } else if ((m = /^create\s+type\s+(\w+)\s+as\s+enum\s*\(/i.exec(statement))) {
        const values = trimmed(splitTop(inner(statement, m[0].length - 1), ',', SQL)).map((v) => stringLiteral(v.replace(/"/g, '\'')))
        if (values.some((v) => v === null)) throw new Error(`cannot read enum values in: ${head}`)
        schema.enums.set(ident(m[1]), values as string[])
      } else if ((m = /^create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(?:only\s+)?([\w."]+)\s*(?:using\s+\w+\s*)?\(/i.exec(statement))) {
        const open = m[0].length - 1
        const items = trimmed(splitTop(inner(statement, open), ',', SQL))
        const plain = items.map((item) => /^("?\w+"?)(?:\s+(?:asc|desc))?(?:\s+nulls\s+(?:first|last))?$/i.exec(item))
        const columns = plain.map((p, i) => (p ? ident(p[1]) : items[i]))
        const where = /^\s*where\s+(.*)$/i.exec(statement.slice(closeIndex(statement, open, SQL) + 1))
        const tableName = ident(m[3])
        schema.indexes.set(ident(m[2]), { table: tableName, columns, unique: !!m[1] })
        if (m[1]) {
          const table = schema.tables.get(tableName)
          if (!table) throw new Error(`create unique index on unknown table ${tableName}`)
          table.keys.push({
            table: tableName, name: ident(m[2]), columns, kind: 'unique index',
            partialWhere: where ? where[1].trim() : null, hasExpression: plain.some((p) => p === null),
            nullsNotDistinct: false, file: file.name,
          })
        }
      } else if ((m = /^drop\s+index\s+(?:if\s+exists\s+)?(\w+)\s*$/i.exec(statement))) {
        const name = ident(m[1])
        let found = schema.indexes.delete(name)
        for (const table of schema.tables.values()) {
          const kept = table.keys.filter((k) => k.name !== name)
          if (kept.length !== table.keys.length) { table.keys = kept; found = true }
        }
        if (!found && !/if\s+exists/i.test(statement)) throw new Error(`migration drops index ${name}, which the parser never saw created`)
      } else if ((m = /^alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([\w."]+)\s+(.*)$/is.exec(statement))) {
        const tableName = ident(m[1])
        const table = schema.tables.get(tableName)
        if (!table) throw new Error(`alter table on unknown table ${tableName}`)
        for (const action of trimmed(splitTop(m[2], ',', SQL))) {
          let a: RegExpExecArray | null
          if ((a = /^add\s+(constraint\s+\w+\s+.*|(?:primary\s+key|unique|check|foreign\s+key)\b.*)$/is.exec(action))) {
            if (!addTableConstraint(table, a[1], file.name)) schema.unrecognised.push(`alter table ${tableName} ${action.slice(0, 60)}`)
          } else if ((a = /^drop\s+constraint\s+(if\s+exists\s+)?(\w+)\s*(?:cascade|restrict)?$/i.exec(action))) {
            removeConstraint(schema, tableName, ident(a[2]), !!a[1])
          } else if ((a = /^add\s+column\s+(?:if\s+not\s+exists\s+)?(.*)$/is.exec(action))) {
            addColumn(table, a[1], file.name)
          } else if ((a = /^drop\s+column\s+(?:if\s+exists\s+)?(\w+)/i.exec(action))) {
            table.columns.delete(ident(a[1]))
          } else if (!/^(?:enable|disable|force|no\s+force)\s+row\s+level\s+security$/i.test(action)) {
            schema.unrecognised.push(`alter table ${tableName} ${action.slice(0, 60)}`)
          }
        }
      } else if (/^create\s+(?:or\s+replace\s+)?view\b/i.test(statement)) {
        const view = parseView(statement)
        if (!view) throw new Error(`cannot read view: ${head}`)
        schema.views.set(view.name, view)
      } else if (/^create\s+(?:or\s+replace\s+)?function\b/i.test(statement)) {
        const fn = parseFunction(statement)
        if (!fn) throw new Error(`cannot read function: ${head}`)
        schema.functions.set(fn.name, fn)
      } else if ((m = /^drop\s+function\s+(?:if\s+exists\s+)?([\w."]+)/i.exec(statement))) {
        schema.functions.delete(ident(m[1]))
      } else if (!KNOWN_AND_IGNORED.some((re) => re.test(statement))) {
        schema.unrecognised.push(head)
      }
    }
  }
  if (schema.tables.size === 0) {
    throw new Error('migration parser extracted zero tables: the regexes no longer match the migrations')
  }
  return schema
}

export const loadSchema = (dir: string) => buildSchema(readMigrations(dir))

/** Columns of a table or view, or null when the relation is unknown. */
export function relationColumns(schema: Schema, name: string): string[] | null {
  const table = schema.tables.get(name)
  if (table) return [...table.columns.keys()]
  const view = schema.views.get(name)
  return view ? view.columns : null
}

/** Values a text column may hold, from its enum type or an `in (...)` CHECK; null when unconstrained. */
export function allowedValues(schema: Schema, tableName: string, column: string): string[] | null {
  const table = schema.tables.get(tableName)
  const col = table?.columns.get(column)
  if (!table || !col) return null
  const enumValues = schema.enums.get(col.type)
  if (enumValues) return enumValues
  for (const check of table.checks) {
    const m = new RegExp(`^\\s*\\(?\\s*${column}\\s+in\\s*\\(([^)]*)\\)\\s*\\)?\\s*$`, 'i').exec(check.expr)
    if (m) return trimmed(splitTop(m[1], ',', SQL)).map((v) => stringLiteral(v) ?? v)
  }
  return null
}

/** Column sets PostgREST can name in `onConflict`: primary key, unique constraints and plain unique indexes. */
export function conflictTargets(schema: Schema, tableName: string): string[][] {
  const table = schema.tables.get(tableName)
  if (!table) return []
  return table.keys
    .filter((key) => key.partialWhere === null && !key.hasExpression)
    .map((key) => key.columns)
}

/** Column sets that uniquely identify a row (a partial unique index only counts for its predicate). */
export function uniqueSets(schema: Schema, tableName: string): { columns: string[]; where: string | null }[] {
  const table = schema.tables.get(tableName)
  if (!table) return []
  return table.keys.filter((key) => !key.hasExpression).map((key) => ({ columns: key.columns, where: key.partialWhere }))
}

// ---------------------------------------------------------------------------------------------
// CHECK evaluation. A deliberately small SQL-to-JavaScript translator for the expressions the
// migrations use (comparisons, and/or, is [not] null, in (...), char_length, ~ regex). Anything else
// throws, so a new kind of CHECK is noticed instead of silently treated as true. Rows must be fully
// populated: the evaluator is two-valued, so nullable operands are only meaningful behind `is null`.
// ---------------------------------------------------------------------------------------------
const TOKEN = /\s+|'(?:[^']|'')*'|\d+(?:\.\d+)?|[A-Za-z_]\w*|<=|>=|<>|!=|::|[=<>~()+\-*/,]/y

export function compileCheck(schema: Schema, tableName: string, expr: string): (row: Record<string, unknown>) => boolean {
  const table = schema.tables.get(tableName)
  if (!table) throw new Error(`compileCheck: unknown table ${tableName}`)
  const tokens: string[] = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < expr.length) {
    const start = TOKEN.lastIndex
    const m = TOKEN.exec(expr)
    if (!m || m.index !== start) throw new Error(`cannot tokenise CHECK at "${expr.slice(start, start + 20)}" in ${tableName}: ${expr}`)
    if (!/^\s+$/.test(m[0])) tokens.push(m[0])
  }
  const out: string[] = []
  const operand = () => {
    const last = out.pop()
    if (last === undefined || !/^(?:row\.\w+|\(__len\(.*\)\))$/.test(last)) {
      throw new Error(`unsupported CHECK operand before an operator in ${tableName}: ${expr}`)
    }
    return last
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const word = t.toLowerCase()
    if (t === '::') throw new Error(`type casts are not supported in CHECK evaluation: ${expr}`)
    if (word === 'and') out.push('&&')
    else if (word === 'or') out.push('||')
    else if (word === 'not') throw new Error(`bare NOT is not supported in CHECK evaluation: ${expr}`)
    else if (word === 'is') {
      const negate = tokens[i + 1]?.toLowerCase() === 'not'
      if (tokens[i + (negate ? 2 : 1)]?.toLowerCase() !== 'null') throw new Error(`unsupported IS form in ${expr}`)
      out.push(`${operand()} ${negate ? '!=' : '=='} null`)
      i += negate ? 2 : 1
    } else if (word === 'in') {
      if (tokens[i + 1] !== '(') throw new Error(`unsupported IN form in ${expr}`)
      const list: string[] = []
      let j = i + 2
      for (; j < tokens.length && tokens[j] !== ')'; j++) if (tokens[j] !== ',') list.push(JSON.stringify(stringLiteral(tokens[j]) ?? Number(tokens[j])))
      out.push(`[${list.join(',')}].includes(${operand()})`)
      i = j
    } else if (word === 'char_length' || word === 'length') {
      if (tokens[i + 1] !== '(' || tokens[i + 3] !== ')') throw new Error(`unsupported ${word}() call in ${expr}`)
      const column = tokens[i + 2].toLowerCase()
      if (!table.columns.has(column)) throw new Error(`CHECK on ${tableName} names unknown column ${column}`)
      out.push(`(__len(row.${column}))`)
      i += 3
    } else if (t === '~') {
      const pattern = stringLiteral(tokens[i + 1] ?? '')
      if (pattern === null) throw new Error(`~ needs a string literal pattern in ${expr}`)
      out.push(`__re(${operand()}, ${JSON.stringify(pattern)})`)
      i += 1
    } else if (t === '=') out.push('===')
    else if (t === '<>' || t === '!=') out.push('!==')
    else if (t.startsWith('\'')) out.push(JSON.stringify(t.slice(1, -1).replace(/''/g, '\'')))
    else if (/^\d/.test(t) || '()+-*/<>'.includes(t) || t === '<=' || t === '>=') out.push(t)
    else if (word === 'true' || word === 'false') out.push(word)
    else if (/^[A-Za-z_]\w*$/.test(t)) {
      if (!table.columns.has(word)) throw new Error(`CHECK on ${tableName} names unknown column or function "${t}": ${expr}`)
      out.push(`row.${word}`)
    } else throw new Error(`unsupported token "${t}" in CHECK on ${tableName}: ${expr}`)
  }
  const body = out.join(' ')
  const len = (v: unknown) => {
    if (typeof v !== 'string') throw new Error(`char_length of a non-string in CHECK on ${tableName}: ${expr}`)
    return [...v].length
  }
  const re = (v: unknown, pattern: string) => {
    if (typeof v !== 'string') throw new Error(`~ on a non-string in CHECK on ${tableName}: ${expr}`)
    return new RegExp(pattern).test(v)
  }
  // The expression text is the repository's own migration SQL, restricted above to a fixed token set.
  const fn = new Function('row', '__len', '__re', `return Boolean(${body})`) as (row: Record<string, unknown>, lenOf: (v: unknown) => number, matches: (v: unknown, pattern: string) => boolean) => boolean
  return (row) => fn(row, len, re)
}

/** Evaluate every CHECK of a table against a fully populated row; returns the names of those that fail. */
export function failingChecks(schema: Schema, tableName: string, row: Record<string, unknown>): string[] {
  const table = schema.tables.get(tableName)
  if (!table) throw new Error(`failingChecks: unknown table ${tableName}`)
  return table.checks.filter((check) => !compileCheck(schema, tableName, check.expr)(row)).map((check) => check.name)
}
