'use client'

import { useEffect, useState } from 'react'

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onToast = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), 3500)
    }
    window.addEventListener('toast', onToast)
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
