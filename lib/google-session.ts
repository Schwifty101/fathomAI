import { GoogleAuthError, refreshAccessToken } from '@/lib/google-calendar'
import { sealToken, unsealToken } from '@/lib/token-seal'

export const GCAL_COOKIE = 'fathom_gcal'
export const GCAL_COOKIE_OPTIONS = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/' as const,
  maxAge: 60 * 60 * 24 * 180,
}

/** Seals the refresh token together with the user id so the cookie only works for that user. */
export function sealConnection(
  userId: string,
  refreshToken: string | null | undefined,
  secret: string | undefined,
): string | null {
  if (!refreshToken || !secret || secret.length < 32) return null
  return sealToken(JSON.stringify({ uid: userId, rt: refreshToken }), secret)
}

export type Access = { status: 'ok'; token: string } | { status: 'none' } | { status: 'revoked' }

export async function accessTokenFor(
  cookieValue: string | undefined,
  userId: string,
  env: { secret?: string; clientId?: string; clientSecret?: string },
  fetchImpl?: typeof fetch,
): Promise<Access> {
  const { secret, clientId, clientSecret } = env
  if (!cookieValue || !secret || !clientId || !clientSecret) return { status: 'none' }
  const plain = unsealToken(cookieValue, secret)
  if (!plain) return { status: 'none' }
  let parsed: { uid?: unknown; rt?: unknown } | null
  try {
    parsed = JSON.parse(plain)
  } catch {
    return { status: 'none' }
  }
  if (!parsed || typeof parsed !== 'object' || parsed.uid !== userId || typeof parsed.rt !== 'string' || !parsed.rt) {
    return { status: 'none' }
  }
  try {
    return { status: 'ok', token: await refreshAccessToken({ clientId, clientSecret, refreshToken: parsed.rt }, fetchImpl) }
  } catch (e) {
    if (e instanceof GoogleAuthError) return { status: 'revoked' }
    throw e
  }
}
