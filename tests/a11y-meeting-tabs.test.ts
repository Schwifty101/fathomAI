import { describe, expect, it } from 'vitest'
import { panelElementId, tabControls, tabElementId } from '@/lib/tabs'

// Tabs unmounts every panel but the selected one, so only the selected tab may name a panel in aria-controls: an id
// that is not in the document is invalid. The wiring lives in lib/tabs.ts because vitest cannot import a .tsx file
// under the project's tsconfig (jsx: preserve).

const ids = ['summary', 'actions', 'highlights', 'chapters', 'ask']

describe('tab and panel ids', () => {
  it('keeps the element id scheme', () => {
    expect(tabElementId('summary')).toBe('tab-summary')
    expect(panelElementId('summary')).toBe('panel-summary')
  })
})

describe('tabControls', () => {
  it('names the rendered panel on the selected tab', () => {
    expect(tabControls('actions', 'actions')).toBe(panelElementId('actions'))
  })

  it('names nothing on a tab whose panel is not rendered', () => {
    expect(tabControls('summary', 'actions')).toBeUndefined()
  })

  it.each(ids)('references exactly one panel, the rendered one, when %s is selected', (selected) => {
    const referenced = ids.map((id) => tabControls(id, selected)).filter((value) => value !== undefined)
    expect(referenced).toEqual([panelElementId(selected)])
  })
})
