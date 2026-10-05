import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ClipLoading from '@/app/clip/[slug]/loading'

const html = renderToStaticMarkup(createElement(ClipLoading))

describe('clip loading skeleton', () => {
  it('is one busy status region with a screen-reader label', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading shared clip')
  })

  it('renders the static page label so the screen reads as loaded', () => {
    expect(html).toContain('Shared clip')
  })

  it('has no links, buttons or form controls that depend on data', () => {
    expect(html).not.toMatch(/<(a|button|input|select|form)[\s>]/)
  })

  it('has enough shimmer blocks for title, player, scrubber, controls, transcript and actions', () => {
    expect(html.match(/animate-shimmer/g)?.length ?? 0).toBeGreaterThanOrEqual(15)
  })
})
