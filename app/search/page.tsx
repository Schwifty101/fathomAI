import Link from 'next/link'
import { formatMs } from '@/lib/format'
import { searchSegments } from '@/lib/queries'
import { normalizeQuery, splitMarks } from '@/lib/snippet'
import { createClient } from '@/lib/supabase/server'
import type { SearchHit } from '@/lib/types'

const SUGGESTIONS = ['budget', 'deadline', 'customer', 'rollback', 'onboarding']

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const query = normalizeQuery((await searchParams).q)
  const hits = query ? await searchSegments(await createClient(), query, {}, 40) : []
  const groups = new Map<string, { title: string; hits: SearchHit[] }>()
  for (const hit of hits) {
    const group = groups.get(hit.meeting_slug) ?? { title: hit.meeting_title, hits: [] }
    group.hits.push(hit)
    groups.set(hit.meeting_slug, group)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{query ? <>Results for “{query}”</> : 'Search call recordings'}</h1>
      {!query && (
        <div className="space-y-2">
          <p className="text-muted">Search every transcript. Try:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <Link key={suggestion} href={`/search?q=${encodeURIComponent(suggestion)}`} className="rounded-full border border-border px-3 py-1 text-sm hover:bg-surface-2">
                {suggestion}
              </Link>
            ))}
          </div>
        </div>
      )}
      {query && hits.length === 0 && (
        <p className="text-muted">No matches. Try fewer or different words, or one of: {SUGGESTIONS.join(', ')}.</p>
      )}
      {[...groups.entries()].map(([slug, group]) => (
        <section key={slug}>
          <h2 className="mb-2 font-medium">{group.title}</h2>
          <ul className="space-y-2">
            {group.hits.map((hit) => (
              <li key={`${slug}-${hit.segment_idx}`}>
                <Link
                  href={`/meetings/${slug}?t=${hit.start_ms}`}
                  className="block rounded-lg border border-border bg-surface p-3 text-sm transition hover:border-accent"
                >
                  <span className="text-xs text-muted">{hit.speaker} · {formatMs(hit.start_ms)}</span>
                  <p>
                    {splitMarks(hit.snippet).map((part, index) => part.mark
                      ? <mark key={index} className="rounded bg-accent/30 text-fg">{part.text}</mark>
                      : <span key={index}>{part.text}</span>,
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
