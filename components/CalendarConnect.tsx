'use client'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { disconnectCalendar } from '@/app/calendar/actions'
import { ScheduleCallForm } from '@/components/ScheduleCallForm'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { CalEvent } from '@/lib/google-calendar'
import { safeHref } from '@/lib/safe-href'
import { connectGoogleCalendar } from '@/lib/supabase/client'
import type { UpcomingEvent } from '@/lib/types'

export type CalendarConnectProps =
  | { mode: 'google'; events: CalEvent[]; loadError?: string }
  | { mode: 'demo'; demoEvents: UpcomingEvent[]; signedIn: boolean; revoked: boolean }

const demoFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
const timedFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const link = 'font-medium text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

function ConnectButton() {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="primary"
      disabled={busy}
      className="w-full sm:w-auto"
      onClick={async () => {
        setBusy(true)
        // Read lazily so the component also renders outside a router. The page navigates away on success.
        await connectGoogleCalendar(location.pathname)
        setBusy(false)
      }}
    >
      {busy ? 'Redirecting to Google…' : 'Connect Google Calendar'}
    </Button>
  )
}

function DisconnectButton() {
  const { pending } = useFormStatus()
  return <Button type="submit" size="sm" variant="ghost" disabled={pending}>{pending ? 'Disconnecting…' : 'Disconnect'}</Button>
}

function DemoList({ events }: { events: UpcomingEvent[] }) {
  return (
    <section aria-labelledby="demo-schedule" className="space-y-3">
      <h2 id="demo-schedule" className="text-sm font-medium text-muted">Demo schedule</h2>
      {events.length === 0 && (
        <Card className="p-6 text-center">
          <p className="font-medium">No upcoming meetings</p>
          <p className="mt-1 text-sm text-muted">There are no sample events right now. Check back after the demo data is refreshed.</p>
        </Card>
      )}
      {events.map((e) => (
        <Card key={e.id} className="p-4">
          <p className="truncate font-medium">{e.title}</p>
          <p className="text-sm text-muted">{demoFmt.format(new Date(e.starts_at))} UTC</p>
        </Card>
      ))}
    </section>
  )
}

function GoogleEvent({ e }: { e: CalEvent }) {
  const when = e.allDay ? dayFmt.format(new Date(e.start)) : `${timedFmt.format(new Date(e.start))} UTC`
  const meetUrl = safeHref(e.meetUrl)
  const htmlLink = safeHref(e.htmlLink)
  return (
    <Card className="space-y-2 p-4">
      <p className="break-words font-medium">{e.title}</p>
      <p className="text-sm text-muted">
        {when}
        {e.allDay && <span className="ml-2 rounded bg-surface-2 px-2 py-0.5 text-xs">All day</span>}
        {e.attendees > 0 && ` · ${e.attendees} ${e.attendees === 1 ? 'attendee' : 'attendees'}`}
      </p>
      {(meetUrl || htmlLink) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {meetUrl && <a href={meetUrl} target="_blank" rel="noopener noreferrer" className={link}>Join Meet</a>}
          {htmlLink && <a href={htmlLink} target="_blank" rel="noopener noreferrer" className={link}>Open in Google Calendar</a>}
        </div>
      )}
    </Card>
  )
}

export function CalendarConnect(props: CalendarConnectProps) {
  if (props.mode === 'demo') {
    return (
      <div className="space-y-6">
        <Card className="space-y-3 p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Connect your calendar</h2>
          <p className="text-sm text-muted">
            Sign in and connect Google Calendar to see your real events and schedule calls with a Google Meet link. Until then,
            this is a demo schedule.
          </p>
          {props.revoked && <p role="status" className="text-sm text-danger">Google access was revoked or expired. Connect again.</p>}
          <ConnectButton />
        </Card>
        <DemoList events={props.demoEvents} />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <section aria-labelledby="your-calendar" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="your-calendar" className="text-lg font-semibold">Your calendar</h2>
          <form action={disconnectCalendar}><DisconnectButton /></form>
        </div>
        <p className="text-sm text-muted">The Fathom notetaker is simulated in this demo: it does not join the call.</p>
        {props.loadError && <p role="alert" className="text-sm text-danger">{props.loadError}</p>}
        {!props.loadError && props.events.length === 0 && (
          <Card className="p-6 text-center">
            <p className="font-medium">No upcoming events</p>
            <p className="mt-1 text-sm text-muted">Nothing upcoming on your calendar. Schedule a call below.</p>
          </Card>
        )}
        {props.events.map((e) => <GoogleEvent key={e.id} e={e} />)}
      </section>
      <ScheduleCallForm />
    </div>
  )
}
