// A visitor's own LLM key. It lives in the visitor's browser (see byo-key-store.ts) and travels to the
// server in these headers on each Ask or Regenerate call. The server uses it for that call only.
export const PROVIDERS = ['anthropic', 'openai', 'gemini'] as const
export type Provider = (typeof PROVIDERS)[number]
export const PROVIDER_LABELS: Record<Provider, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' }

export type ByoKey = { provider: Provider; apiKey: string; model: string }

const HEADER = { provider: 'x-llm-provider', key: 'x-llm-key', model: 'x-llm-model' } as const
const KEY = /^[\x21-\x7e]{8,400}$/ // printable ASCII, no whitespace: safe in an HTTP header
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/

/** Anthropic falls back to the app's default model, so only the other two providers need one. */
export const needsModel = (provider: Provider) => provider !== 'anthropic'

export function validateByoKey(value: unknown): ByoKey | null {
  if (typeof value !== 'object' || value === null) return null
  const { provider, apiKey, model } = value as Record<string, unknown>
  if (!PROVIDERS.includes(provider as Provider) || typeof apiKey !== 'string') return null
  const key = apiKey.trim()
  const name = typeof model === 'string' ? model.trim() : ''
  if (!KEY.test(key)) return null
  if (name ? !MODEL.test(name) : needsModel(provider as Provider)) return null
  return { provider: provider as Provider, apiKey: key, model: name }
}

export function byoHeaders(k: ByoKey): Record<string, string> {
  return {
    [HEADER.provider]: k.provider,
    [HEADER.key]: k.apiKey,
    ...(k.model ? { [HEADER.model]: k.model } : {}),
  }
}

/** null: the visitor sent no key. 'invalid': they sent something, and it is not usable. */
export function readByoHeaders(headers: Headers): ByoKey | null | 'invalid' {
  const provider = headers.get(HEADER.provider)
  const apiKey = headers.get(HEADER.key)
  const model = headers.get(HEADER.model)
  if (provider === null && apiKey === null && model === null) return null
  return validateByoKey({ provider, apiKey, model }) ?? 'invalid'
}
