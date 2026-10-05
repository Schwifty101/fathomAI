// Static schema conformance. No database and no network: supabase/migrations/*.sql are parsed into a model
// (tables, columns, nullability, CHECKs, unique keys, views, functions) and the application's query code is
// scanned (lib/, app/, seed/, scripts/, components/, middleware.ts). The tests then prove that what the code
// asks for exists, and that the enums and limits in lib/schema.ts agree with the CHECK constraints.
// The parser fails loudly when it extracts nothing, and the last describe block feeds every check a
// deliberately broken copy to prove it can fail. Helpers: tests/helpers/schema-*.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildSchema, compileCheck, failingChecks, loadSchema, readMigrations, splitStatements, uniqueSets, type Schema } from './helpers/schema-sql'
import { extractUsage, parseSelect, readSources, type SourceFile } from './helpers/schema-usage'
import {
  checkAskScope, checkClipShape, checkEnumsAndLimits, checkOnConflict, checkReferences, checkRowTypes, checkRpc,
  checkSingleRowReads, jsonObjectKeys, type AppFacts, type RowTypeMapping,
} from './helpers/schema-checks'
import { buildHighlight } from '@/lib/highlight'
import {
  ASK_SCOPES, askFileSchema, HIGHLIGHT_TYPES, highlightPicksSchema, highlightsFileSchema, MAX_CLIP_MS, MEETING_KINDS,
  PLATFORMS, summariesFileSchema, TEMPLATES, transcriptFileSchema,
} from '@/lib/schema'
import { clampWindow } from '@/lib/share'
import { newSlug } from '@/lib/slug'
import { MAX_RUN_MS } from '@/lib/speaker-runs'
import { MEETINGS } from '@/seed/meetings'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8')

const files = readMigrations(join(ROOT, 'supabase/migrations'))
const schema = buildSchema(files)
const sources = readSources(ROOT)
const usage = extractUsage(sources)

// The application sources the scanner is expected to have looked at (a floor, so an empty scan cannot pass).
const MUST_SCAN = [
  'lib/queries.ts', 'lib/ask-db.ts', 'lib/regenerate-db.ts', 'lib/clip.ts', 'app/meetings/[id]/actions.ts',
  'seed/load.ts', 'scripts/rls-test.ts', 'scripts/seed-clips.ts',
]
// Anything the scanner could not resolve must be listed here with a reason; today nothing is skipped.
const ACKNOWLEDGED_GAPS: string[] = []

// ---------------------------------------------------------------------------------------------
// Scratch helpers for the probes and for reading literals out of source
// ---------------------------------------------------------------------------------------------

type Edit = { from: string; to: string; file?: string }
/** The real migrations with deliberate edits. An edit whose text is not found fails the probe itself. */
function withEdits(edits: Edit[]): Schema {
  const edited = files.map((file) => ({ ...file }))
  for (const edit of edits) {
    const target = edited.find((file) => (!edit.file || file.name.includes(edit.file)) && file.sql.includes(edit.from))
    if (!target) throw new Error(`probe edit does not apply, text not found: ${edit.from}`)
    target.sql = target.sql.replace(edit.from, () => edit.to) // a function, so `$'` in the new text is not a replacement pattern
  }
  return buildSchema(edited)
}
const usageOf = (text: string) => extractUsage([{ file: 'probe.ts', text }])

const literalsIn = (text: string) => [...text.matchAll(/'([\w-]+)'/g)].map((m) => m[1])
function unionOf(relative: string, pattern: RegExp, label: string): string[] {
  const m = pattern.exec(read(relative))
  if (!m) throw new Error(`${label}: pattern not found in ${relative}, so its values cannot be compared`)
  const values = literalsIn(m[1])
  if (values.length === 0) throw new Error(`${label}: no values found in ${relative}`)
  return values
}
function numberIn(relative: string, pattern: RegExp, label: string): number {
  const m = pattern.exec(read(relative))
  if (!m) throw new Error(`${label}: pattern not found in ${relative}`)
  return Number(m[1])
}
const must = <T>(value: T | null | undefined, label: string): T => {
  if (value === null || value === undefined) throw new Error(`${label} unexpectedly returned nothing`)
  return value
}

// ---------------------------------------------------------------------------------------------
// Facts about the application, gathered from the real code (callable code is called, literals are read)
// ---------------------------------------------------------------------------------------------

const validHighlight = { segment_idx: 1, type: 'insight', title: 't', start_ms: 0, end_ms: 1000 }
const repeat = (length: number) => 'x'.repeat(length)
const run = (count: number, speaker: string) =>
  Array.from({ length: count }, (_, i) => ({ participant_id: speaker, start_ms: i * 10_000, end_ms: i * 10_000 + 9_900, text: 'one two three four five six seven eight nine ten' }))
const longRun = run(100, 'p1') // one 1000 second speaker run, far beyond the five minute cap
const alternating = Array.from({ length: 20 }, (_, i) => ({ ...run(1, i % 2 ? 'p1' : 'p2')[0], start_ms: i * 10_000, end_ms: i * 10_000 + 9_000 }))

const eventsBlock = /const EVENTS = \[([\s\S]*?)\n\]/.exec(read('seed/load.ts'))?.[1]
if (!eventsBlock) throw new Error('could not find the EVENTS list in seed/load.ts')
const eventPlatforms = [...eventsBlock.matchAll(/platform:\s*'(\w+)'/g)].map((m) => m[1])
const usedByCode = (table: string, column: string): string[] => {
  const values = new Set<string>()
  for (const op of usage.ops) {
    if (op.table !== table) continue
    for (const { payload } of op.payloads) for (const entry of payload.entries) if (entry.key === column) for (const v of literalsIn(entry.value)) values.add(v)
    for (const call of op.calls) if (call.method === 'eq' && call.args[0]?.replace(/['"]/g, '') === column) for (const v of literalsIn(call.args[1] ?? '')) values.add(v)
  }
  return [...values].sort()
}

const facts: AppFacts = {
  unions: [
    { label: 'HIGHLIGHT_TYPES', table: 'highlights', column: 'type', values: HIGHLIGHT_TYPES },
    { label: 'TEMPLATES', table: 'summaries', column: 'template', values: TEMPLATES },
    { label: 'MEETING_KINDS', table: 'meetings', column: 'kind', values: MEETING_KINDS },
    { label: 'PLATFORMS', table: 'meetings', column: 'platform', values: PLATFORMS },
    { label: 'PLATFORMS', table: 'calendar_events', column: 'platform', values: PLATFORMS },
    { label: 'type Platform (lib/types.ts)', table: 'meetings', column: 'platform', values: unionOf('lib/types.ts', /export type Platform = ((?:'\w+'\s*\|\s*)*'\w+')/, 'Platform') },
    { label: 'SummaryRow.source (lib/types.ts)', table: 'summaries', column: 'source', values: unionOf('lib/types.ts', /export type SummaryRow = \{[^}]*?source:\s*((?:'\w+'\s*\|\s*)*'\w+')/, 'SummaryRow.source') },
    { label: 'MeetingDef.kind (seed/meetings.ts)', table: 'meetings', column: 'kind', values: unionOf('seed/meetings.ts', /export type MeetingDef = \{[\s\S]*?\n\s*kind:\s*((?:'\w+'\s*\|\s*)*'\w+')/, 'MeetingDef.kind') },
    { label: 'MeetingDef.platform (seed/meetings.ts)', table: 'meetings', column: 'platform', values: unionOf('seed/meetings.ts', /export type MeetingDef = \{[\s\S]*?\n\s*platform:\s*((?:'\w+'\s*\|\s*)*'\w+')/, 'MeetingDef.platform') },
    // The two ai_usage kinds the code writes and reads are exactly the two the CHECK allows.
    { label: 'ai_usage kinds used by lib/ask-db.ts and lib/regenerate-db.ts', table: 'ai_usage', column: 'kind', values: usedByCode('ai_usage', 'kind') },
  ],
  uses: [
    { label: 'seed MEETINGS kinds', table: 'meetings', column: 'kind', values: [...new Set(MEETINGS.map((def) => def.kind))] },
    { label: 'seed MEETINGS platforms', table: 'meetings', column: 'platform', values: [...new Set(MEETINGS.map((def) => def.platform))] },
    { label: 'seed/load.ts calendar EVENTS platforms', table: 'calendar_events', column: 'platform', values: [...new Set(eventPlatforms)] },
    { label: 'summaries written by seed:load (summariesFileSchema keys)', table: 'summaries', column: 'template', values: Object.keys(summariesFileSchema.shape) },
  ],
  maxClipMs: MAX_CLIP_MS,
  maxRunMs: MAX_RUN_MS,
  titleSchemas: [
    {
      label: 'highlightPicksSchema (seed generation)',
      accepts: (length) => highlightPicksSchema(10).safeParse({ highlights: [1, 2, 3].map((n) => ({ segment_idx: n, type: 'insight', title: repeat(length) })) }).success,
    },
    {
      label: 'highlightsFileSchema (seed:check)',
      accepts: (length) => highlightsFileSchema.safeParse([{ ...validHighlight, title: repeat(length) }]).success,
    },
  ],
  noteLimits: [
    { label: 'createInput note in app/meetings/[id]/actions.ts', max: numberIn('app/meetings/[id]/actions.ts', /note:\s*z\.string\(\)\.max\((\d+)\)/, 'actions.ts note limit') },
    { label: 'note input maxLength in components/meeting/HighlightPanel.tsx', max: numberIn('components/meeting/HighlightPanel.tsx', /maxLength=\{(\d+)\}/, 'HighlightPanel maxLength') },
  ],
  titleSliceMax: must(buildHighlight(longRun, 0, 'insight', 'y'.repeat(500)), 'buildHighlight').title.length,
  windows: [
    ...([[0, 10_000_000, 10_000_000], [-50, 1000, 10_000], [1000, 301_000, 1_000_000], [250_000, 900_000, 1_000_000], [5, 6, 1_000_000]] as const).map(([start, end, duration]) => ({
      label: `clampWindow(${start}, ${end}, ${duration})`, ...must(clampWindow(start, end, duration), 'clampWindow'),
    })),
    ...[0, 1, 50, 99].map((index) => {
      const draft = must(buildHighlight(longRun, index, 'insight', 'note'), 'buildHighlight')
      return { label: `buildHighlight(100 s run, idx ${index})`, start_ms: draft.start_ms, end_ms: draft.end_ms }
    }),
    ...[3, 10].map((index) => {
      const draft = must(buildHighlight(alternating, index, 'feedback'), 'buildHighlight')
      return { label: `buildHighlight(alternating, idx ${index})`, start_ms: draft.start_ms, end_ms: draft.end_ms }
    }),
  ],
  slugs: [
    ...Array.from({ length: 500 }, () => newSlug()),
    ...unionOf('scripts/seed-clips.ts', /const slugs = \[([^\]]*)\]/, 'seed-clips slugs'),
  ],
  negativeStartRejected: [
    {
      label: 'highlightsFileSchema',
      rejects: highlightsFileSchema.safeParse([validHighlight]).success && !highlightsFileSchema.safeParse([{ ...validHighlight, start_ms: -1 }]).success,
    },
    {
      label: 'transcriptFileSchema',
      rejects: (() => {
        const base = { lines: [{ idx: 0, speaker: 'a', text: 't', start_ms: 0, end_ms: 5 }], chapters: [{ title: 'c', start_idx: 0 }], duration_ms: 10 }
        return transcriptFileSchema.safeParse(base).success
          && !transcriptFileSchema.safeParse({ ...base, lines: [{ ...base.lines[0], start_ms: -1 }] }).success
      })(),
    },
    { label: 'clampWindow (clamps to 0)', rejects: must(clampWindow(-50, 1000, 10_000), 'clampWindow').start_ms === 0 },
  ],
}

const ROW_TYPES: RowTypeMapping[] = [
  { type: 'MeetingRow', source: 'meetings' },
  { type: 'ParticipantRow', source: 'participants' },
  { type: 'SegmentRow', source: 'segments' },
  { type: 'ChapterRow', source: 'chapters' },
  { type: 'ActionItemRow', source: 'action_items' },
  { type: 'HighlightRow', source: 'highlights' },
  { type: 'SummaryRow', source: 'summaries' },
  { type: 'ShareRow', source: 'shares' },
  { type: 'AskAnswerRow', source: 'ask_answers' },
  { type: 'UpcomingEvent', source: 'calendar_upcoming' },
  { type: 'TeamStatRow', source: 'team_stats' },
  { type: 'SearchHit', source: 'rpc:search_segments' },
]

// ---------------------------------------------------------------------------------------------
// The migration model
// ---------------------------------------------------------------------------------------------

describe('schema conformance: migration model', () => {
  it('reads every migration file in order', () => {
    expect(schema.files).toEqual([...schema.files].sort())
    expect(schema.files.length).toBeGreaterThanOrEqual(2)
    expect(schema.files[0]).toMatch(/init\.sql$/)
    expect(schema.files[1]).toMatch(/hardening\.sql$/)
  })

  it('extracts the tables, views, functions and enum, and understands every statement', () => {
    expect([...schema.tables.keys()].sort()).toEqual([
      'action_items', 'ai_usage', 'ask_answers', 'calendar_events', 'chapters', 'highlights', 'meetings',
      'participants', 'segments', 'shares', 'summaries', 'team_members',
    ])
    expect([...schema.views.keys()].sort()).toEqual(['calendar_upcoming', 'team_stats'])
    expect([...schema.functions.keys()].sort()).toEqual(['get_clip', 'search_segments'])
    expect([...schema.enums.keys()]).toEqual(['highlight_type'])
    expect(schema.unrecognised).toEqual([]) // a statement the parser skipped would hide schema from every check below
  })

  it('finds every `create table` statement the files contain, not a subset', () => {
    const raw = files.map((file) => file.sql.replace(/--.*$/gm, '')).join('\n')
    const declared = [...raw.matchAll(/^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gim)].map((m) => m[1])
    expect(declared.length).toBeGreaterThanOrEqual(12)
    expect([...schema.tables.keys()].sort()).toEqual([...new Set(declared)].sort())
    expect(schema.createTableStatements).toBe(declared.length)
    for (const table of schema.tables.values()) expect(table.columns.size, `${table.name} has columns`).toBeGreaterThan(0)
  })

  it('fails loudly instead of passing vacuously when nothing parses', () => {
    expect(() => buildSchema([{ name: 'empty.sql', sql: '-- nothing to see\nselect 1;' }])).toThrow(/zero tables/)
    expect(() => buildSchema([])).toThrow(/no migration files/)
    expect(() => buildSchema(files.map((file) => ({ ...file, sql: file.sql.replace(/create table/gi, 'create relation') })))).toThrow()
  })

  it('is tolerant of case, quoting, schema prefixes and semicolons inside dollar-quoted bodies', () => {
    const parsed = buildSchema([{
      name: 'sample.sql',
      sql: `CREATE TABLE IF NOT EXISTS "public"."Widgets" (
        ID uuid PRIMARY KEY, Label text NOT NULL DEFAULT 'a;b', Qty int CHECK (qty > 0), UNIQUE (label, qty)
      );
      create function f(a int default 1) returns int language plpgsql as $body$ begin return a; end; $body$;`,
    }])
    const widgets = must(parsed.tables.get('widgets'), 'widgets table')
    expect([...widgets.columns.keys()]).toEqual(['id', 'label', 'qty'])
    expect(widgets.columns.get('label')).toMatchObject({ notNull: true, hasDefault: true })
    expect(widgets.checks.map((c) => c.expr)).toEqual(['qty > 0'])
    expect(widgets.keys.map((k) => k.columns)).toEqual([['id'], ['label', 'qty']])
    expect(must(parsed.functions.get('f'), 'f').args).toEqual([{ name: 'a', type: 'int', hasDefault: true }])
    expect(splitStatements("select 'a;b'; select 2; -- c;\n select 3")).toEqual(["select 'a;b'", 'select 2', 'select 3'])
  })

  it('applies migrations in order: the hardening migration replaces what init declared', () => {
    const initOnly = buildSchema([files[0]])
    const unique = (s: Schema, table: string) => uniqueSets(s, table).map((set) => set.columns.join(','))
    // init: prompt alone is unique, and summaries are protected only by an expression index
    expect(unique(initOnly, 'ask_answers')).toContain('prompt')
    expect(initOnly.tables.get('summaries')?.keys.some((k) => k.hasExpression)).toBe(true)
    // after hardening: unique per (scope, prompt) only, and a real constraint that treats NULL user_id as equal
    expect(unique(schema, 'ask_answers')).toContain('scope,prompt')
    expect(unique(schema, 'ask_answers')).not.toContain('prompt')
    const summaries = must(schema.tables.get('summaries'), 'summaries')
    expect(summaries.keys.filter((k) => k.kind !== 'primary key')).toEqual([
      expect.objectContaining({ kind: 'unique constraint', columns: ['meeting_id', 'template', 'user_id'], nullsNotDistinct: true, hasExpression: false }),
    ])
  })

  it('models nullability, defaults, generated columns and keys', () => {
    const column = (table: string, name: string) => must(schema.tables.get(table)?.columns.get(name), `${table}.${name}`)
    expect(column('summaries', 'id')).toMatchObject({ notNull: true, hasDefault: false }) // callers must supply it
    expect(column('highlights', 'id')).toMatchObject({ notNull: true, hasDefault: true })
    expect(column('ai_usage', 'id')).toMatchObject({ generated: 'identity' })
    expect(column('segments', 'tsv')).toMatchObject({ generated: 'stored' })
    expect(column('highlights', 'note').notNull).toBe(false)
    expect(column('highlights', 'user_id').notNull).toBe(false)
    expect(column('summaries', 'user_id').notNull).toBe(false)
    expect(column('action_items', 'due').notNull).toBe(false)
    expect(column('participants', 'talk_time_sec')).toMatchObject({ notNull: true, hasDefault: true })
    expect(column('ask_answers', 'scope').defaultExpr).toBe("'my_calls'")
    expect(uniqueSets(schema, 'shares')).toEqual([{ columns: ['slug'], where: null }])
    expect(uniqueSets(schema, 'meetings')).toContainEqual({ columns: ['slug'], where: null })
    expect(uniqueSets(schema, 'participants')).toContainEqual({ columns: ['meeting_id', 'name'], where: null })
    expect(uniqueSets(schema, 'segments')).toContainEqual({ columns: ['meeting_id', 'idx'], where: null })
    expect(uniqueSets(schema, 'team_members')).toContainEqual({ columns: ['is_demo_user'], where: 'is_demo_user' })
  })

  it('models views and functions, including argument names and defaults', () => {
    expect(schema.views.get('team_stats')?.columns).toEqual(['member_id', 'name', 'role', 'calls', 'talk_sec', 'talk_pct', 'questions', 'longest_monologue_sec'])
    expect(schema.views.get('calendar_upcoming')?.columns).toEqual(['id', 'title', 'platform', 'starts_at'])
    const search = must(schema.functions.get('search_segments'), 'search_segments')
    expect(search.args).toEqual([
      { name: 'q', type: 'text', hasDefault: false },
      { name: 'scope_host', type: 'uuid', hasDefault: true },
      { name: 'scope_meeting', type: 'uuid', hasDefault: true },
      { name: 'max_rows', type: 'int', hasDefault: true },
    ])
    expect(search.returnColumns).toEqual(['meeting_id', 'meeting_slug', 'meeting_title', 'segment_idx', 'start_ms', 'speaker', 'snippet', 'rank'])
    expect(search.attrs).toContain('search_path = public, pg_temp') // the hardening definition, not init's
    const clip = must(schema.functions.get('get_clip'), 'get_clip')
    expect(clip.args).toEqual([{ name: 'p_slug', type: 'text', hasDefault: false }])
    expect(clip.returns).toBe('jsonb')
  })

  it('evaluates CHECK expressions and refuses forms it does not understand', () => {
    const highlight = { title: 'ok', note: null, start_ms: 0, end_ms: 1000 }
    expect(failingChecks(schema, 'highlights', highlight)).toEqual([])
    expect(failingChecks(schema, 'highlights', { ...highlight, title: repeat(81) })).toEqual(['highlights_title_len'])
    expect(failingChecks(schema, 'highlights', { ...highlight, note: repeat(281) })).toEqual(['highlights_note_len'])
    expect(failingChecks(schema, 'highlights', { ...highlight, start_ms: -1 })).toEqual(['highlights_start_nonneg'])
    expect(failingChecks(schema, 'highlights', { ...highlight, end_ms: 300_001 })).toEqual(['highlights_check'])
    expect(failingChecks(schema, 'shares', { slug: 'Bad_Slug', start_ms: 0, end_ms: 1 })).toEqual(['shares_slug_format'])
    expect(failingChecks(schema, 'meetings', { kind: 'webinar', platform: 'zoom', duration_sec: 1 })).toEqual(['meetings_kind_check'])
    expect(() => compileCheck(schema, 'highlights', 'start_ms::text = 1')).toThrow(/cast/)
    expect(() => compileCheck(schema, 'highlights', 'not (start_ms > 1)')).toThrow(/NOT/)
    expect(() => compileCheck(schema, 'highlights', 'lower(title) = title')).toThrow(/unknown column or function/)
    expect(() => compileCheck(schema, 'highlights', 'nope > 1')).toThrow(/unknown column/)
  })
})

// ---------------------------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------------------------

describe('schema conformance: the scanner sees the code', () => {
  it('looks at the files that talk to Supabase, and finds enough calls that an empty scan cannot pass', () => {
    const scanned = new Set(sources.map((source) => source.file))
    for (const file of MUST_SCAN) expect(scanned.has(file), `${file} was scanned`).toBe(true)
    expect(sources.length).toBeGreaterThan(50)
    expect(usage.ops.length).toBeGreaterThanOrEqual(100)
    const tables = new Set(usage.ops.map((op) => op.table))
    for (const relation of [...schema.tables.keys(), 'team_stats', 'calendar_upcoming']) {
      expect(tables.has(relation), `some code reads or writes ${relation}`).toBe(true)
    }
    expect(new Set(usage.rpcs.map((rpc) => rpc.fn))).toEqual(new Set(['search_segments', 'get_clip']))
    expect(usage.ops.some((op) => op.calls.some((call) => call.method === 'upsert'))).toBe(true)
    expect(usage.ops.flatMap((op) => op.payloads).length).toBeGreaterThan(40)
  })

  it('resolves table names passed through helpers and loops (seed loader, rls test)', () => {
    const via = (file: string) => usage.ops.filter((op) => op.file === file && op.via !== 'literal').map((op) => `${op.via}:${op.table}`)
    expect(via('seed/load.ts')).toEqual(expect.arrayContaining(['helper upsert():meetings', 'helper upsert():calendar_events', 'helper clearSeeded():highlights', 'for-of table:chapters']))
    expect(via('scripts/rls-test.ts')).toEqual(expect.arrayContaining(['helper snap():summaries', 'helper snap():shares']))
    // the .is('user_id', null) clear is guarded by `seededOnly`, so only the two call sites that pass true get it
    const withUserFilter = usage.ops.filter((op) => op.via === 'helper clearSeeded()' && op.calls.some((call) => call.method === 'is')).map((op) => op.table)
    expect(withUserFilter.sort()).toEqual(['highlights', 'summaries'])
  })

  it('resolves payload spreads and helper objects instead of guessing', () => {
    const payloadKeys = (file: string, table: string, method: string) =>
      usage.ops.filter((op) => op.file === file && op.table === table).flatMap((op) => op.payloads).filter((p) => p.method === method).map((p) => p.payload.entries.map((e) => e.key).sort().join(','))
    // ...draft (HighlightDraft) and ...window (clampWindow) in app/meetings/[id]/actions.ts
    expect(payloadKeys('app/meetings/[id]/actions.ts', 'highlights', 'insert')).toEqual(['end_ms,meeting_id,note,start_ms,title,type,user_id'])
    expect(payloadKeys('app/meetings/[id]/actions.ts', 'shares', 'insert')).toEqual(['created_by,end_ms,meeting_id,slug,start_ms'])
    // ...event (an element of the EVENTS array) in seed/load.ts
    expect(payloadKeys('seed/load.ts', 'calendar_events', 'upsert')).toEqual(['day_offset,id,platform,time_of_day,title'])
    for (const op of usage.ops) for (const { payload } of op.payloads) {
      // only the rls test's deliberately open-ended `extra` argument may stay unresolved
      if (payload.unresolvedSpreads.length) expect({ file: op.file, spreads: payload.unresolvedSpreads }).toEqual({ file: 'scripts/rls-test.ts', spreads: ['extra'] })
    }
  })

  it('ignores calls inside comments, strings and non-Supabase `.from`', () => {
    const probe = usageOf([
      "// db.from('ghost_comment').select('x')",
      "const s = \"db.from('ghost_string').select('x')\"",
      'const a = Array.from({ length: 3 }, (_, i) => i)',
      "const b = Buffer.from('abc', 'hex')",
      "const r = /'/.test(x) ? db.from('real').select('id') : null",
    ].join('\n'))
    expect(probe.ops.map((op) => op.table)).toEqual(['real'])
    expect(probe.skips).toEqual([])
  })

  it('has nothing it could not resolve (any new gap must be acknowledged on purpose)', () => {
    const gaps = [
      ...usage.skips.map((skip) => `${skip.file}: ${skip.reason}`),
      ...checkReferences(schema, usage.ops).unchecked,
      ...checkOnConflict(schema, usage.ops).unchecked,
      ...checkRpc(schema, usage.rpcs).unchecked,
    ]
    expect(gaps.filter((gap) => !ACKNOWLEDGED_GAPS.includes(gap))).toEqual([])
    expect(usage.unknownMethods).toEqual([]) // an unfamiliar builder method could be a filter on a column nobody checked
  })
})

// ---------------------------------------------------------------------------------------------
// (a) tables, columns, embedded selects, payload keys
// ---------------------------------------------------------------------------------------------

describe('schema conformance (a): queries name real tables and columns', () => {
  it('every .from(), .select(), filter, order, payload key and literal value exists in the migrations', () => {
    expect(checkReferences(schema, usage.ops).problems).toEqual([])
  })

  it('resolves embedded selects from foreign keys', () => {
    const embeds = new Set<string>()
    for (const op of usage.ops) for (const call of op.calls) {
      if (call.method !== 'select') continue
      const text = call.args[0]?.replace(/^(['"`])([\s\S]*)\1$/, '$2') ?? ''
      for (const embed of parseSelect(text).embeds) embeds.add(`${op.table} > ${embed.alias ? `${embed.alias}:` : ''}${embed.table}`)
    }
    // lib/queries.ts: '*, host:team_members(name, role), participants(name, is_internal)'
    expect([...embeds]).toEqual(expect.arrayContaining(['meetings > host:team_members', 'meetings > participants']))
    expect(schema.tables.get('meetings')?.fks.map((fk) => `${fk.columns}->${fk.refTable}`)).toContain('host_id->team_members')
    expect(schema.tables.get('participants')?.fks.map((fk) => `${fk.columns}->${fk.refTable}`)).toContain('meeting_id->meetings')
  })

  it('every insert and upsert supplies each NOT NULL column that has no default', () => {
    // summaries.id has no default, so a missing id would only show up at runtime against a real database
    const inserts = usage.ops.flatMap((op) => op.payloads.filter((p) => p.method !== 'update').map((p) => ({ op, p })))
    expect(inserts.length).toBeGreaterThan(30)
    const summaryWrites = inserts.filter(({ op }) => op.table === 'summaries')
    expect(summaryWrites.length).toBeGreaterThanOrEqual(4)
    for (const { p } of summaryWrites) {
      if (!p.payload.unresolvedSpreads.length) expect(p.payload.entries.map((e) => e.key)).toContain('id')
    }
    expect(checkReferences(schema, usage.ops).problems.filter((problem) => problem.includes('omits NOT NULL'))).toEqual([])
  })

  it('values written to or compared with constrained columns are allowed by the database', () => {
    expect(usedByCode('ai_usage', 'kind')).toEqual(['ask', 'regenerate'])
    expect(usedByCode('summaries', 'source')).toEqual(['live', 'seed'])
    expect(usedByCode('summaries', 'template')).toEqual(expect.arrayContaining(['general']))
    expect(checkReferences(schema, usage.ops).problems.filter((problem) => problem.includes('not one of'))).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// (b) onConflict
// ---------------------------------------------------------------------------------------------

describe('schema conformance (b): onConflict targets match a unique key', () => {
  const report = checkOnConflict(schema, usage.ops)

  it('every upsert targets a primary key, unique constraint or plain unique index, with the columns in its payload', () => {
    expect(report.problems).toEqual([])
    expect(report.unchecked).toEqual([])
  })

  it('covers the targets the ledger names', () => {
    expect(report.targets).toContain('summaries(meeting_id,template,user_id)') // lib/regenerate-db.ts
    expect(report.targets).toContain('shares(slug)') // scripts/seed-clips.ts
    expect(report.targets).toContain('ask_answers(id)') // seed/load.ts
    expect(report.targets.length).toBeGreaterThanOrEqual(12)
  })

  it('summaries and ask_answers keep the constraints the code and ledger rely on', () => {
    const summaries = must(schema.tables.get('summaries'), 'summaries').keys.find((key) => key.kind === 'unique constraint')
    expect(summaries).toMatchObject({ columns: ['meeting_id', 'template', 'user_id'], nullsNotDistinct: true })
    const ask = uniqueSets(schema, 'ask_answers').map((set) => set.columns.join(','))
    expect(ask).toContain('scope,prompt') // the (scope, prompt) uniqueness the seed ids and rls:test depend on
    expect(ask).not.toContain('prompt')
  })
})

// ---------------------------------------------------------------------------------------------
// (c) enums and limits
// ---------------------------------------------------------------------------------------------

describe('schema conformance (c): enums and limits agree with the CHECK constraints', () => {
  it('lib/schema.ts, lib/types.ts and the seed definitions agree with the enum and CHECK lists, and the limits match', () => {
    expect(checkEnumsAndLimits(schema, facts)).toEqual([])
  })

  it('compares the enums that exist today (guards against an empty fact list)', () => {
    expect(facts.unions.map((u) => `${u.table}.${u.column}`)).toEqual(expect.arrayContaining([
      'highlights.type', 'summaries.template', 'meetings.kind', 'meetings.platform', 'calendar_events.platform', 'summaries.source', 'ai_usage.kind',
    ]))
    expect(facts.unions.every((u) => u.values.length >= 2)).toBe(true)
    expect(facts.windows.length).toBeGreaterThanOrEqual(8)
    expect(facts.slugs.length).toBeGreaterThanOrEqual(500)
    expect(facts.titleSliceMax).toBe(80)
    expect(facts.noteLimits.map((n) => n.max)).toEqual([280, 280])
    expect(facts.maxClipMs).toBe(300_000)
    expect(facts.negativeStartRejected.every((n) => n.rejects)).toBe(true)
  })

  it('the share slug format accepts every slug the app generates and seeds', () => {
    const accepted = (slug: string) => failingChecks(schema, 'shares', { slug, start_ms: 0, end_ms: 1000 }).length === 0
    expect(facts.slugs.every(accepted)).toBe(true)
    // the alphabet in lib/slug.ts leaves out look-alikes; every character it can emit passes the CHECK on its own
    for (const slug of new Set(facts.slugs.filter((s) => s.length === 10).flatMap((s) => s.split('')))) expect(accepted(`${slug}ab`)).toBe(true)
    expect(accepted('Upper')).toBe(false)
    expect(accepted('has_underscore')).toBe(false)
    expect(accepted('ab')).toBe(false)
  })

  it('ask_answers.scope defaults to a valid scope', () => {
    expect(checkAskScope(schema, ASK_SCOPES).defaultProblems).toEqual([])
  })

  it('ask scopes in the application are the ones ASK_SCOPES lists', () => {
    const used = new Set<string>()
    for (const source of sources) for (const m of source.text.matchAll(/\.scope\s*===\s*'(\w+)'/g)) used.add(m[1])
    expect([...used].sort()).toEqual(['my_calls', 'team_calls'])
    for (const scope of used) expect(ASK_SCOPES).toContain(scope)
    // with no CHECK in the database, the seed schema is the only gate on the value
    const answer = { prompt: 'p', text: 't', citations: [{ meeting_slug: 'm', segment_idx: 0, label: 'l' }] }
    expect(askFileSchema.safeParse([{ ...answer, scope: 'my_calls' }]).success).toBe(true)
    expect(askFileSchema.safeParse([{ ...answer, scope: 'meeting' }]).success).toBe(false)
  })

  // KNOWN GAP, not a code defect: the plan (line 439) declares ask_answers.scope as `text not null default 'my_calls'`
  // with no CHECK, so ASK_SCOPES is enforced only by askFileSchema and seed:check. This test states the stronger
  // invariant. It flips to a failure the day a migration adds the CHECK; then change `it.fails` to `it`.
  it.fails('ask_answers.scope has a CHECK listing exactly ASK_SCOPES (missing: ask_answers.scope is unconstrained in the database)', () => {
    expect(checkAskScope(schema, ASK_SCOPES).constraintProblems).toEqual([])
  })

  it('buildHighlight never cuts a title inside a surrogate pair', () => {
    const note = `${'a'.repeat(79)}\u{1F600}${'b'.repeat(10)}`
    const title = must(buildHighlight(run(3, 'p1'), 0, 'insight', note), 'buildHighlight').title
    expect(title.isWellFormed()).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
// (d) rpc
// ---------------------------------------------------------------------------------------------

describe('schema conformance (d): rpc calls name functions and arguments that exist', () => {
  it('every .rpc() calls a function the migrations create, with only its argument names and all required ones', () => {
    const rpc = checkRpc(schema, usage.rpcs)
    expect(rpc.problems).toEqual([])
    expect(rpc.unchecked).toEqual([])
  })

  it('sees the calls in lib/ and scripts/ with the argument names they use', () => {
    const calls = usage.rpcs.map((rpc) => `${rpc.file} ${rpc.fn}(${rpc.keys?.join(',')})`)
    expect(calls).toContain('lib/queries.ts search_segments(q,scope_host,scope_meeting,max_rows)')
    expect(calls).toContain('lib/clip.ts get_clip(p_slug)')
    expect(usage.rpcs.filter((rpc) => rpc.file === 'scripts/rls-test.ts').length).toBeGreaterThanOrEqual(8)
  })

  it('get_clip returns exactly the shape lib/clip.ts declares', () => {
    expect(checkClipShape(schema, sources)).toEqual([])
    expect(jsonObjectKeys(must(schema.functions.get('get_clip'), 'get_clip').body)).toEqual([
      ['slug', 'meeting_slug', 'title', 'start_ms', 'end_ms', 'segments'],
      ['idx', 'start_ms', 'end_ms', 'speaker', 'text'],
    ])
  })
})

// ---------------------------------------------------------------------------------------------
// Related invariants: single-row reads and row types
// ---------------------------------------------------------------------------------------------

describe('schema conformance: single-row reads and row types', () => {
  it('.single() and .maybeSingle() reads filter on a unique key', () => {
    const report = checkSingleRowReads(schema, usage.ops)
    expect(report.problems).toEqual([])
    expect(new Set(report.checked)).toEqual(new Set(['meetings by slug', 'team_members by is_demo_user']))
    expect(report.checked.length).toBeGreaterThanOrEqual(6)
  })

  it('the row types in lib/types.ts only name real columns, with matching nullability', () => {
    expect(checkRowTypes(schema, sources, ROW_TYPES)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// Probes: every check above is fed a deliberately broken copy and must complain
// ---------------------------------------------------------------------------------------------

describe('schema conformance: each check can fail', () => {
  it('(a) a renamed column is reported where the code uses it', () => {
    const renamed = withEdits([{ file: 'init', from: 'host_id uuid not null references team_members(id)', to: 'hostid uuid not null references team_members(id)' }])
    const problems = checkReferences(renamed, usage.ops).problems
    expect(problems.some((p) => p.includes('meetings.host_id') && p.includes('does not exist'))).toBe(true)
    expect(problems.some((p) => p.startsWith('lib/queries.ts') && p.includes('.eq()'))).toBe(true)
  })

  it('(a) a renamed or dropped column is reported in select lists, order(), and payloads too', () => {
    const renamed = withEdits([{ file: 'init', from: 'talk_time_sec int not null default 0', to: 'talk_secs int not null default 0' }])
    const problems = checkReferences(renamed, usage.ops).problems
    expect(problems.some((p) => p.includes('participants.talk_time_sec') && p.includes('select'))).toBe(true)
    expect(problems.some((p) => p.includes('participants.talk_time_sec') && p.includes('.order()'))).toBe(true)
    expect(problems.some((p) => p.includes('payload key "talk_time_sec"') && p.startsWith('seed/load.ts'))).toBe(true)
  })

  it('(a) a view column that goes away is reported', () => {
    const renamed = withEdits([{ file: 'hardening', from: 'as member_id,', to: 'as member,' }])
    expect(checkReferences(renamed, usage.ops).problems.some((p) => p.includes('team_stats.member_id'))).toBe(true)
  })

  it('(a) typos in table, column, filter, order and payload keys are reported', () => {
    const bad = usageOf([
      "db.from('meetingz').select('id')",
      "db.from('meetings').select('id,titel')",
      "db.from('meetings').select('id').eq('slugg', 'x')",
      "db.from('meetings').select('id').order('nope')",
      "db.from('meetings').select('id').in('hostid', [])",
      "db.from('highlights').insert({ meeting_id: m, user_id: u, type: 'insight', title: 't', start_ms: 0, end_ms: 1, colour: 'red' })",
      "db.from('highlights').update({ titel: 'x' }).eq('id', i)",
      "db.from('ai_usage').insert({ user_id: u, kind: 'regen' })",
      "db.from('ai_usage').insert({ id: 1, user_id: u, kind: 'ask' })",
      "db.from('summaries').upsert({ meeting_id: m, template: 'general', content: c, source: 'seed' }, { onConflict: 'id' })",
      "db.from('summaries').select('id').is('id', null)",
      "db.from('team_stats').insert({ member_id: 1 })",
    ].join('\n'))
    const problems = checkReferences(schema, bad.ops).problems.map((p) => p.replace(/^probe\.ts:\d+: /, ''))
    expect(problems).toEqual([
      ".from('meetingz') names a table or view that no migration creates",
      'select names meetings.titel, which does not exist',
      '.eq() names meetings.slugg, which does not exist',
      '.order() names meetings.nope, which does not exist',
      '.in() names meetings.hostid, which does not exist',
      'insert() payload key "colour" is not a column of highlights',
      'update() payload key "titel" is not a column of highlights',
      "insert() writes ai_usage.kind = 'regen', not one of regenerate | ask",
      'insert() payload writes ai_usage.id, which is GENERATED (identity)',
      'upsert() payload omits NOT NULL column(s) without a default: id', // summaries.id has no default
      ".is('id', null) on NOT NULL column summaries.id can never match",
      'insert() on view team_stats, which the migrations do not make writable',
    ])
  })

  it('(a)(b)(d) mistakes planted in the real source files are reported at their file and line', () => {
    const plant = (file: string, from: string, to: string): SourceFile[] => sources.map((source) => {
      if (source.file !== file) return source
      if (!source.text.includes(from)) throw new Error(`probe edit does not apply to ${file}: ${from}`)
      return { ...source, text: source.text.replace(from, () => to) }
    })
    const columns = extractUsage(plant('lib/queries.ts', "select('start_ms,title')", "select('start_ms,titel')"))
    expect(checkReferences(schema, columns.ops).problems).toEqual([expect.stringMatching(/^lib\/queries\.ts:\d+: select names chapters\.titel, which does not exist$/)])
    const conflict = extractUsage(plant('lib/regenerate-db.ts', "onConflict: 'meeting_id,template,user_id'", "onConflict: 'meeting_id,template'"))
    expect(checkOnConflict(schema, conflict.ops).problems).toEqual([expect.stringMatching(/^lib\/regenerate-db\.ts:\d+: onConflict \(meeting_id, template\) on summaries matches no primary key/)])
    const argument = extractUsage(plant('lib/clip.ts', '{ p_slug: slug }', '{ slug }'))
    expect(checkRpc(schema, argument.rpcs).problems).toEqual([
      expect.stringMatching(/^lib\/clip\.ts:\d+: rpc\('get_clip'\) passes "slug", but the function takes \(p_slug\)$/),
      expect.stringMatching(/^lib\/clip\.ts:\d+: rpc\('get_clip'\) omits required argument "p_slug"$/),
    ])
    const unsafe = extractUsage(plant('lib/queries.ts', ".eq('slug', slug).maybeSingle()", ".eq('title', slug).maybeSingle()"))
    expect(checkSingleRowReads(schema, unsafe.ops).problems).toEqual([expect.stringMatching(/^lib\/queries\.ts:\d+: maybeSingle\(\) on meetings filtered by \[title\], which is not a unique key$/)])
  })

  it('(a) an embedded select without a foreign key, or with two, is reported', () => {
    const none = checkReferences(schema, usageOf("db.from('chapters').select('start_ms, owner:team_members(name)')").ops).problems
    expect(none.join('\n')).toMatch(/no foreign key links chapters and team_members/)
    const missingColumn = checkReferences(schema, usageOf("db.from('meetings').select('*, host:team_members(name, nickname)')").ops).problems
    expect(missingColumn.join('\n')).toMatch(/team_members\.nickname, which does not exist/)
    const twoKeys = withEdits([{ file: 'init', from: 'member_id uuid references team_members(id),', to: 'member_id uuid references team_members(id), host_member uuid references team_members(id),' }])
    // participants now has two foreign keys to team_members: an embed between them needs a !hint
    const ambiguous = checkReferences(twoKeys, usageOf("db.from('participants').select('name, team_members(name)')").ops).problems
    expect(ambiguous.join('\n')).toMatch(/2 foreign keys link them/)
  })

  it('(a) the scanner follows helpers, loops, variables, spreads and local object helpers', () => {
    const probe = usageOf([
      'async function put(table: string, rows: object[]) { await db.from(table).upsert(rows, { onConflict: "id" }) }',
      "await put('meetings', [{ id: 1, slug: 's', nope: 2 }])",
      "for (const t of ['chapters', 'ghost']) { await db.from(t).select('*', { count: 'exact', head: true }) }",
      "let q = db.from('meetings').select('id'); if (cond) q = q.eq('slugg', 1)",
      "const draft = buildHighlight(); await db.from('highlights').insert({ meeting_id: m, ...draft })",
      "const row = (x) => ({ id: x, bogus: 1 }); await db.from('team_members').insert(row(1))",
      "export function buildHighlight(): { colour: string } | null { return null }",
    ].join('\n'))
    const problems = checkReferences(schema, probe.ops).problems.map((p) => p.replace(/^probe\.ts:\d+: /, ''))
    expect(problems).toEqual(expect.arrayContaining([
      'upsert() payload key "nope" is not a column of meetings',
      ".from('ghost') names a table or view that no migration creates",
      '.eq() names meetings.slugg, which does not exist',
      'insert() payload key "colour" is not a column of highlights',
      'insert() payload key "bogus" is not a column of team_members',
    ]))
  })

  it('(b) a missing hardening constraint or a mistyped target is reported', () => {
    const initOnly = buildSchema([files[0]])
    const asInit = checkOnConflict(initOnly, usage.ops).problems
    expect(asInit.some((p) => p.includes('summaries') && p.includes('meeting_id, template, user_id') && p.includes('expression index'))).toBe(true)
    const loosened = withEdits([{ file: 'hardening', from: 'unique nulls not distinct (meeting_id, template, user_id)', to: 'unique (meeting_id, template)' }])
    expect(checkOnConflict(loosened, usage.ops).problems.some((p) => p.includes('onConflict (meeting_id, template, user_id) on summaries'))).toBe(true)
    const typo = checkOnConflict(schema, usageOf([
      "db.from('summaries').upsert(r, { onConflict: 'meeting_id,template' })",
      "db.from('ask_answers').upsert({ id: i, prompt: p, scope: s, answer: a }, { onConflict: 'prompt' })",
      "db.from('shares').upsert({ slug: s, meeting_id: m, start_ms: 0, end_ms: 1, created_by: c }, { onConflict: 'meeting_id' })",
      "db.from('meetings').upsert({ id: i, slug: s, title: t, kind: 'sales', platform: 'zoom', started_at: a, duration_sec: 1, host_id: h }, { onConflict: 'nope' })",
      "db.from('team_members').upsert({ name: n, role: r, is_demo_user: false }, { onConflict: 'id' })",
      "db.from('team_members').upsert({ is_demo_user: true })",
    ].join('\n')).ops).problems
    expect(typo.join('\n')).toMatch(/onConflict \(meeting_id, template\) on summaries matches no primary key/)
    expect(typo.join('\n')).toMatch(/onConflict \(prompt\) on ask_answers matches no primary key/) // (scope, prompt) is the key
    expect(typo.join('\n')).toMatch(/onConflict \(meeting_id\) on shares matches/)
    expect(typo.join('\n')).toMatch(/onConflict names meetings\.nope/)
    expect(typo.join('\n')).toMatch(/omits conflict column\(s\) id/)
    expect(typo.length).toBeGreaterThanOrEqual(6)
    // the partial index on team_members can never be a PostgREST target
    const partial = checkOnConflict(schema, usageOf("db.from('team_members').upsert({ id: i, name: n, role: r, is_demo_user: true }, { onConflict: 'is_demo_user' })").ops).problems
    expect(partial.join('\n')).toMatch(/team_members_one_demo is partial or an expression index/)
  })

  it('(c) a changed enum, limit, window cap or slug format is reported', () => {
    const cases: { edit: Edit; expected: RegExp }[] = [
      { edit: { file: 'init', from: ",'tech_question'", to: '' }, expected: /HIGHLIGHT_TYPES vs highlights\.type.*only in app: tech_question/ },
      { edit: { file: 'init', from: ",'project_review'", to: ",'review'" }, expected: /TEMPLATES vs summaries\.template.*only in app: project_review/ },
      { edit: { file: 'init', from: "'design_review'", to: "'design'" }, expected: /MEETING_KINDS vs meetings\.kind/ },
      { edit: { file: 'init', from: "platform text not null check (platform in ('zoom','meet','teams')),\n  started_at", to: "platform text not null check (platform in ('zoom','meet')),\n  started_at" }, expected: /PLATFORMS vs meetings\.platform.*only in app: teams/ },
      { edit: { file: 'init', from: "platform text not null check (platform in ('zoom','meet','teams')),\n  day_offset", to: "platform text not null check (platform in ('zoom','meet')),\n  day_offset" }, expected: /PLATFORMS vs calendar_events\.platform.*only in app: teams/ },
      { edit: { file: 'init', from: "source text not null check (source in ('seed','live'))", to: "source text not null check (source in ('seed'))" }, expected: /SummaryRow\.source/ },
      { edit: { file: 'init', from: "kind text not null check (kind in ('regenerate','ask'))", to: "kind text not null check (kind in ('regenerate','ask','digest'))" }, expected: /ai_usage kinds.*only in database: digest/ },
      { edit: { file: 'hardening', from: 'char_length(title) <= 80', to: 'char_length(title) <= 100' }, expected: /highlight title of 81 characters/ },
      { edit: { file: 'hardening', from: 'char_length(title) <= 80', to: 'char_length(title) <= 60' }, expected: /highlight title of 79 characters/ },
      { edit: { file: 'hardening', from: 'char_length(note) <= 280', to: 'char_length(note) <= 300' }, expected: /stops at 280, but highlights CHECK also accepts 281/ },
      { edit: { file: 'hardening', from: 'char_length(note) <= 280', to: 'char_length(note) <= 200' }, expected: /allows 280-character notes, which highlights CHECK rejects/ },
      { edit: { file: 'hardening', from: 'start_ms >= 0),\n  add constraint highlights_title_len', to: 'start_ms >= -5),\n  add constraint highlights_title_len' }, expected: /highlights: a negative start_ms is accepted/ },
      { edit: { file: 'init', from: 'end_ms - start_ms <= 300000)\n);\n\ncreate table calendar_events', to: 'end_ms - start_ms <= 600000)\n);\n\ncreate table calendar_events' }, expected: /shares: a window of MAX_CLIP_MS \+ 1 is accepted/ },
      { edit: { file: 'hardening', from: '{2,63}', to: '{2,9}' }, expected: /slug "[a-z0-9-]+" violates the shares slug CHECK/ },
      { edit: { file: 'hardening', from: "'^[a-z0-9][a-z0-9-]{2,63}$'", to: "'^[A-Za-z0-9_-]{3,64}$'" }, expected: /slug CHECK accepts "Bad_slug"/ },
    ]
    for (const { edit, expected } of cases) {
      const problems = checkEnumsAndLimits(withEdits([edit]), facts)
      expect(problems.join('\n'), `edit ${edit.from.slice(0, 40)}`).toMatch(expected)
    }
    // the same check on the real schema is clean, so each failure above comes from its own edit
    expect(checkEnumsAndLimits(schema, facts)).toEqual([])
  })

  it('(c) an application limit or value that drifts from the database is reported', () => {
    const lax = { ...facts, titleSchemas: [{ label: 'a schema that allows 100', accepts: (n: number) => n <= 100 }] }
    expect(checkEnumsAndLimits(schema, lax).join('\n')).toMatch(/highlight title of 81 characters: a schema that allows 100 says ok but highlights CHECK says too long/)
    expect(checkEnumsAndLimits(schema, { ...facts, noteLimits: [{ label: 'a form', max: 500 }] }).join('\n')).toMatch(/a form allows 500-character notes/)
    expect(checkEnumsAndLimits(schema, { ...facts, titleSliceMax: 120 }).join('\n')).toMatch(/buildHighlight truncates titles to 120/)
    expect(checkEnumsAndLimits(schema, { ...facts, maxClipMs: 400_000 }).join('\n')).toMatch(/MAX_CLIP_MS/)
    expect(checkEnumsAndLimits(schema, { ...facts, maxRunMs: 120_000 }).join('\n')).toMatch(/MAX_RUN_MS \(120000\) differs/)
    expect(checkEnumsAndLimits(schema, { ...facts, windows: [{ label: 'a runaway window', start_ms: 0, end_ms: 900_000 }] }).join('\n')).toMatch(/a runaway window 0\.\.900000 violates highlights CHECK highlights_check/)
    expect(checkEnumsAndLimits(schema, { ...facts, windows: [{ label: 'a negative window', start_ms: -1, end_ms: 10 }] }).join('\n')).toMatch(/violates shares CHECK shares_start_nonneg/)
    expect(checkEnumsAndLimits(schema, { ...facts, slugs: ['UPPER'] }).join('\n')).toMatch(/slug "UPPER" violates/)
    expect(checkEnumsAndLimits(schema, { ...facts, negativeStartRejected: [{ label: 'a schema', rejects: false }] }).join('\n')).toMatch(/a schema accepts a negative start_ms/)
    expect(checkEnumsAndLimits(schema, { ...facts, uses: [{ label: 'a seed', table: 'meetings', column: 'platform', values: ['zoom', 'webex'] }] }).join('\n')).toMatch(/a seed uses \[webex\]/)
    expect(checkEnumsAndLimits(schema, { ...facts, unions: [{ label: 'a list', table: 'meetings', column: 'host_id', values: ['x'] }] }).join('\n')).toMatch(/no enum or CHECK constraint/)
  })

  it('(c) ask scope: a default outside ASK_SCOPES and an added CHECK are both detected', () => {
    expect(checkAskScope(schema, ['team_calls']).defaultProblems.join('\n')).toMatch(/default 'my_calls' is not one of team_calls/)
    const withCheck = withEdits([{ file: 'hardening', from: '-- 3. summaries', to: "alter table ask_answers add constraint ask_scope_check check (scope in ('my_calls','team_calls'));\n-- 3. summaries" }])
    expect(checkAskScope(withCheck, ASK_SCOPES).constraintProblems).toEqual([])
    expect(checkAskScope(schema, ASK_SCOPES).constraintProblems.join('\n')).toMatch(/no enum or CHECK constraint found/)
  })

  it('(d) a renamed or removed function argument, or a missing function, is reported', () => {
    const renamed = withEdits([{ file: 'hardening', from: 'scope_host uuid default null', to: 'host_scope uuid default null' }])
    const problems = checkRpc(renamed, usage.rpcs).problems
    expect(problems.some((p) => p.startsWith('lib/queries.ts') && p.includes('passes "scope_host"'))).toBe(true)
    expect(problems.some((p) => p.startsWith('scripts/rls-test.ts') && p.includes('passes "scope_host"'))).toBe(true)
    const required = withEdits([{ file: 'hardening', from: 'max_rows int default 30', to: 'max_rows int' }])
    expect(checkRpc(required, usage.rpcs).problems.some((p) => p.includes('omits required argument "max_rows"'))).toBe(true)
    const gone = withEdits([
      { file: 'init', from: 'create function get_clip(p_slug text)', to: 'create function get_clip_v2(p_slug text)' },
      { file: 'hardening', from: 'create or replace function get_clip(p_slug text)', to: 'create or replace function get_clip_v2(p_slug text)' },
    ])
    expect(checkRpc(gone, usage.rpcs).problems.some((p) => p.includes(".rpc('get_clip') calls a function that no migration creates"))).toBe(true)
    const wrong = checkRpc(schema, usageOf([
      "db.rpc('search_segments', { query: 'x' })",
      "db.rpc('search_segments', { q: 'x', max: 3 })",
      "db.rpc('search_segment', { q: 'x' })",
      "db.rpc('get_clip')",
    ].join('\n')).rpcs).problems.map((p) => p.replace(/^probe\.ts:\d+: /, ''))
    expect(wrong).toEqual([
      `rpc('search_segments') passes "query", but the function takes (q, scope_host, scope_meeting, max_rows)`,
      `rpc('search_segments') omits required argument "q"`,
      `rpc('search_segments') passes "max", but the function takes (q, scope_host, scope_meeting, max_rows)`,
      `.rpc('search_segment') calls a function that no migration creates`,
      `rpc('get_clip') omits required argument "p_slug"`,
    ])
  })

  it('(d) get_clip drifting from lib/clip.ts is reported', () => {
    const renamedKey = withEdits([{ file: 'hardening', from: "'speaker', p.name", to: "'who', p.name" }])
    const problems = checkClipShape(renamedKey, sources)
    expect(problems.join('\n')).toMatch(/Clip\.segments\[\]\.speaker is not returned/)
    expect(problems.join('\n')).toMatch(/get_clip returns segments\[\]\.who/)
  })

  it('single-row reads: dropping the unique key is reported', () => {
    const dropped = withEdits([{ file: 'init', from: 'slug text not null unique,', to: 'slug text not null,' }])
    const problems = checkSingleRowReads(dropped, usage.ops).problems
    expect(problems.some((p) => p.startsWith('lib/queries.ts') && p.includes('maybeSingle() on meetings filtered by [slug]'))).toBe(true)
    const demo = withEdits([{ file: 'init', from: 'create unique index team_members_one_demo on team_members (is_demo_user) where is_demo_user;', to: '' }])
    expect(checkSingleRowReads(demo, usage.ops).problems.some((p) => p.includes('team_members filtered by [is_demo_user]'))).toBe(true)
    const byOther = checkSingleRowReads(schema, usageOf("db.from('participants').select('id').eq('name', n).maybeSingle()").ops).problems
    expect(byOther.length).toBe(1)
  })

  it('row types: a missing column or a nullability mismatch is reported', () => {
    const renamed = withEdits([{ file: 'init', from: 'questions int not null default 0', to: 'question_count int not null default 0' }])
    expect(checkRowTypes(renamed, sources, ROW_TYPES).join('\n')).toMatch(/ParticipantRow\.questions is not a column of participants/)
    const notNull = withEdits([{ file: 'init', from: 'note text,', to: 'note text not null,' }])
    expect(checkRowTypes(notNull, sources, ROW_TYPES).join('\n')).toMatch(/HighlightRow\.note: TypeScript says nullable but highlights\.note is NOT NULL/)
    const nullable = withEdits([{ file: 'init', from: 'title text not null\n);\n\ncreate table summaries', to: 'title text\n);\n\ncreate table summaries' }])
    expect(checkRowTypes(nullable, sources, ROW_TYPES).join('\n')).toMatch(/ChapterRow\.title: TypeScript says non-null but chapters\.title is nullable/)
    const rpcRenamed = withEdits([{ file: 'hardening', from: 'meeting_title text, segment_idx int,', to: 'meeting_name text, segment_idx int,' }])
    expect(checkRowTypes(rpcRenamed, sources, ROW_TYPES).join('\n')).toMatch(/SearchHit\.meeting_title is not a column of rpc:search_segments/)
    const stub: SourceFile[] = [{ file: 'types.ts', text: 'export type Gone = { a: string }' }]
    expect(checkRowTypes(schema, stub, [{ type: 'MeetingRow', source: 'meetings' }]).join('\n')).toMatch(/type MeetingRow was not found/)
  })

  it('the scanner and parser guards: a broken source or migration cannot pass quietly', () => {
    // a call the scanner cannot resolve is recorded, not ignored
    const dynamic = usageOf("const t = pick(); await db.from(t).select('id')")
    expect(dynamic.skips.map((s) => s.reason)).toEqual(['.from(t) could not be resolved'])
    const notLiteral = checkReferences(schema, usageOf("db.from('meetings').select(cols).eq(col, 1).or('a.eq.1')").ops)
    expect(notLiteral.unchecked).toHaveLength(3)
    expect(usageOf("db.from('meetings').select('id').shiny('x')").unknownMethods).toHaveLength(1)
    // a migration the parser cannot read is an error, not an omission
    expect(() => buildSchema([{ name: 'a.sql', sql: 'create table t (id uuid primary key); alter table t drop constraint nope;' }])).toThrow(/never saw created/)
    expect(buildSchema([{ name: 'a.sql', sql: 'create table t (id uuid primary key); alter table t cluster on t_pkey;' }]).unrecognised).toEqual(['alter table t cluster on t_pkey'])
    expect(buildSchema([{ name: 'a.sql', sql: 'create table t (id uuid primary key); truncate t;' }]).unrecognised).toEqual(['truncate t'])
    // sanity: the real files still parse with nothing unrecognised after all that
    expect(loadSchema(join(ROOT, 'supabase/migrations')).unrecognised).toEqual([])
  })
})
