'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { UpcomingEvent } from '@/lib/types'

const KEY = 'calendar-connected'
const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export function CalendarConnect({ events }: { events: UpcomingEvent[] }) {
  const [connected, setConnected] = useState(false)
  const [off, setOff] = useState<Set<string>>(new Set())

  // Read storage after mount so the first client render matches the server render.
  useEffect(() => {
    try {
      setConnected(localStorage.getItem(KEY) === '1')
    } catch {
      // storage blocked: stay disconnected
    }
  }, [])
  const set = (v: boolean) => {
    setConnected(v)
    try {
      localStorage.setItem(KEY, v ? '1' : '0')
    } catch {
      // not persisted; fine for a demo
    }
  }

  if (!connected) {
    return (
      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold">Connect your calendar</h2>
        <p className="text-sm text-muted">
          The notetaker joins the meetings on your calendar automatically. This is a demo: no real Google Calendar
          connection is made, and the events shown after connecting are sample data.
        </p>
        <Button variant="primary" onClick={() => set(true)}>Connect Google Calendar (demo)</Button>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Connected (demo, sample events). Switch the notetaker on or off per meeting.</p>
        <Button size="sm" variant="ghost" onClick={() => set(false)}>Disconnect</Button>
      </div>
      {events.length === 0 && (
        <Card className="p-6 text-center">
          <p className="font-medium">No upcoming meetings</p>
          <p className="mt-1 text-sm text-muted">There are no sample events right now. Check back after the demo data is refreshed.</p>
        </Card>
      )}
      {events.map((e) => {
        const on = !off.has(e.id)
        return (
          <Card key={e.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{e.title}</p>
              <p className="text-sm text-muted">{fmt.format(new Date(e.starts_at))} UTC</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span aria-hidden="true">Notetaker joins</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Notetaker joins ${e.title}`}
                onClick={() => setOff((s) => { const n = new Set(s); if (on) n.add(e.id); else n.delete(e.id); return n })}
                className={`relative h-6 w-11 rounded-full border border-border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'bg-accent' : 'bg-surface-2'}`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 size-4 rounded-full transition-transform ${on ? 'translate-x-5 bg-accent-fg' : 'bg-muted'}`}
                />
              </button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
