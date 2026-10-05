import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listMyMeetings } from '@/lib/queries'

// A thenable query builder over in-memory tables. It applies .eq filters, so a missing filter shows up as extra rows.
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const reads: string[] = []
  const from = (table: string) => {
    let rows = tables[table] ?? []
    reads.push(table)
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value)
        return builder
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return builder
  }
  return { db: { from } as unknown as SupabaseClient, reads }
}

const meetings = [
  { id: 'm1', host_id: 'demo', participants: [] },
  { id: 'm2', host_id: 'other', participants: [] },
]

describe('listMyMeetings', () => {
  it('lists only the demo persona calls', async () => {
    const { db } = fakeDb({ team_members: [{ id: 'demo', name: 'Demo', is_demo_user: true }], meetings })
    const result = await listMyMeetings(db)
    expect(result.persona?.id).toBe('demo')
    expect(result.meetings.map((meeting) => meeting.id)).toEqual(['m1'])
  })

  it('returns no calls, not every call, when there is no demo persona', async () => {
    const { db, reads } = fakeDb({ team_members: [{ id: 'someone', name: 'Someone', is_demo_user: false }], meetings })
    const result = await listMyMeetings(db)
    expect(result.persona).toBeNull()
    expect(result.meetings).toEqual([])
    expect(reads).not.toContain('meetings')
  })
})
