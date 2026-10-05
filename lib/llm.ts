import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'
import { readByoHeaders, type ByoKey } from './byo-key'

export type LlmRequest = { system?: string; prompt: string; maxTokens?: number }
export interface LlmClient {
  complete(req: LlmRequest): Promise<string>
}

// Models wrap JSON in ```json fences or prose; take the outermost JSON value.
export function extractJson(text: string): unknown {
  const t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : t
  // Prose before the JSON may itself contain [ or {, so try each opener until one parses.
  let found = false
  let lastError: unknown
  for (const { index: start } of body.matchAll(/[[{]/g)) {
    found = true
    const end = body.lastIndexOf(body[start] === '{' ? '}' : ']')
    if (end <= start) continue
    try {
      return JSON.parse(body.slice(start, end + 1))
    } catch (e) {
      lastError = e
    }
  }
  if (!found) throw new Error('no JSON found in model output')
  throw lastError instanceof Error ? lastError : new Error('unterminated JSON in model output')
}

export async function completeJson<T>(
  client: LlmClient,
  req: LlmRequest,
  schema: z.ZodType<T>,
  retries = 1,
): Promise<T> {
  let prompt = req.prompt
  let lastError = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    const text = await client.complete({ ...req, prompt })
    try {
      return schema.parse(extractJson(text))
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      prompt = `${req.prompt}\n\nYour previous reply was rejected: ${lastError.slice(0, 600)}\nReply with ONLY the corrected JSON, no commentary, no code fences.`
    }
  }
  throw new Error(`model output failed validation after ${retries + 1} attempts: ${lastError}`)
}

/** The provider rejected the key (as opposed to a transient or model failure). */
export class LlmAuthError extends Error {
  constructor(provider: string) {
    super(`${provider} rejected the API key`)
  }
}

const TIMEOUT_MS = 20_000
const isAnthropicAuth = (e: unknown) => e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError

// Messages carry the provider and status only, never the response body or the key.
async function postJson(
  provider: string, url: string, headers: Record<string, string>, body: unknown, fetchImpl: typeof fetch,
  isAuthFailure: (status: number, text: string) => boolean,
): Promise<any> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    if (isAuthFailure(res.status, await res.text().catch(() => ''))) throw new LlmAuthError(provider)
    throw new Error(`${provider} request failed (${res.status})`)
  }
  return res.json()
}

export function openaiClient(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    async complete({ system, prompt, maxTokens = 4096 }) {
      const json = await postJson('OpenAI', 'https://api.openai.com/v1/chat/completions',
        { authorization: `Bearer ${apiKey}` },
        {
          model,
          max_completion_tokens: maxTokens,
          messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
        },
        fetchImpl, (status) => status === 401 || status === 403)
      const text = json?.choices?.[0]?.message?.content
      if (typeof text !== 'string' || !text) throw new Error('OpenAI returned no text')
      return text
    },
  }
}

export function geminiClient(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    async complete({ system, prompt, maxTokens = 4096 }) {
      const json = await postJson('Gemini',
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': apiKey },
        {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        },
        fetchImpl, (status, text) => status === 401 || status === 403 || (status === 400 && /API_KEY_INVALID|API key not valid/.test(text)))
      const parts: { text?: string }[] = json?.candidates?.[0]?.content?.parts ?? []
      const text = parts.map((part) => part.text ?? '').join('')
      if (!text) throw new Error('Gemini returned no text')
      return text
    },
  }
}

export function byoClient(k: ByoKey): LlmClient {
  if (k.provider === 'openai') return openaiClient(k.apiKey, k.model)
  if (k.provider === 'gemini') return geminiClient(k.apiKey, k.model)
  return anthropicClient(k.apiKey, k.model || undefined)
}

/** Picks the model client for a request: the visitor's own key wins, else the server's, else none. */
export function llmFromRequest(
  headers: Headers, serverAnthropicKey: string | undefined,
): { llm: LlmClient | null; model?: string } | 'invalid' {
  const byo = readByoHeaders(headers)
  if (byo === 'invalid') return 'invalid'
  if (byo) return { llm: byoClient(byo), model: byo.model || undefined }
  return { llm: serverAnthropicKey ? anthropicClient(serverAnthropicKey) : null }
}

export function anthropicClient(
  apiKey: string,
  model: string = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
): LlmClient {
  const sdk = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 0 })
  return {
    async complete({ system, prompt, maxTokens = 4096 }) {
      try {
        const res = await sdk.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
        })
        return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      } catch (e) {
        throw isAnthropicAuth(e) ? new LlmAuthError('Anthropic') : e
      }
    },
  }
}
