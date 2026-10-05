'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">We couldn&apos;t load this page. Please try again.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
        Try again
      </button>
    </div>
  )
}
