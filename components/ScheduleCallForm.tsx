'use client'
import { useRef, useState, useTransition, type FormEvent } from 'react'
import { scheduleCall } from '@/app/calendar/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { CalEvent } from '@/lib/google-calendar'
import { safeHref } from '@/lib/safe-href'
import { toast } from '@/lib/toast'

const DURATIONS = [15, 30, 45, 60, 90]
const field = 'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export function ScheduleCallForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CalEvent | null>(null)

  // onSubmit rather than a form action: React resets an action form on completion, which would wipe the input on failure.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const startValue = String(formData.get('start') ?? '')
    const when = new Date(startValue)
    if (Number.isNaN(when.getTime())) {
      setError('Choose a start date and time.')
      return
    }
    const attendees = String(formData.get('attendees') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    setError(null)
    setCreated(null)
    start(async () => {
      const res = await scheduleCall({
        title: String(formData.get('title') ?? ''),
        start: when.toISOString(),
        durationMin: Number(formData.get('duration')),
        attendees,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setCreated(res.event)
      toast('Call scheduled')
      formRef.current?.reset()
    })
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Schedule a call</h2>
      <p className="mt-1 text-sm text-muted">Creates an event on your primary Google Calendar with a Google Meet link.</p>
      <form ref={formRef} onSubmit={submit} className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="sc-title" className="text-sm font-medium">Title</label>
          <input id="sc-title" name="title" type="text" required maxLength={200} disabled={pending} className={field} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-1.5">
            <label htmlFor="sc-start" className="text-sm font-medium">Start (your local time)</label>
            <input id="sc-start" name="start" type="datetime-local" required disabled={pending} className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sc-duration" className="text-sm font-medium">Duration</label>
            <select id="sc-duration" name="duration" defaultValue="30" disabled={pending} className={`${field} sm:w-auto`}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sc-attendees" className="text-sm font-medium">Attendees (optional)</label>
          <input
            id="sc-attendees" name="attendees" type="text" inputMode="email" autoComplete="off"
            placeholder="ana@example.com, ben@example.com" aria-describedby="sc-attendees-help" disabled={pending} className={field}
          />
          <p id="sc-attendees-help" className="text-xs text-muted">Separate addresses with commas. Google emails an invitation to each.</p>
        </div>
        <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Scheduling…' : 'Schedule call'}
        </Button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {created && (
          <p role="status" className="text-sm">
            {safeHref(created.meetUrl) ? (
              <>Scheduled. <a href={safeHref(created.meetUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2">Open the Meet link</a></>
            ) : (
              'Scheduled. Google is still creating the Meet link. Refresh in a moment.'
            )}
          </p>
        )}
      </form>
    </Card>
  )
}
