import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CalendarConnect } from '@/components/CalendarConnect'
import { safeHref } from '@/lib/safe-href'

describe('safeHref', () => {
  it('accepts https URLs', () => {
    expect(safeHref('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij')
    expect(safeHref('HTTPS://example.com')).toBe('HTTPS://example.com')
  })
  it.each(['javascript:alert(1)', 'data:text/html,x', 'http://example.com', '', '/relative', 'meet.google.com/x', ' https://x.com', null])(
    'rejects %j',
    (u) => expect(safeHref(u)).toBeNull(),
  )
})

describe('CalendarConnect link safety', () => {
  it('renders no link for a javascript: meetUrl or an http: htmlLink', () => {
    const html = renderToStaticMarkup(createElement(CalendarConnect, {
      mode: 'google',
      events: [{
        id: 'x', title: 'Evil', start: '2026-10-06T15:30:00Z', end: '2026-10-06T16:00:00Z', allDay: false,
        meetUrl: 'javascript:alert(1)', htmlLink: 'http://calendar.example.com/e', attendees: 0,
      }],
    }))
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('Join Meet')
    expect(html).not.toContain('Open in Google Calendar')
  })
})
