import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SearchLoading from '@/app/search/loading'

const html = renderToStaticMarkup(createElement(SearchLoading))
const count = (needle: string) => html.split(needle).length - 1

describe('search loading skeleton', () => {
  it('is one announced loading region', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading search results')
  })

  it('keeps the query-dependent heading neutral', () => {
    expect(html).not.toContain('Results for')
    expect(html).not.toContain('Search call recordings')
  })

  it('has no interactive or data-dependent controls', () => {
    expect(html).not.toContain('<a')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<form')
  })

  it('matches the real container and hit-row box', () => {
    expect(html).toContain('mx-auto max-w-3xl space-y-6 px-4 py-6')
    expect(count('rounded-lg border border-border bg-surface p-3')).toBe(4)
  })

  it('shows a heading block, two group titles and two lines per hit row', () => {
    expect(count('animate-shimmer')).toBeGreaterThanOrEqual(1 + 2 + 4 * 2)
  })
})
