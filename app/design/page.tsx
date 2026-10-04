import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { HIGHLIGHT_TYPES, HIGHLIGHT_META, hlColor } from '@/lib/schema'

const TOKENS = ['bg', 'surface', 'surface-2', 'fg', 'muted', 'border', 'accent', 'danger']

export default function DesignPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:py-14">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">Fathom rebuild</p>
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">Design system</h1>
        <p className="max-w-2xl text-base text-muted">A quiet workspace for finding the moments that move work forward.</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Color tokens</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOKENS.map((token) => (
            <div key={token} className="space-y-1">
              <div className="h-12 rounded-lg border border-border" style={{ background: `var(--color-${token})` }} />
              <p className="text-xs text-muted">{token}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Highlight types</h2>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHT_TYPES.map((type) => (
            <Chip key={type} color={hlColor(type)}>{HIGHLIGHT_META[type].label}</Chip>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Card and motion</h2>
        <Card className="animate-fade-up p-5">
          <p className="font-medium">Q4 Product Planning</p>
          <p className="text-sm text-muted">Zoom · Priya Raman · Oct 3</p>
        </Card>
      </section>
    </div>
  )
}
