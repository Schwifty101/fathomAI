import { describe, expect, it, vi } from 'vitest'
import { signOutWithToast } from '@/lib/sign-out'
import { elements, parseTsx } from './a11y-shell-jsx'

const FAILURE = "Couldn't sign you out. Please try again."

function setup(signOut: () => Promise<{ error: unknown }>) {
  const refresh = vi.fn()
  const notify = vi.fn()
  return { refresh, notify, run: () => signOutWithToast(() => ({ signOut }), refresh, notify) }
}

describe('signOutWithToast', () => {
  it('refreshes without a message when sign-out works', async () => {
    const { run, refresh, notify } = setup(async () => ({ error: null }))
    await run()
    expect(notify).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  // supabase-js reports most failures (network, 5xx) as a returned error, not a throw.
  it('tells the user when supabase returns an error', async () => {
    const { run, notify } = setup(async () => ({ error: new Error('network') }))
    await run()
    expect(notify).toHaveBeenCalledExactlyOnceWith(FAILURE)
  })

  it('tells the user when sign-out throws, instead of rejecting', async () => {
    const { run, notify } = setup(async () => { throw new Error('lock timeout') })
    await expect(run()).resolves.toBeUndefined()
    expect(notify).toHaveBeenCalledExactlyOnceWith(FAILURE)
  })

  it('tells the user when the client cannot even be created', async () => {
    const refresh = vi.fn()
    const notify = vi.fn()
    const run = signOutWithToast(() => { throw new Error('missing env') }, refresh, notify)
    await expect(run).resolves.toBeUndefined()
    expect(notify).toHaveBeenCalledExactlyOnceWith(FAILURE)
  })

  // supabase-js drops the local session before returning a server error (GoTrueClient._signOut), so the header
  // must re-read the cookies either way or it would keep showing a signed-in user.
  it('still refreshes after a failure', async () => {
    const { run, refresh } = setup(async () => ({ error: new Error('network') }))
    await run()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('AuthButton', () => {
  it('signs out through the handler, not by calling auth.signOut() with no error handling', () => {
    const source = parseTsx('components/AuthButton.tsx')
    expect(source.getText()).toContain('signOutWithToast(')
    expect(source.getText()).not.toMatch(/auth\.signOut\(/)
    const signOutButton = elements(source, 'Button').find((button) => button.getText().includes('Sign out'))
    expect(signOutButton).toBeDefined()
  })
})
