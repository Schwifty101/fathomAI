import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CalendarConnect } from '@/components/CalendarConnect'
import type { CalEvent } from '@/lib/google-calendar'

const demoEvents = [{ id: 'd1', title: 'Weekly pipeline review', platform: 'meet' as const, starts_at: '2026-10-06T14:00:00Z' }]
const render = (props: Parameters<typeof CalendarConnect>[0]) => renderToStaticMarkup(createElement(CalendarConnect, props))

const timed: CalEvent = {
  id: 'g1', title: 'Design sync', start: '2026-10-06T15:30:00Z', end: '2026-10-06T16:00:00Z', allDay: false,
  meetUrl: 'https://meet.google.com/abc-defg-hij', htmlLink: 'https://calendar.google.com/event?eid=1', attendees: 3,
}
const allDay: CalEvent = {
  id: 'g2', title: 'Offsite', start: '2026-10-08', end: '2026-10-09', allDay: true, meetUrl: null, htmlLink: null, attendees: 0,
}

describe('CalendarConnect demo mode', () => {
  it('offers to connect and labels the seeded list as a demo', () => {
    const html = render({ mode: 'demo', demoEvents, signedIn: false, revoked: false })
    expect(html).toContain('Connect your calendar')
    expect(html).toContain('Connect Google Calendar')
    expect(html).toContain('Demo schedule')
    expect(html).toContain('Weekly pipeline review')
    expect(html).not.toContain('Disconnect')
    expect(html).not.toContain('Access was revoked')
  })

  it('shows the revoked note', () => {
    const html = render({ mode: 'demo', demoEvents, signedIn: true, revoked: true })
    expect(html).toContain('Google access was revoked or expired. Connect again.')
  })
})

describe('CalendarConnect google mode', () => {
  it('lists events, one Meet link, all-day label, disconnect, notetaker note and a labelled start field', () => {
    const html = render({ mode: 'google', events: [timed, allDay] })
    expect(html).toContain('Your calendar')
    expect(html).toContain('Design sync')
    expect(html.split('Join Meet').length - 1).toBe(1)
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Open in Google Calendar')
    expect(html).toContain('All day')
    expect(html).toContain('3 attendees')
    expect(html).toContain('Disconnect')
    expect(html).toContain('The Fathom notetaker is simulated in this demo: it does not join the call.')
    expect(html).toMatch(/<label[^>]*>Start \(your local time\)<\/label>/)
    expect(html).toContain('type="datetime-local"')
    expect(html).not.toContain('Demo schedule')
  })

  it('shows an empty state', () => {
    const html = render({ mode: 'google', events: [] })
    expect(html).toContain('No upcoming events')
    expect(html).toContain('Disconnect')
  })

  it('shows the load error', () => {
    const html = render({ mode: 'google', events: [], loadError: 'Google Calendar is unavailable right now.' })
    expect(html).toContain('Google Calendar is unavailable right now.')
  })
})
