import Link from 'next/link'
import { AuthButton } from '@/components/AuthButton'
import { NavTabs } from '@/components/NavTabs'
import { SearchBar } from '@/components/SearchBar'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function Header() {
  const user = await getUser(await createClient())
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/meetings" className="text-lg font-semibold tracking-tight">Fathom Rebuild</Link>
        <SearchBar />
        <div className="ml-auto flex items-center gap-4">
          <NavTabs />
          <AuthButton user={user} />
        </div>
      </div>
    </header>
  )
}
