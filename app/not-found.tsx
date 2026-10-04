import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-2 text-muted">The call or clip may have been removed, or the link is mistyped.</p>
      <Link href="/meetings" className="mt-6 inline-block text-accent underline">Back to My Calls</Link>
    </div>
  )
}
