'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { signInWithGoogle } from '@/lib/supabase/client'

export function SignInDialog({
  open,
  onClose,
  message,
  next,
}: {
  open: boolean
  onClose: () => void
  message: string
  next: () => string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(92vw,26rem)] rounded-card border border-border bg-surface p-6 text-fg backdrop:bg-black/60"
    >
      <h2 className="text-lg font-semibold">Sign in to continue</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Not now</Button>
        <Button variant="primary" onClick={() => signInWithGoogle(next())}>Sign in with Google</Button>
      </div>
    </dialog>
  )
}
