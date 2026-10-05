import { describe, expect, it } from 'vitest'
import { byoHeaders, readByoHeaders, validateByoKey } from '@/lib/byo-key'

const ok = { provider: 'openai', apiKey: 'sk-test-1234567890', model: 'some-model' } as const

describe('validateByoKey', () => {
  it('accepts a well-formed key and trims it', () => {
    expect(validateByoKey({ ...ok, apiKey: `  ${ok.apiKey}  ` })).toEqual(ok)
  })
  it('requires a model for OpenAI and Gemini but not Anthropic', () => {
    expect(validateByoKey({ ...ok, model: '' })).toBeNull()
    expect(validateByoKey({ ...ok, provider: 'gemini', model: '' })).toBeNull()
    expect(validateByoKey({ provider: 'anthropic', apiKey: ok.apiKey, model: '' })).toEqual({ provider: 'anthropic', apiKey: ok.apiKey, model: '' })
  })
  it.each([
    ['unknown provider', { ...ok, provider: 'mistral' }],
    ['short key', { ...ok, apiKey: 'abc' }],
    ['key with a space', { ...ok, apiKey: 'sk-test 1234567890' }],
    ['key with a newline', { ...ok, apiKey: 'sk-test-1234567890\nx' }],
    ['non-ascii key', { ...ok, apiKey: 'sk-tést-1234567890' }],
    ['overlong key', { ...ok, apiKey: 'k'.repeat(401) }],
    ['model with a slash path trick', { ...ok, model: '../models' }],
    ['model with a space', { ...ok, model: 'a b' }],
    ['not an object', 'sk-test'],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(validateByoKey(value)).toBeNull()
  })
})

describe('headers', () => {
  it('round-trips through byoHeaders and readByoHeaders', () => {
    expect(readByoHeaders(new Headers(byoHeaders(ok)))).toEqual(ok)
  })
  it('omits the model header when empty', () => {
    const k = { provider: 'anthropic', apiKey: ok.apiKey, model: '' } as const
    expect(byoHeaders(k)).not.toHaveProperty('x-llm-model')
    expect(readByoHeaders(new Headers(byoHeaders(k)))).toEqual(k)
  })
  it('returns null when no header is sent', () => {
    expect(readByoHeaders(new Headers())).toBeNull()
  })
  it('returns invalid when the headers are partial or malformed', () => {
    expect(readByoHeaders(new Headers({ 'x-llm-key': ok.apiKey }))).toBe('invalid')
    expect(readByoHeaders(new Headers({ 'x-llm-provider': 'openai', 'x-llm-key': 'abc', 'x-llm-model': 'm' }))).toBe('invalid')
  })
})
