import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { laneColor } from '@/lib/lanes'
import { sortByTalk } from '@/lib/participants'
import { getMeetingBundle, listMeetings } from '@/lib/queries'

// A thenable query builder over in-memory tables. order() is ignored on purpose: the database promises no order
// between equal keys, and the app must not lean on one.
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    let rows = tables[table] ?? []
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value)
        return builder
      },
      range: (start: number, end: number) => {
        rows = rows.slice(start, end + 1)
        return builder
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

// Stored in an order that is neither by talk time nor by id; two people tie on talk time.
const stored = [
  { id: 'p-c', name: 'Cara', is_internal: true, talk_time_sec: 120 },
  { id: 'p-b', name: 'Ben', is_internal: false, talk_time_sec: 300 },
  { id: 'p-d', name: 'Dev', is_internal: true, talk_time_sec: 120 },
  { id: 'p-a', name: 'Amy', is_internal: true, talk_time_sec: 300 },
]

describe('sortByTalk', () => {
  it('puts the longest speaker first and breaks ties by id', () => {
    expect(sortByTalk(stored).map((p) => p.id)).toEqual(['p-a', 'p-b', 'p-c', 'p-d'])
  })

  it('does not change its input', () => {
    const copy = stored.map((p) => p.id)
    sortByTalk(stored)
    expect(stored.map((p) => p.id)).toEqual(copy)
  })
})

describe('participant order across the card and the meeting page', () => {
  const meeting = { id: 'm1', slug: 'q4', title: 'Q4', host_id: 'h', started_at: '2026-10-01T10:00:00Z' }

  it('gives every person the same lane colour on the card and on the meeting page', async () => {
    const db = fakeDb({
      meetings: [{ ...meeting, participants: stored }],
      participants: stored.map((p) => ({ ...p, meeting_id: 'm1', role: '', questions: 0, longest_monologue_sec: 0 })),
    })
    const [card] = await listMeetings(db)
    const page = await getMeetingBundle(db, 'q4', null)
    const colourOnCard = new Map(card.participants.map((p, index) => [p.name, laneColor(index)]))
    const colourOnPage = new Map(page!.participants.map((p, index) => [p.name, laneColor(index)]))
    expect(colourOnCard).toEqual(colourOnPage)
    expect(card.participants.map((p) => p.name)).toEqual(['Amy', 'Ben', 'Cara', 'Dev'])
  })
})
