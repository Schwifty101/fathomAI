import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CalendarLoading from '@/app/calendar/loading'

describe('calendar loading skeleton', () => {
  const html = renderToStaticMarkup(createElement(CalendarLoading))

  it('is one busy status region with a screen-reader label', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading calendar')
  })

  it('renders the real page heading and container', () => {
    expect(html).toContain('<h1 class="text-2xl font-semibold">Calendar</h1>')
    expect(html).toContain('mx-auto max-w-2xl space-y-6 px-4 py-6')
  })

  it('has no links, buttons or form controls', () => {
    expect(html).not.toMatch(/<(a|button|form|input|select|textarea)[\s>]/)
  })

  it('has enough shimmer blocks for the card, button and event rows', () => {
    expect(html.match(/animate-shimmer/g)?.length ?? 0).toBeGreaterThanOrEqual(10)
  })
})
