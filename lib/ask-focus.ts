export type AskFocusTarget = 'expand-button' | 'question'

/**
 * Where keyboard focus goes after the Ask panel collapses or expands. The button that was pressed unmounts in both
 * directions, so without this focus drops to the page. Returns null (leave focus alone) on the first render, so
 * loading a page never steals it, and whenever the panel did not change.
 */
export function focusAfterToggle(wasOpen: boolean | null, isOpen: boolean): AskFocusTarget | null {
  if (wasOpen === null || wasOpen === isOpen) return null
  return isOpen ? 'question' : 'expand-button'
}
