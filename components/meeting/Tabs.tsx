'use client'

import { useRef, useState } from 'react'
import { rovingTarget } from '@/lib/roving'
import { panelElementId, tabControls, tabElementId } from '@/lib/tabs'

export type TabDef = { id: string; label: string; content: React.ReactNode }

// WAI-ARIA tabs pattern: one tab stop, arrows move between tabs (selection follows focus), Home and End jump.
const TAB_KEYS = { prev: 'ArrowLeft', next: 'ArrowRight', wrap: true }

export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const [id, setId] = useState(tabs[0].id)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = tabs.find((tab) => tab.id === id) ?? tabs[0]
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const target = rovingTarget(event, index, tabs.length, TAB_KEYS)
    if (target === null) return
    event.preventDefault()
    setId(tabs[target].id)
    refs.current[target]?.focus()
  }
  return (
    <div>
      <div role="tablist" aria-label="Meeting details" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => { refs.current[index] = element }}
            role="tab"
            id={tabElementId(tab.id)}
            aria-selected={tab.id === current.id}
            aria-controls={tabControls(tab.id, current.id)}
            tabIndex={tab.id === current.id ? 0 : -1}
            onClick={() => setId(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`whitespace-nowrap px-3 py-2 text-sm transition ${tab.id === current.id ? 'border-b-2 border-accent text-fg' : 'text-muted hover:text-fg'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelElementId(current.id)} aria-labelledby={tabElementId(current.id)} className="pt-4">
        {current.content}
      </div>
    </div>
  )
}
