'use client'

import { useState } from 'react'

export type TabDef = { id: string; label: string; content: React.ReactNode }

export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const [id, setId] = useState(tabs[0].id)
  const current = tabs.find((tab) => tab.id === id) ?? tabs[0]
  return (
    <div>
      <div role="tablist" aria-label="Meeting details" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === current.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setId(tab.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm transition ${tab.id === current.id ? 'border-b-2 border-accent text-fg' : 'text-muted hover:text-fg'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="pt-4">
        {current.content}
      </div>
    </div>
  )
}
