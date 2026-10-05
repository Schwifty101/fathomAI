'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { needsModel, PROVIDER_LABELS, PROVIDERS, validateByoKey, type Provider } from '@/lib/byo-key'
import { clearByoKey, saveByoKey, useByoKey } from '@/lib/byo-key-store'
import { toast } from '@/lib/toast'

const field = 'h-9 rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-muted'

export function LlmKeyForm() {
  const saved = useByoKey()
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState('')

  function save(event: React.FormEvent) {
    event.preventDefault()
    const key = validateByoKey({ provider, apiKey, model })
    if (!key) {
      setError(needsModel(provider) && !model.trim()
        ? `${PROVIDER_LABELS[provider]} needs a model name.`
        : 'That key or model name does not look valid.')
      return
    }
    if (!saveByoKey(key)) {
      setError('This browser would not store the key.')
      return
    }
    setError('')
    setApiKey('')
    toast('API key saved in this browser')
  }

  return (
    <details className="rounded-lg border border-border text-sm">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">
        Your AI key{saved ? ` · ${PROVIDER_LABELS[saved.provider]} saved` : ''}
      </summary>
      <form onSubmit={save} className="flex flex-col gap-2 border-t border-border p-3">
        <p className="text-xs text-muted">
          Use your own Anthropic, OpenAI or Gemini key for live answers and summary regeneration. It is kept in this
          browser only and sent with each request over HTTPS; the server uses it for that call and never stores or logs it.
          You need to be signed in.
        </p>
        <label className="flex flex-col gap-1 text-xs">
          Provider
          <select value={provider} onChange={(event) => setProvider(event.target.value as Provider)} className={field}>
            {PROVIDERS.map((value) => <option key={value} value={value}>{PROVIDER_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          API key
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={saved ? 'Paste a new key to replace the saved one' : 'Paste your key'}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Model{needsModel(provider) ? ' (required)' : ' (optional, blank uses the app default)'}
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Model name from your provider's docs"
            className={field}
          />
        </label>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <Button type="submit" size="sm" variant="primary" disabled={!apiKey.trim()}>Save key</Button>
          {saved && (
            <Button type="button" size="sm" variant="ghost" onClick={() => { clearByoKey(); toast('API key removed') }}>
              Remove saved key
            </Button>
          )}
        </div>
        {saved && (
          <p className="text-xs text-muted">
            Saved: {PROVIDER_LABELS[saved.provider]}{saved.model ? `, model ${saved.model}` : ''}, key ending {saved.apiKey.slice(-4)}.
          </p>
        )}
      </form>
    </details>
  )
}
