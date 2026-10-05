import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MeetingsLoading from '@/app/meetings/loading'

const html = renderToStaticMarkup(createElement(MeetingsLoading))

describe('My Calls loading skeleton', () => {
  it('is one polite busy status region with a screen-reader label', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading My Calls')
  })

  it('renders the real static headings', () => {
    expect(html).toContain('>My Calls</h1>')
    expect(html).toContain('>Upcoming</h2>')
    expect(html).toContain('>Ask Fathom</h2>')
  })

  it('mirrors the page grid and bordered sections', () => {
    expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_auto]')
    expect(html).toContain('rounded-card border border-border p-4 sm:p-5')
    expect(html).toContain('lg:w-[360px]')
  })

  it('has no links, buttons or form controls, because none can work without data', () => {
    expect(html).not.toMatch(/<(a|button|input|select|textarea|form)[\s>]/)
  })

  it('has enough shimmer blocks for upcoming, three cards and the ask panel', () => {
    expect((html.match(/animate-shimmer/g) ?? []).length).toBeGreaterThanOrEqual(15)
  })
})
