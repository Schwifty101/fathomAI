export const tabElementId = (id: string) => `tab-${id}`
export const panelElementId = (id: string) => `panel-${id}`

/**
 * What a tab names in aria-controls. Only the selected tab's panel is rendered (the others unmount), and an
 * aria-controls that points at an id missing from the document is invalid, so every other tab names nothing.
 */
export const tabControls = (id: string, selectedId: string): string | undefined =>
  id === selectedId ? panelElementId(id) : undefined
