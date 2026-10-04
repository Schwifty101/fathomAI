export function safeNext(next: string | null | undefined, fallback = '/meetings'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  try {
    const url = new URL(next, 'http://localhost')
    if (url.origin !== 'http://localhost') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
