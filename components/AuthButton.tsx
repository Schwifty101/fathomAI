'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Button } from '@/components/ui/Button'
import type { AppUser } from '@/lib/auth'
import { signOutWithToast } from '@/lib/sign-out'
import { createClient, signInWithGoogle } from '@/lib/supabase/client'

function Inner({ user }: { user: AppUser | null }) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const router = useRouter()
  if (!user) {
    return (
      <Button size="sm" variant="primary" onClick={() => signInWithGoogle(pathname + (search ? `?${search}` : ''))}>
        Sign in with Google
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      {user.avatar ? (
        <img src={user.avatar} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs">{(user.email ?? '?')[0].toUpperCase()}</span>
      )}
      <Button size="sm" variant="ghost" onClick={() => signOutWithToast(() => createClient().auth, () => router.refresh())}>
        Sign out
      </Button>
    </div>
  )
}

export function AuthButton({ user }: { user: AppUser | null }) {
  return <Suspense fallback={null}><Inner user={user} /></Suspense>
}
