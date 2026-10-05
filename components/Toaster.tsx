'use client'

import { useEffect, useState } from 'react'

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const show = (text: string) => {
      setMessage(text)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), 3500)
    }
    const onToast = (event: Event) => show((event as CustomEvent<string>).detail)
    window.addEventListener('toast', onToast)
    // The OAuth callback redirects here with ?auth_error=1 when the code exchange fails.
    const url = new URL(location.href)
    if (url.searchParams.has('auth_error')) {
      url.searchParams.delete('auth_error')
      show("Couldn't sign you in. Please try again.")
      history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    return () => {
      window.removeEventListener('toast', onToast)
      clearTimeout(timer)
    }
  }, [])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {message && <div className="animate-fade-up rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm shadow-lg">{message}</div>}
    </div>
  )
}
