'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/meetings', label: 'My Calls' },
  { href: '/team', label: 'Team Calls' },
  { href: '/calendar', label: 'Calendar' },
]

export function NavTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Primary" className="flex gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition ${active ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'}`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
