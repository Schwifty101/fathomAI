import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Card } from '@/components/ui/Card'

describe('jsx trial', () => {
  it('renders a real .tsx component to markup', () => {
    const html = renderToStaticMarkup(createElement(Card, null, 'hello'))
    expect(html).toContain('hello')
  })
})
