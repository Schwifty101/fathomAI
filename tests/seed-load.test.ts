import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SummaryContent, TranscriptFile } from '@/lib/schema'
import { buildPlan, loadSeed, type Bundle } from '@/seed/load'
import { castOf, type MeetingDef } from '@/seed/meetings'
import { TEAM } from '@/seed/team'
import { seedId } from '@/seed/uuid'

// ---------------------------------------------------------------------------------------------
// An in-memory stand-in for the hosted database. It models the parts of supabase/migrations that
// the loader can trip over: primary keys, natural unique keys (summaries are NULLS NOT DISTINCT),
// the one-demo-persona partial index, foreign keys (ON DELETE CASCADE versus the default NO ACTION),
// the CHECKs on segments, highlights, summaries and meetings, and PostgREST's refusal to run an
// unfiltered DELETE. Every statement is atomic, as it is in Postgres. No network, no environment.
// ---------------------------------------------------------------------------------------------
type Row = Record<string, any>
type DbError = { message: string; code: string }
type Result = { data: Row[] | null; error: DbError | null; count: number | null }
type Call = { kind: 'read' | 'write'; op: string; table: string; index: number; inSizes: number[] }
type Fk = { col: string; table: string; cascade: boolean; nullable?: boolean }
type TableDef = {
  pk?: string
  uniques?: { cols: string[]; nullsNotDistinct?: boolean }[]
  onlyOne?: string
  fks?: Fk[]
  check?: (row: Row) => boolean
  defaults?: (n: number) => Row
}

class Violation extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

const ofMeeting: Fk = { col: 'meeting_id', table: 'meetings', cascade: true }
const SCHEMA: Record<string, TableDef> = {
  team_members: { onlyOne: 'is_demo_user' },
  meetings: {
    uniques: [{ cols: ['slug'] }],
    fks: [{ col: 'host_id', table: 'team_members', cascade: false }],
    check: (row) => row.duration_sec > 0,
  },
  participants: {
    uniques: [{ cols: ['meeting_id', 'name'] }],
    fks: [ofMeeting, { col: 'member_id', table: 'team_members', cascade: false, nullable: true }],
  },
  segments: {
    uniques: [{ cols: ['meeting_id', 'idx'] }],
    fks: [ofMeeting, { col: 'participant_id', table: 'participants', cascade: true }],
    check: (row) => row.end_ms > row.start_ms,
  },
  chapters: { fks: [ofMeeting] },
  summaries: {
    uniques: [{ cols: ['meeting_id', 'template', 'user_id'], nullsNotDistinct: true }],
    fks: [ofMeeting],
    check: (row) => ['general', 'sales', 'standup', 'project_review'].includes(row.template),
    defaults: (n) => ({ created_at: `created#${n}` }),
  },
  action_items: { fks: [ofMeeting] },
  highlights: {
    fks: [ofMeeting],
    check: (row) => row.start_ms >= 0 && row.end_ms > row.start_ms && row.end_ms - row.start_ms <= 300_000 && row.title.length <= 80,
    defaults: (n) => ({ id: `generated-${n}`, created_at: `created#${n}` }),
  },
  shares: { pk: 'slug', fks: [ofMeeting], defaults: (n) => ({ created_at: `created#${n}` }) },
  calendar_events: {},
  ask_answers: { uniques: [{ cols: ['scope', 'prompt'] }] },
}

const sameKey = (a: Row, b: Row, cols: string[], nullsNotDistinct: boolean) =>
  cols.every((col) => (a[col] == null || b[col] == null ? nullsNotDistinct && a[col] == null && b[col] == null : a[col] === b[col]))

class Query implements PromiseLike<Result> {
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  payload: Row[] = []
  patch: Row = {}
  onConflict?: string
  conds: ((row: Row) => boolean)[] = []
  inSizes: number[] = []
  orderBy?: string
  window?: [number, number]
  head = false
  wantCount = false
  returning?: string

  constructor(private db: FakeDb, readonly table: string) {}

  select(columns = '*', options: { count?: string; head?: boolean } = {}) {
    this.returning = columns
    this.head = !!options.head
    this.wantCount = !!options.count
    return this
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = [rows].flat(); return this }
  upsert(rows: Row | Row[], options: { onConflict?: string } = {}) {
    this.op = 'upsert'
    this.payload = [rows].flat()
    this.onConflict = options.onConflict
    return this
  }
  update(patch: Row) { this.op = 'update'; this.patch = patch; return this }
  delete() { this.op = 'delete'; return this }
  eq(col: string, value: unknown) { this.conds.push((row) => row[col] === value); return this }
  neq(col: string, value: unknown) { this.conds.push((row) => row[col] !== value); return this }
  is(col: string, value: null | boolean) { this.conds.push((row) => (value === null ? row[col] == null : row[col] === value)); return this }
  not(col: string, operator: string, value: null | boolean) {
    if (operator !== 'is') throw new Error('fake: only not(col, "is", value) is supported')
    this.conds.push((row) => !(value === null ? row[col] == null : row[col] === value))
    return this
  }
  in(col: string, values: unknown[]) { this.inSizes.push(values.length); this.conds.push((row) => values.includes(row[col])); return this }
  order(col: string) { this.orderBy = col; return this }
  range(from: number, to: number) { this.window = [from, to]; return this }
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.db.exec(this).then(onfulfilled, onrejected)
  }
}

class FakeDb {
  tables: Record<string, Row[]> = Object.fromEntries(Object.keys(SCHEMA).map((table) => [table, []]))
  log: Call[] = []
  inject?: (call: Call) => DbError | undefined
  maxRows = Infinity // PostgREST caps every response at max-rows (1000 on a default project)
  reads = 0
  writes = 0
  private serial = 0

  get client() { return { from: (table: string) => new Query(this, table) } as unknown as SupabaseClient }
  count(table: string) { return this.tables[table].length }
  ids(table: string) { return this.tables[table].map((row) => row[SCHEMA[table].pk ?? 'id']).sort() }
  dump(options: { ignoreCreated?: boolean } = {}) {
    return Object.fromEntries(Object.keys(SCHEMA).map((table) => {
      const pk = SCHEMA[table].pk ?? 'id'
      const rows = structuredClone(this.tables[table]).sort((a, b) => String(a[pk]).localeCompare(String(b[pk])))
      if (options.ignoreCreated) rows.forEach((row) => { delete row.created_at })
      return [table, rows]
    }))
  }
  writesSince(index: number) { return this.log.filter((call) => call.kind === 'write' && call.index >= index) }

  exec(query: Query): Promise<Result> {
    const kind = query.op === 'select' ? 'read' : 'write'
    const call: Call = { kind, op: query.op, table: query.table, index: kind === 'read' ? this.reads++ : this.writes++, inSizes: query.inSizes }
    this.log.push(call)
    const injected = this.inject?.(call)
    if (injected) return Promise.resolve({ data: null, error: injected, count: null })
    const before = structuredClone(this.tables)
    try {
      return Promise.resolve(this.run(query))
    } catch (error) {
      if (!(error instanceof Violation)) throw error
      this.tables = before // a failed statement changes nothing
      return Promise.resolve({ data: null, error: { message: error.message, code: error.code }, count: null })
    }
  }

  private run(q: Query): Result {
    const rows = this.tables[q.table]
    if (!rows) throw new Violation('42P01', `relation "${q.table}" does not exist`)
    const matching = () => rows.filter((row) => q.conds.every((cond) => cond(row)))
    const project = (row: Row) => {
      if (!q.returning || q.returning === '*') return structuredClone(row)
      return Object.fromEntries(q.returning.split(',').map((col) => [col.trim(), structuredClone(row[col.trim()])]))
    }
    if (q.op === 'select') {
      let found = matching()
      const total = found.length
      if (q.orderBy) found = [...found].sort((a, b) => String(a[q.orderBy!]).localeCompare(String(b[q.orderBy!])))
      const from = q.window?.[0] ?? 0
      const to = Math.min(q.window ? q.window[1] + 1 : Infinity, from + this.maxRows)
      return { data: q.head ? null : found.slice(from, to).map(project), error: null, count: q.wantCount ? total : null }
    }
    if ((q.op === 'update' || q.op === 'delete') && !q.conds.length) {
      throw new Violation('21000', `${q.op.toUpperCase()} requires a WHERE clause`)
    }
    let affected: Row[] = []
    if (q.op === 'insert') affected = q.payload.map((payload) => this.insertRow(q.table, payload))
    if (q.op === 'upsert') affected = this.upsert(q)
    if (q.op === 'update') {
      affected = matching()
      for (const row of affected) { Object.assign(row, q.patch); this.validate(q.table, row) }
    }
    if (q.op === 'delete') {
      affected = matching()
      for (const row of affected) this.remove(q.table, row)
    }
    return { data: q.returning ? affected.map(project) : null, error: null, count: null }
  }

  private insertRow(table: string, payload: Row): Row {
    const def = SCHEMA[table]
    const row = { ...def.defaults?.(++this.serial), ...structuredClone(payload) }
    if (row[def.pk ?? 'id'] == null) throw new Violation('23502', `null value in primary key of "${table}"`)
    this.tables[table].push(row)
    this.validate(table, row)
    return row
  }

  private upsert(q: Query): Row[] {
    const def = SCHEMA[q.table]
    const pk = def.pk ?? 'id'
    const cols = (q.onConflict ?? pk).split(',').map((col) => col.trim())
    const target = cols.join() === pk ? { cols, nullsNotDistinct: false } : def.uniques?.find((u) => [...u.cols].sort().join() === [...cols].sort().join())
    if (!target) throw new Violation('42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification')
    const touched = new Set<Row>()
    const affected: Row[] = []
    for (const payload of q.payload) {
      const existing = this.tables[q.table].find((row) => sameKey(row, payload, cols, !!target.nullsNotDistinct))
      if (existing && touched.has(existing)) throw new Violation('21000', 'ON CONFLICT DO UPDATE command cannot affect row a second time')
      const row = existing ? Object.assign(existing, structuredClone(payload)) : this.insertRow(q.table, payload)
      if (existing) this.validate(q.table, row)
      touched.add(row)
      affected.push(row)
    }
    return affected
  }

  private validate(table: string, row: Row) {
    const def = SCHEMA[table]
    const pk = def.pk ?? 'id'
    for (const fk of def.fks ?? []) {
      if (row[fk.col] == null) {
        if (!fk.nullable) throw new Violation('23502', `null value in column "${fk.col}" of relation "${table}" violates not-null constraint`)
        continue
      }
      if (!this.tables[fk.table].some((parent) => parent.id === row[fk.col])) {
        throw new Violation('23503', `insert or update on table "${table}" violates foreign key constraint on "${fk.col}"`)
      }
    }
    if (def.check && !def.check(row)) throw new Violation('23514', `new row for relation "${table}" violates check constraint`)
    const others = this.tables[table].filter((other) => other !== row)
    if (others.some((other) => other[pk] === row[pk])) throw new Violation('23505', `duplicate key value violates unique constraint "${table}_pkey"`)
    for (const unique of def.uniques ?? []) {
      if (others.some((other) => sameKey(other, row, unique.cols, !!unique.nullsNotDistinct))) {
        throw new Violation('23505', `duplicate key value violates unique constraint "${table}_${unique.cols.join('_')}_key"`)
      }
    }
    if (def.onlyOne && row[def.onlyOne] === true && others.some((other) => other[def.onlyOne!] === true)) {
      throw new Violation('23505', `duplicate key value violates unique constraint "${table}_${def.onlyOne}"`)
    }
  }

  private remove(table: string, row: Row) {
    const pk = SCHEMA[table].pk ?? 'id'
    for (const [childTable, def] of Object.entries(SCHEMA)) {
      for (const fk of def.fks ?? []) {
        if (fk.table !== table) continue
        const children = this.tables[childTable].filter((child) => child[fk.col] === row[pk])
        if (children.length && !fk.cascade) {
          throw new Violation('23503', `update or delete on table "${table}" violates foreign key constraint "${childTable}_${fk.col}_fkey" on table "${childTable}"`)
        }
        children.forEach((child) => this.remove(childTable, child))
      }
    }
    this.tables[table] = this.tables[table].filter((other) => other !== row)
  }
}

// ---------------------------------------------------------------------------------------------
// Fixtures: two small meetings built from real team members, so castOf() resolves.
// ---------------------------------------------------------------------------------------------
const defAlpha: MeetingDef = {
  slug: 'alpha', title: 'Alpha review', kind: 'planning', platform: 'zoom', daysAgo: 3, hourUtc: 9, host: 'priya',
  internal: ['priya', 'mei'], externals: [{ name: 'Eve Buyer', role: 'Buyer' }], targetMin: 1, topic: 'x',
}
const defBeta: MeetingDef = {
  slug: 'beta', title: 'Beta sync', kind: 'standup', platform: 'meet', daysAgo: 4, hourUtc: 10, host: 'mei',
  internal: ['mei', 'lucas'], externals: [], targetMin: 1, topic: 'x',
}
const SUMMARY: SummaryContent = { sections: [{ heading: 'Overview', bullets: ['They met.'] }] }

function transcript(speakers: string[], count: number): TranscriptFile {
  const lines = Array.from({ length: count }, (_, idx) => ({
    idx, speaker: speakers[idx % speakers.length], text: `line ${idx} about the rollout?`,
    start_ms: idx * 1000, end_ms: idx * 1000 + 900,
  }))
  return {
    lines, duration_ms: lines.at(-1)!.end_ms,
    chapters: [{ title: 'Start', start_idx: 0 }, { title: 'End', start_idx: Math.floor(count / 2) }],
  }
}

function meeting(def: MeetingDef, lineCount = 6, templates = ['general', 'sales', 'standup', 'project_review']): Bundle['meetings'][number] {
  const names = castOf(def).map((person) => person.name)
  const t = transcript(names, lineCount)
  return {
    def, transcript: t,
    summaries: Object.fromEntries(templates.map((template) => [template, SUMMARY])),
    actions: [{ owner: names[0], task: `Follow up on ${def.slug}`, due: '2026-10-09', start_ms: t.lines[1].start_ms }],
    highlights: [0, 2, 4].filter((i) => i < lineCount).map((i) => ({
      type: 'insight', title: `Moment ${i}`, start_ms: t.lines[i].start_ms, end_ms: t.lines[i].end_ms,
    })),
  }
}

const askAnswer = (scope: string, prompt: string, slug = 'alpha') => ({
  prompt, scope, text: 'An answer.', citations: [{ meeting_slug: slug, segment_idx: 1, label: 'Alpha review' }],
})

function bundle(): Bundle {
  return {
    team: TEAM,
    meetings: [meeting(defAlpha, 8), meeting(defBeta, 6)],
    ask: [askAnswer('my_calls', 'What shipped?'), askAnswer('team_calls', 'What is blocked?')],
    events: [
      { title: 'Sync A', platform: 'zoom', day_offset: 1, time_of_day: '10:00' },
      { title: 'Sync B', platform: 'meet', day_offset: 2, time_of_day: '11:30' },
    ],
    model: 'sonnet',
  }
}

const load = (db: FakeDb, b: Bundle, options: { dryRun?: boolean; log?: (line: string) => void } = {}) =>
  loadSeed(db.client, b, { log: () => {}, ...options })
const rowsOf = (db: FakeDb) => db.dump({ ignoreCreated: true })
const boom: DbError = { message: 'connection reset', code: '08006' }

async function expectConverges(from: Bundle, to: Bundle) {
  const migrated = new FakeDb()
  await load(migrated, from)
  await load(migrated, to)
  const fresh = new FakeDb()
  await load(fresh, to)
  expect(rowsOf(migrated)).toEqual(rowsOf(fresh))
}

// ---------------------------------------------------------------------------------------------
describe('the in-memory database used by these tests', () => {
  it('keeps the bundle loadable: sanity of the fixtures against the modelled constraints', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    expect(['team_members', 'meetings', 'participants', 'segments'].map((t) => db.count(t))).toEqual([8, 2, 5, 14])
  })

  it('applies ON DELETE CASCADE and refuses to delete a still-referenced team member', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    const priya = await db.client.from('team_members').delete().eq('id', seedId('member', 'priya'))
    expect(priya.error?.code).toBe('23503')
    const gone = await db.client.from('meetings').delete().eq('id', seedId('meeting', 'beta'))
    expect(gone.error).toBeNull()
    expect(db.count('segments')).toBe(8)
    expect(db.count('participants')).toBe(3)
  })

  it('enforces natural keys, the single demo persona and NULLS NOT DISTINCT summaries', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    const twin = await db.client.from('participants').upsert({
      id: 'other-id', meeting_id: seedId('meeting', 'beta'), name: 'Mei Tanaka', role: 'x', is_internal: true,
    }, { onConflict: 'id' })
    expect(twin.error?.code).toBe('23505')
    const demo = await db.client.from('team_members').update({ is_demo_user: true }).eq('id', seedId('member', 'mei'))
    expect(demo.error?.code).toBe('23505')
    const summary = await db.client.from('summaries').upsert({
      id: 'dup', meeting_id: seedId('meeting', 'beta'), template: 'general', content: {}, user_id: null, source: 'seed',
    }, { onConflict: 'id' })
    expect(summary.error?.code).toBe('23505')
  })

  it('refuses an unfiltered delete, an unknown conflict target, and applies a failed statement not at all', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    expect((await db.client.from('chapters').delete()).error?.code).toBe('21000')
    expect((await db.client.from('chapters').upsert({ id: 'x' }, { onConflict: 'title' })).error?.code).toBe('42P10')
    const before = db.count('calendar_events')
    const batch = await db.client.from('calendar_events').upsert([{ id: 'ok-1' }, { id: 'ok-2' }, { id: null }], { onConflict: 'id' })
    expect(batch.error).not.toBeNull()
    expect(db.count('calendar_events')).toBe(before)
  })
})

// ---------------------------------------------------------------------------------------------
describe('loadSeed: idempotence', () => {
  it('writes every table from the bundle', async () => {
    const db = new FakeDb()
    const report = await load(db, bundle())
    expect(report.counts).toEqual({
      team_members: 8, meetings: 2, participants: 5, segments: 14, chapters: 4,
      summaries: 8, action_items: 2, highlights: 6, ask_answers: 2, calendar_events: 2,
    })
    for (const [table, n] of Object.entries(report.counts)) expect(db.count(table), table).toBe(n)
  })

  it('loading twice gives identical rows (created_at included) and deletes nothing', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    const first = db.dump()
    const mark = db.writes
    const report = await load(db, bundle())
    expect(db.dump()).toEqual(first)
    expect(db.writesSince(mark).filter((call) => call.op === 'delete')).toEqual([])
    expect(Object.values(report.pruned).reduce((sum, n) => sum + n, 0)).toBe(0)
  })
})

describe('loadSeed: rows that left the bundle are removed', () => {
  const cases: [string, (b: Bundle) => void][] = [
    ['a participant who left the meeting, with a shorter transcript', (b) => {
      b.meetings[0] = meeting({ ...defAlpha, externals: [] }, 4)
    }],
    ['a participant renamed', (b) => {
      b.meetings[0] = meeting({ ...defAlpha, externals: [{ name: 'Evie Buyer', role: 'Buyer' }] }, 8)
    }],
    ['a whole meeting', (b) => { b.meetings = [b.meetings[0]] }],
    ['a summary template, fewer highlights and a shorter transcript', (b) => {
      b.meetings[1] = meeting(defBeta, 2, ['general'])
    }],
    ['a calendar event replaced by another', (b) => {
      b.events = [b.events[0], { title: 'Sync C', platform: 'teams', day_offset: 3, time_of_day: '08:00' }]
    }],
    ['a team member nobody joined', (b) => { b.team = TEAM.filter((member) => member.slug !== 'omar') }],
    ['an Ask answer with a new prompt', (b) => { b.ask[1] = askAnswer('team_calls', 'Who owns the rollout?') }],
    ['the demo persona moved to another member', (b) => { b.team = TEAM.map((member) => ({ ...member, demo: member.slug === 'mei' })) }],
  ]
  it.each(cases)('after %s, the database equals a fresh load of the new bundle', async (_name, change) => {
    const next = bundle()
    change(next)
    await expectConverges(bundle(), next)
  })

  it('hands the demo persona over when the old demo member leaves the team entirely', async () => {
    const before = bundle()
    before.team = [...TEAM.map((member) => ({ ...member, demo: false })), { slug: 'zed', name: 'Zed Test', role: 'QA', demo: true }]
    await expectConverges(before, bundle())
  })

  it('replaces an Ask row whose id came from an older id scheme without clearing the table', async () => {
    const db = new FakeDb()
    await db.client.from('ask_answers').insert([
      { id: seedId('ask', 'What shipped?'), scope: 'my_calls', prompt: 'What shipped?', answer: { text: 'old', citations: [] } },
      { id: 'stray', scope: 'my_calls', prompt: 'A question nobody asks now', answer: { text: 'old', citations: [] } },
    ])
    await load(db, bundle())
    const fresh = new FakeDb()
    await load(fresh, bundle())
    expect(rowsOf(db)).toEqual(rowsOf(fresh))
  })

  it('finds every stale row when the server caps responses, and deletes in short id lists', async () => {
    const big = bundle()
    big.meetings[0] = meeting(defAlpha, 250)
    const db = new FakeDb()
    db.maxRows = 7
    await load(db, big)
    const mark = db.writes
    await load(db, bundle())
    const fresh = new FakeDb()
    await load(fresh, bundle())
    expect(rowsOf(db)).toEqual(rowsOf(fresh))
    const sizes = db.writesSince(mark).filter((call) => call.op === 'delete').flatMap((call) => call.inSizes)
    expect(sizes.length).toBeGreaterThan(1)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100)
  })
})

describe('loadSeed: what users created is kept', () => {
  const user = 'user-1'
  async function withUserData(db: FakeDb, slug: string) {
    const meetingId = seedId('meeting', slug)
    await db.client.from('highlights').insert({ meeting_id: meetingId, user_id: user, type: 'insight', title: 'mine', start_ms: 0, end_ms: 1000 })
    await db.client.from('summaries').insert({ id: `mine-${slug}`, meeting_id: meetingId, template: 'general', content: SUMMARY, user_id: user, source: 'live' })
    await db.client.from('shares').insert({ slug: `clip-${slug}`, meeting_id: meetingId, start_ms: 0, end_ms: 1000, created_by: user })
  }

  it('keeps user highlights, user summaries and shares on a meeting that stays, while the seeded rows change', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    await withUserData(db, 'alpha')
    const next = bundle()
    next.meetings[0] = meeting(defAlpha, 4, ['general', 'sales'])
    const report = await load(db, next)
    expect(db.tables.highlights.filter((row) => row.user_id === user)).toHaveLength(1)
    expect(db.tables.summaries.filter((row) => row.user_id === user)).toHaveLength(1)
    expect(db.tables.shares).toHaveLength(1)
    expect(db.tables.summaries.filter((row) => row.user_id == null && row.meeting_id === seedId('meeting', 'alpha'))).toHaveLength(2)
    expect(report.cascaded.highlights + report.cascaded.summaries + report.cascaded.shares).toBe(0)
  })

  it('reports the user data a removed meeting takes with it, because the foreign keys force that', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    await withUserData(db, 'beta')
    await withUserData(db, 'alpha')
    const next = bundle()
    next.meetings = [next.meetings[0]]
    const lines: string[] = []
    const report = await load(db, next, { log: (line) => lines.push(line) })
    expect(report.cascaded).toEqual({ meetings: ['beta'], highlights: 1, summaries: 1, shares: 1 })
    expect(lines.join('\n')).toMatch(/WARNING.*beta.*1 user highlight.*1 user summary.*1 share/)
    expect(db.tables.shares.map((row) => row.slug)).toEqual(['clip-alpha'])
    expect(db.tables.highlights.filter((row) => row.user_id === user)).toHaveLength(1)
  })
})

describe('loadSeed: a bad bundle or a failure never leaves the tables half cleared', () => {
  const invalid: [string, (b: Bundle) => void, RegExp][] = [
    ['a speaker outside the cast', (b) => { b.meetings[1].transcript.lines[2].speaker = 'Nobody Here' }, /Nobody Here/],
    ['a chapter that starts past the end', (b) => { b.meetings[0].transcript.chapters[1].start_idx = 99 }, /chapter/i],
    ['an Ask citation to an unknown meeting', (b) => { b.ask[0].citations[0].meeting_slug = 'gamma' }, /gamma/],
    ['an Ask citation past the end of the transcript', (b) => { b.ask[0].citations[0].segment_idx = 99 }, /99/],
    ['a cast member who is not on the team', (b) => { b.team = TEAM.filter((member) => member.slug !== 'lucas') }, /lucas/],
    ['a summary template the table does not allow', (b) => { b.meetings[0].summaries.misc = SUMMARY }, /misc/],
    ['two lines with the same idx', (b) => { b.meetings[0].transcript.lines[3].idx = 2 }, /duplicate/i],
    ['two Ask answers for one question', (b) => { b.ask.push(askAnswer('my_calls', 'What shipped?')) }, /duplicate/i],
    ['no meetings at all', (b) => { b.meetings = [] }, /no meetings/i],
  ]
  it.each(invalid)('refuses %s before writing anything', async (_name, damage, expected) => {
    const db = new FakeDb()
    await load(db, bundle())
    const before = db.dump()
    const mark = db.writes
    const broken = bundle()
    damage(broken)
    await expect(load(db, broken)).rejects.toThrow(expected)
    expect(db.writesSince(mark)).toEqual([])
    expect(db.dump()).toEqual(before)
  })

  it('does not touch the database to build or check a plan', () => {
    expect(buildPlan(bundle()).steps.length).toBeGreaterThan(0)
    expect(() => buildPlan({ ...bundle(), meetings: [] })).toThrow(/no meetings/i)
  })

  it('writes nothing when the read that finds stale rows fails', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    const before = db.dump()
    const mark = db.writes
    db.inject = (call) => (call.kind === 'read' ? boom : undefined)
    const next = bundle()
    next.meetings = [next.meetings[0]]
    await expect(load(db, next)).rejects.toThrow(/connection reset/)
    expect(db.writesSince(mark)).toEqual([])
    expect(db.dump()).toEqual(before)
  })

  it('upserts everything before it deletes anything', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    const mark = db.writes
    const next = bundle()
    next.meetings = [meeting({ ...defAlpha, externals: [] }, 4)]
    await load(db, next)
    const ops = db.writesSince(mark).map((call) => call.op)
    expect(ops.lastIndexOf('upsert')).toBeLessThan(ops.indexOf('delete'))
    expect(ops).toContain('delete')
  })

  it('a failure at any single write keeps every old row until the upserts finish, and a rerun converges', async () => {
    const from = bundle()
    const to = bundle()
    to.meetings = [meeting({ ...defAlpha, externals: [] }, 4)]
    to.events = [to.events[0]]
    to.team = TEAM.filter((member) => member.slug !== 'omar')

    const probe = new FakeDb()
    await load(probe, from)
    const mark = probe.writes
    await load(probe, to)
    const sequence = probe.writesSince(mark).map((call) => call.op)
    const upserts = sequence.lastIndexOf('upsert') + 1
    expect(sequence.length).toBeGreaterThan(upserts) // there is a prune phase to interrupt
    const fresh = new FakeDb()
    await load(fresh, to)

    for (let failAt = 0; failAt < sequence.length; failAt++) {
      const db = new FakeDb()
      await load(db, from)
      const before = Object.fromEntries(Object.keys(SCHEMA).map((table) => [table, db.ids(table)]))
      const base = db.writes
      db.inject = (call) => (call.kind === 'write' && call.index === base + failAt ? boom : undefined)
      await expect(load(db, to), `failure at write ${failAt}`).rejects.toThrow(/connection reset/)
      if (failAt < upserts) {
        for (const table of Object.keys(SCHEMA)) {
          expect(db.ids(table), `${table} after failure at write ${failAt}`).toEqual(expect.arrayContaining(before[table]))
        }
      }
      db.inject = undefined
      await load(db, to)
      expect(rowsOf(db), `rerun after failure at write ${failAt}`).toEqual(rowsOf(fresh))
    }
  })

  it('--dry-run reads and reports, but writes nothing', async () => {
    const db = new FakeDb()
    await load(db, bundle())
    const before = db.dump()
    const mark = db.writes
    const next = bundle()
    next.meetings = [next.meetings[0]]
    const report = await load(db, next, { dryRun: true })
    expect(report.dryRun).toBe(true)
    expect(report.pruned.meetings).toBe(1)
    expect(report.pruned.segments).toBe(6)
    expect(db.writesSince(mark)).toEqual([])
    expect(db.dump()).toEqual(before)
  })
})
