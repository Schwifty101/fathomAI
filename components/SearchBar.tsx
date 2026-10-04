export function SearchBar() {
  return (
    <form action="/search" role="search" className="w-full max-w-md">
      <input
        name="q"
        type="search"
        maxLength={200}
        placeholder="Search call recordings"
        aria-label="Search call recordings"
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
    </form>
  )
}
