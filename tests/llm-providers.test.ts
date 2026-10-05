import { describe, expect, it } from 'vitest'
import { geminiClient, llmFromRequest, LlmAuthError, openaiClient } from '@/lib/llm'

type Call = { url: string; init: RequestInit }
function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { calls, impl }
}
const headersOf = (c: Call) => new Headers(c.init.headers)

describe('openaiClient', () => {
  it('posts a chat completion and returns the message text', async () => {
    const f = fakeFetch(200, { choices: [{ message: { content: 'hello' } }] })
    const text = await openaiClient('sk-key', 'm1', f.impl).complete({ system: 'sys', prompt: 'hi', maxTokens: 50 })
    expect(text).toBe('hello')
    expect(f.calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect(headersOf(f.calls[0]).get('authorization')).toBe('Bearer sk-key')
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({
      model: 'm1', max_completion_tokens: 50,
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    })
  })
  it('omits the system message when there is none', async () => {
    const f = fakeFetch(200, { choices: [{ message: { content: 'x' } }] })
    await openaiClient('k', 'm', f.impl).complete({ prompt: 'hi' })
    expect(JSON.parse(f.calls[0].init.body as string).messages).toEqual([{ role: 'user', content: 'hi' }])
  })
  it('maps 401 to LlmAuthError without leaking the body or key', async () => {
    const f = fakeFetch(401, { error: { message: 'Incorrect API key provided: sk-secret' } })
    const error = await openaiClient('sk-secret', 'm', f.impl).complete({ prompt: 'hi' }).catch((e) => e)
    expect(error).toBeInstanceOf(LlmAuthError)
    expect(String(error.message)).not.toContain('sk-secret')
  })
  it('throws a plain error with the status on other failures', async () => {
    const f = fakeFetch(500, 'oops')
    const error = await openaiClient('k', 'm', f.impl).complete({ prompt: 'hi' }).catch((e) => e)
    expect(error).not.toBeInstanceOf(LlmAuthError)
    expect(error.message).toContain('500')
  })
  it('throws when the reply has no text', async () => {
    const f = fakeFetch(200, { choices: [{ message: { content: null } }] })
    await expect(openaiClient('k', 'm', f.impl).complete({ prompt: 'hi' })).rejects.toThrow(/no text/)
  })
})

describe('geminiClient', () => {
  it('posts generateContent with the key in a header, not the URL', async () => {
    const f = fakeFetch(200, { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] })
    const text = await geminiClient('g-key', 'gm/1', f.impl).complete({ system: 'sys', prompt: 'hi', maxTokens: 70 })
    expect(text).toBe('ab')
    expect(f.calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gm%2F1:generateContent')
    expect(f.calls[0].url).not.toContain('g-key')
    expect(headersOf(f.calls[0]).get('x-goog-api-key')).toBe('g-key')
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { maxOutputTokens: 70 },
    })
  })
  it('maps 401, 403 and a 400 API_KEY_INVALID to LlmAuthError', async () => {
    for (const [status, body] of [[401, {}], [403, {}], [400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }]] as const) {
      const f = fakeFetch(status, body)
      await expect(geminiClient('k', 'm', f.impl).complete({ prompt: 'hi' })).rejects.toBeInstanceOf(LlmAuthError)
    }
  })
  it('keeps other 400s as plain errors', async () => {
    const f = fakeFetch(400, { error: { message: 'bad model' } })
    const error = await geminiClient('k', 'm', f.impl).complete({ prompt: 'hi' }).catch((e) => e)
    expect(error).not.toBeInstanceOf(LlmAuthError)
  })
  it('throws when there is no candidate text', async () => {
    const f = fakeFetch(200, { candidates: [] })
    await expect(geminiClient('k', 'm', f.impl).complete({ prompt: 'hi' })).rejects.toThrow(/no text/)
  })
})

describe('llmFromRequest', () => {
  it('uses the server key when the visitor sends none', () => {
    const r = llmFromRequest(new Headers(), 'server-key')
    expect(r).not.toBe('invalid')
    expect(r !== 'invalid' && r.llm).toBeTruthy()
    expect(r !== 'invalid' && r.model).toBeUndefined()
  })
  it('has no client when neither key exists', () => {
    expect(llmFromRequest(new Headers(), undefined)).toEqual({ llm: null })
  })
  it('prefers the visitor key and reports its model', () => {
    const r = llmFromRequest(new Headers({ 'x-llm-provider': 'openai', 'x-llm-key': 'sk-test-1234567890', 'x-llm-model': 'm' }), 'server-key')
    expect(r !== 'invalid' && r.model).toBe('m')
    expect(r !== 'invalid' && r.llm).toBeTruthy()
  })
  it('flags malformed visitor headers', () => {
    expect(llmFromRequest(new Headers({ 'x-llm-key': 'abc' }), 'server-key')).toBe('invalid')
  })
})
