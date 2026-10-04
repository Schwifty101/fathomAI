'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { summaryToMarkdown } from '@/lib/markdown'
import { TEMPLATE_LABELS, TEMPLATES, type SummaryContent, type Template } from '@/lib/schema'
import { toast } from '@/lib/toast'

type Entry = { content: SummaryContent; source: 'seed' | 'live' }
export type Regen = {
  enabled: boolean
  signedIn: boolean
  onNeedSignIn: () => void
  run: (template: Template) => Promise<SummaryContent>
}

export function SummaryTab({
  title,
  summaries,
  regen,
}: {
  title: string
  summaries: Partial<Record<Template, Entry>>
  regen?: Regen
}) {
  const available = TEMPLATES.filter((template) => summaries[template])
  const [template, setTemplate] = useState<Template>(available[0] ?? 'general')
  const [local, setLocal] = useState<Partial<Record<Template, Entry>>>({})
  const [busy, setBusy] = useState(false)
  const entry = local[template] ?? summaries[template]

  if (!entry) return <p className="text-muted">No summary is available for this call yet.</p>

  async function regenerate() {
    if (!regen) return
    if (!regen.signedIn) return regen.onNeedSignIn()
    setBusy(true)
    try {
      const content = await regen.run(template)
      setLocal((current) => ({ ...current, [template]: { content, source: 'live' } }))
      toast('Summary regenerated')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not regenerate')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Summary template" className="flex flex-wrap gap-1">
        {available.map((value) => (
          <button
            key={value}
            aria-pressed={value === template}
            onClick={() => setTemplate(value)}
            className={`rounded-full border px-3 py-1 text-sm transition ${value === template ? 'border-accent bg-surface-2 text-fg' : 'border-border text-muted hover:text-fg'}`}
          >
            {TEMPLATE_LABELS[value]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>{entry.source === 'live' ? 'Generated live' : 'Pre-generated'}</Chip>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(summaryToMarkdown(title, TEMPLATE_LABELS[template], entry.content))
            toast('Summary copied')
          }}
        >
          Copy
        </Button>
        {regen && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!regen.enabled || busy}
            title={regen.enabled ? undefined : 'Live regeneration is unavailable'}
            onClick={regenerate}
          >
            {busy ? 'Regenerating…' : 'Regenerate with AI'}
          </Button>
        )}
      </div>
      {regen && !regen.enabled && <p className="text-xs text-muted">Live regeneration is unavailable. You can still read the pre-generated summary.</p>}
      {entry.content.sections.map((section) => (
        <section key={section.heading}>
          <h3 className="mb-1 text-sm font-semibold">{section.heading}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {section.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}
