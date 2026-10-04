import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'

export type LlmRequest = { system?: string; prompt: string; maxTokens?: number }
export interface LlmClient {
  complete(req: LlmRequest): Promise<string>
}

// Models wrap JSON in ```json fences or prose; take the outermost JSON value.
export function extractJson(text: string): unknown {
  const t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : t
  const start = body.search(/[[{]/)
  if (start === -1) throw new Error('no JSON found in model output')
  const close = body[start] === '{' ? '}' : ']'
  const end = body.lastIndexOf(close)
  if (end <= start) throw new Error('unterminated JSON in model output')
  return JSON.parse(body.slice(start, end + 1))
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

export function anthropicClient(
  apiKey: string,
  model: string = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
): LlmClient {
  const sdk = new Anthropic({ apiKey })
  return {
    async complete({ system, prompt, maxTokens = 4096 }) {
      const res = await sdk.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      })
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    },
  }
}
