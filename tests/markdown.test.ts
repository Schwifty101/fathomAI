import { describe, expect, it } from 'vitest'
import { actionItemsToMarkdown, summaryToMarkdown } from '@/lib/markdown'

describe('summaryToMarkdown', () => {
  it('renders title, template label, sections and bullets', () => {
    const markdown = summaryToMarkdown('Q4 Planning', 'General', {
      sections: [{ heading: 'Overview', bullets: ['A', 'B'] }, { heading: 'Decisions', bullets: ['C'] }],
    })
    expect(markdown).toBe('# Q4 Planning\n_General summary_\n\n## Overview\n- A\n- B\n\n## Decisions\n- C\n')
  })
})

describe('actionItemsToMarkdown', () => {
  it('renders a checklist with optional due dates', () => {
    expect(actionItemsToMarkdown([
      { owner: 'Ann', task: 'Ship it', due: '2026-10-09' },
      { owner: 'Bob', task: 'Fix login', due: null },
    ])).toBe('- [ ] Ann: Ship it (due 2026-10-09)\n- [ ] Bob: Fix login\n')
  })

  it('is empty for no items', () => {
    expect(actionItemsToMarkdown([])).toBe('')
  })
})
