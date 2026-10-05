import { Card } from '@/components/ui/Card'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'

// Mirrors app/team/page.tsx: same grid, stat cards, TeamTable columns, filter row, month grid and Ask aside.
const HEADERS = ['Member', 'Calls', 'Talk share', 'Questions', 'Longest monologue']

export default function TeamLoading() {
  return (
    <LoadingRegion label="team calls">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-8">
          <h1 className="text-2xl font-semibold">Team Calls</h1>
          <div className="grid gap-4 sm:grid-cols-3">
            {['Calls', 'Avg talk share', 'Team members'].map((label) => (
              <Card key={label} className="p-4">
                <p className="text-sm text-muted">{label}</p>
                <div className="flex h-9 items-center"><Skeleton className="h-7 w-14" /></div>
              </Card>
            ))}
          </div>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Team members</h2>
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="bg-surface text-muted">
                  <tr>
                    {HEADERS.map((header) => <th key={header} scope="col" className="px-4 py-2 font-medium">{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }, (_, row) => (
                    <tr key={row} className="border-t border-border">
                      <td className="px-4 py-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="mt-1 h-3 w-20" />
                      </td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-6" /></td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-10" /></td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-6" /></td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-12" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-xl font-semibold">Team calls</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-10 w-32 rounded-lg" />
                <Skeleton className="h-10 w-32 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
            <div className="mb-8">
              <div className="mb-3 flex h-5 items-center"><Skeleton className="h-3.5 w-24" /></div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, card) => (
                  <Card key={card} className="overflow-hidden">
                    <Skeleton className="aspect-video w-full rounded-none!" />
                    <div className="space-y-1.5 p-3">
                      <div className="flex h-6 items-center"><Skeleton className="h-4 w-3/4" /></div>
                      <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-1/2" /></div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="flex w-full flex-col gap-3 rounded-card border border-border bg-surface p-4 lg:w-[360px] lg:self-start">
          <h2 className="text-sm font-semibold">Ask Fathom</h2>
          <div className="min-h-24 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-6 w-40 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-14 rounded-lg" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  )
}
