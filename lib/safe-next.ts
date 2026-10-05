export function safeNext(next: string | null | undefined, fallback = '/meetings'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  try {
    const url = new URL(next, 'http://localhost')
    if (url.origin !== 'http://localhost') return fallback
    const path = url.pathname + url.search + url.hash
    // '/..//evil.com' normalizes to '//evil.com', which browsers treat as another origin.
    return path.startsWith('//') || path.startsWith('/\\') ? fallback : path
  } catch {
    return fallback
  }
}
