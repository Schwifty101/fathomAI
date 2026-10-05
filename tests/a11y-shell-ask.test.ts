import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { focusAfterToggle } from '@/lib/ask-focus'
import { attr, attrSource, elements, parseTsx } from './a11y-shell-jsx'

describe('focusAfterToggle', () => {
  it('moves focus to the Ask Fathom button when the panel collapses', () => {
    expect(focusAfterToggle(true, false)).toBe('expand-button')
  })

  it('moves focus to the question field when the panel expands again', () => {
    expect(focusAfterToggle(false, true)).toBe('question')
  })

  it('leaves focus alone on the first render, so loading a page never steals it', () => {
    expect(focusAfterToggle(null, true)).toBeNull()
    expect(focusAfterToggle(null, false)).toBeNull()
  })

  it('leaves focus alone when the panel did not change', () => {
    expect(focusAfterToggle(true, true)).toBeNull()
    expect(focusAfterToggle(false, false)).toBeNull()
  })
})

// AskPanel is a client component; the JSX it returns is read from source (see a11y-shell-jsx.ts).
describe('AskPanel conversation region', () => {
  const source = parseTsx('components/AskPanel.tsx')
  const [log] = elements(source).filter((element) => attr(element, 'role') === 'log')

  it('is a polite live log, so a new answer and the Thinking state are announced without moving focus', () => {
    expect(log).toBeDefined()
    expect(attr(log, 'aria-live')).toBe('polite')
    expect(attr(log, 'aria-label')).toBeTruthy()
  })

  it('holds the messages and the Thinking state', () => {
    const text = log.getText()
    expect(text).toContain('messages.map')
    expect(text).toContain('Thinking')
  })

  it('is rendered whether or not there are messages, because a live region must exist before it changes', () => {
    for (let node: ts.Node | undefined = log.parent; node && !ts.isFunctionDeclaration(node); node = node.parent) {
      const conditional = ts.isConditionalExpression(node)
        || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      expect(conditional, `rendered conditionally by: ${node.getText().slice(0, 60)}`).toBe(false)
    }
  })
})

describe('AskPanel focus targets', () => {
  const source = parseTsx('components/AskPanel.tsx')
  const refOf = (tag: string, match: (element: ReturnType<typeof elements>[number]) => boolean) =>
    attrSource(elements(source, tag).find(match)!, 'ref')

  it('gives the collapsed Ask Fathom button a ref to focus', () => {
    expect(refOf('Button', (button) => button.getText().includes('>Ask Fathom<'))).toMatch(/^\{\w+\}$/)
  })

  it('gives the question field a ref to focus', () => {
    expect(refOf('input', (input) => attr(input, 'aria-label') === 'Ask a question')).toMatch(/^\{\w+\}$/)
  })
})
