import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Refuses to run a script that writes to Supabase unless the target is the one we meant.
// Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPECT_SUPABASE_REF (only
// consulted/required when supabase/.temp/project-ref is absent; if both exist they must agree).

export const refOf = (url: string): string => {
  const host = new URL(url).hostname
  return host.endsWith('.supabase.co') ? host.split('.')[0] : host
}

export function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

// Keys defined in a dotenv-style file (name -> value), enough for KEY=value / quotes / export / comments.
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    let value = m[2]
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) value = value.slice(1, value.lastIndexOf(quote))
    else value = value.replace(/\s+#.*$/, '')
    out[m[1]] = value
  }
  return out
}

// `node --env-file` never overrides variables already in the environment, so a stale shell export
// would silently win over .env.local. Returns the names (never values) that differ.
export function envConflicts(fileText: string, env: Record<string, string | undefined>): string[] {
  return Object.entries(parseEnvFile(fileText)).filter(([k, v]) => env[k] !== undefined && env[k] !== v).map(([k]) => k)
}

export function checkTarget(i: {
  url?: string
  serviceKey?: string
  linkedRef?: string
  expectRef?: string
  envFileText?: string
  env: Record<string, string | undefined>
}): { host: string; ref: string; errors: string[] } {
  const errors: string[] = []
  if (!i.url) return { host: '', ref: '', errors: ['NEXT_PUBLIC_SUPABASE_URL is not set'] }
  let host = ''
  let ref = ''
  try {
    host = new URL(i.url).host
    ref = refOf(i.url)
  } catch {
    return { host: '', ref: '', errors: ['NEXT_PUBLIC_SUPABASE_URL is not a valid URL'] }
  }
  const linked = i.linkedRef?.trim()
  const expect = i.expectRef?.trim()
  if (!linked && !expect) errors.push('no expected ref: link the project (supabase/.temp/project-ref) or set EXPECT_SUPABASE_REF')
  if (linked && linked !== ref) errors.push(`URL ref ${ref} != linked ref ${linked}`)
  if (expect && expect !== ref) errors.push(`URL ref ${ref} != EXPECT_SUPABASE_REF ${expect}`)

  const key = i.serviceKey ?? ''
  if (!key.startsWith('sb_secret_')) { // new-style secret keys are opaque; legacy keys are JWTs
    const payload = jwtPayload(key)
    if (payload?.role !== 'service_role') errors.push('SUPABASE_SERVICE_ROLE_KEY is not a service_role key')
    else if (typeof payload.ref === 'string' && payload.ref !== ref) errors.push(`service key is for project ${payload.ref}, URL is ${ref}`)
  }

  if (i.envFileText) {
    const bad = envConflicts(i.envFileText, i.env)
    if (bad.length) errors.push(`process.env overrides .env.local for: ${bad.join(', ')} (unset them in the shell)`)
  }
  return { host, ref, errors }
}

export function guardTarget(cwd = process.cwd()): void {
  const read = (p: string) => (existsSync(join(cwd, p)) ? readFileSync(join(cwd, p), 'utf8') : undefined)
  const { host, ref, errors } = checkTarget({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    linkedRef: read('supabase/.temp/project-ref'),
    expectRef: process.env.EXPECT_SUPABASE_REF,
    envFileText: read('.env.local'),
    env: process.env,
  })
  console.log(`target: ${host || '(none)'}  ref: ${ref || '(none)'}`)
  if (errors.length) {
    errors.forEach((e) => console.error(`REFUSING: ${e}`))
    process.exit(1)
  }
}
