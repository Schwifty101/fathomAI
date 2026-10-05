import { describe, expect, it } from 'vitest'
import { attr, elements, literalText, parseTsx, tsxFiles } from './a11y-shell-jsx'

const layout = parseTsx('app/layout.tsx')
const classes = (value: string | undefined) => (value ?? '').split(/\s+/)

describe('skip link in the root layout', () => {
  const [link] = elements(layout, 'a')
  const [main] = elements(layout, 'main')

  it('has one link, worded as a skip link', () => {
    expect(elements(layout, 'a')).toHaveLength(1)
    expect(literalText(link)).toBe('Skip to main content')
  })

  it('targets the id of the main landmark', () => {
    const href = attr(link, 'href')
    expect(href).toMatch(/^#.+/)
    expect(attr(main, 'id')).toBe(href!.slice(1))
  })

  it('comes before the header, so it is the first Tab stop', () => {
    const [header] = elements(layout, 'Header')
    expect(link.getStart()).toBeLessThan(header.getStart())
  })

  it('is hidden visually until it takes keyboard focus', () => {
    expect(classes(attr(link, 'className'))).toEqual(expect.arrayContaining(['sr-only', 'focus:not-sr-only']))
  })

  it('shows above the sticky header (z-40) when focused', () => {
    expect(classes(attr(link, 'className'))).toEqual(expect.arrayContaining(['focus:fixed', 'focus:z-50']))
  })

  it('does not make the landmark a tab stop but lets the skip target take focus', () => {
    const open = main.getText().slice(0, main.getText().indexOf('>'))
    expect(open).toContain('tabIndex={-1}')
  })
})

describe('main landmark', () => {
  it('is rendered once, by the layout, so pages never nest a second one', () => {
    const owners = [...tsxFiles('app'), ...tsxFiles('components')].filter((file) => elements(parseTsx(file), 'main').length > 0)
    expect(owners).toEqual(['app/layout.tsx'])
  })
})
