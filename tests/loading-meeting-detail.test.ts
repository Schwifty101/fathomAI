import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MeetingLoading from '@/app/meetings/[id]/loading'

const html = renderToStaticMarkup(createElement(MeetingLoading))

describe('meeting detail loading screen', () => {
  it('is one polite busy status region with a screen-reader label', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading meeting')
  })

  it('renders the real static text', () => {
    expect(html).toContain('← My Calls')
    expect(html).toContain('Highlight this moment')
    for (const label of ['Summary', 'Action items', 'Chapters', 'Highlights', 'Ask']) expect(html).toContain(`>${label}<`)
  })

  it('has no data-dependent controls: only the back link is interactive', () => {
    expect(html.match(/<a[\s>]/g)).toHaveLength(1)
    expect(html).toContain('href="/meetings"')
    for (const tag of ['<button', '<input', '<select', '<textarea', '<form', 'role="tab"', 'role="slider"']) expect(html).not.toContain(tag)
  })

  it('draws plenty of shimmer blocks and keeps them out of the accessibility tree', () => {
    const blocks = html.match(/<div aria-hidden="true" class="animate-shimmer/g) ?? []
    expect(blocks.length).toBeGreaterThanOrEqual(30)
    expect(html.match(/class="animate-shimmer/g)).toHaveLength(blocks.length)
  })
})
