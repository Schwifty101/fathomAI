import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TeamLoading from '@/app/team/loading'

const html = renderToStaticMarkup(createElement(TeamLoading))

describe('team loading skeleton', () => {
  it('is one polite busy status region with a screen-reader label', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading team calls')
  })

  it('renders the static text of the real page', () => {
    for (const text of ['Team Calls', 'Calls', 'Avg talk share', 'Team members', 'Team calls', 'Ask Fathom']) {
      expect(html).toContain(`>${text}</`)
    }
    for (const header of ['Member', 'Talk share', 'Questions', 'Longest monologue']) {
      expect(html).toContain(`>${header}</th>`)
    }
  })

  it('has no links, buttons or form controls, because they depend on server data', () => {
    expect(html).not.toMatch(/<(a|button|select|input|form|textarea)[\s>]/)
  })

  it('has a sensible number of shimmer blocks', () => {
    expect((html.match(/animate-shimmer/g) ?? []).length).toBeGreaterThanOrEqual(30)
  })
})
