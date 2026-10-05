import { describe, expect, it } from 'vitest'
import { attr, elements, literalText, parseTsx, type Jsx } from './a11y-shell-jsx'

// The list pages are async server components over the database, so these read the JSX they return (see a11y-shell-jsx.ts).
describe.each([
  ['app/meetings/page.tsx', 'My Calls'],
  ['app/team/page.tsx', 'Team Calls'],
])('%s', (file, title) => {
  const source = parseTsx(file)

  it('has exactly one h1, named like its navigation tab', () => {
    const h1 = elements(source, 'h1')
    expect(h1.map(literalText)).toEqual([title])
  })

  it('is sized and weighted like the Calendar page title', () => {
    const [h1] = elements(source, 'h1')
    const [calendar] = elements(parseTsx('app/calendar/page.tsx'), 'h1')
    const typography = (element: Jsx) => (attr(element, 'className') ?? '').split(' ').filter((name) => /^(text|font)-/.test(name))
    expect(typography(h1)).toEqual(['text-2xl', 'font-semibold'])
    expect(typography(h1)).toEqual(typography(calendar))
  })

  it('puts the title before the first section heading', () => {
    const [h1] = elements(source, 'h1')
    const firstSection = elements(source, 'h2')[0]
    expect(h1.getStart()).toBeLessThan(firstSection.getStart())
  })
})
