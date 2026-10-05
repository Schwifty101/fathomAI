import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LlmKeyForm } from '@/components/LlmKeyForm'
import { byoRequestHeaders, clearByoKey, loadByoKey, saveByoKey } from '@/lib/byo-key-store'

const key = { provider: 'gemini', apiKey: 'g-test-1234567890', model: 'some-model' } as const

function stubStorage(throwing = false) {
  const data = new Map<string, string>()
  const guard = () => { if (throwing) throw new Error('blocked') }
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => { guard(); return data.get(k) ?? null },
    setItem: (k: string, v: string) => { guard(); data.set(k, v) },
    removeItem: (k: string) => { guard(); data.delete(k) },
  }
  return data
}

describe('byo key store', () => {
  beforeEach(() => { stubStorage() })
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage })

  it('saves, loads, builds request headers and clears', () => {
    expect(loadByoKey()).toBeNull()
    expect(byoRequestHeaders()).toEqual({})
    expect(saveByoKey(key)).toBe(true)
    expect(loadByoKey()).toEqual(key)
    expect(byoRequestHeaders()).toEqual({ 'x-llm-provider': 'gemini', 'x-llm-key': key.apiKey, 'x-llm-model': key.model })
    clearByoKey()
    expect(loadByoKey()).toBeNull()
  })
  it('ignores a corrupt or tampered stored value', () => {
    const data = stubStorage()
    data.set('fathom.llmKey', '{not json')
    expect(loadByoKey()).toBeNull()
    data.set('fathom.llmKey', JSON.stringify({ provider: 'openai', apiKey: 'x y', model: 'm' }))
    expect(loadByoKey()).toBeNull()
  })
  it('reports failure when the browser refuses storage, and never throws', () => {
    stubStorage(true)
    expect(saveByoKey(key)).toBe(false)
    expect(loadByoKey()).toBeNull()
    expect(() => clearByoKey()).not.toThrow()
  })
})

describe('LlmKeyForm', () => {
  it('renders labelled fields with the key masked, and discloses where the key goes', () => {
    const html = renderToStaticMarkup(createElement(LlmKeyForm))
    expect(html).toContain('type="password"')
    for (const label of ['Provider', 'API key', 'Model']) expect(html).toContain(label)
    expect(html).toContain('never stores or logs it')
    expect(html).toContain('Anthropic')
    expect(html).toContain('OpenAI')
    expect(html).toContain('Google Gemini')
  })
})
