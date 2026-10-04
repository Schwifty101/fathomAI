export type SnippetPart = { text: string; mark: boolean }

// ts_headline wraps hits in <mark>; other markup remains plain text.
export function splitMarks(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let last = 0
  for (const match of snippet.matchAll(/<mark>([\s\S]*?)<\/mark>/g)) {
    const at = match.index ?? 0
    if (at > last) parts.push({ text: snippet.slice(last, at), mark: false })
    parts.push({ text: match[1], mark: true })
    last = at + match[0].length
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last), mark: false })
  return parts
}

export const stripMarks = (snippet: string) => snippet.replace(/<\/?mark>/g, '')

export function normalizeQuery(raw: string | string[] | undefined): string {
  const text = Array.isArray(raw) ? raw[0] : raw
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
}

export function toOrQuery(question: string): string {
  const words = [...new Set((question.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    .filter((word) => word.length > 2))].slice(0, 8)
  return words.length ? words.join(' or ') : question
}
