'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { AskResult } from '@/lib/ask'
import { formatMs } from '@/lib/format'

type Message = { role: 'user'; text: string } | { role: 'ai'; result: AskResult }
type Props = {
  scopes: { value: string; label: string }[]
  defaultScope: string
  prompts: string[]
  embedded?: boolean
}

const parseScope = (value: string) => value.startsWith('meeting:')
  ? { kind: 'meeting', slug: value.slice(8) }
  : { kind: value }

export function AskPanel({ scopes, defaultScope, prompts, embedded = false }: Props) {
  const [open, setOpen] = useState(true)
  const [scope, setScope] = useState(defaultScope)
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy) return
    setMessages((current) => [...current, { role: 'user', text }])
    setQuestion('')
    setBusy(true)
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text, scope: parseScope(scope) }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const result = (await response.json()) as AskResult
      setMessages((current) => [...current, { role: 'ai', result }])
    } catch {
      setMessages((current) => [...current, {
        role: 'ai', result: { mode: 'extractive', text: 'Something went wrong. Try again.', citations: [] },
      }])
    } finally {
      setBusy(false)
    }
  }

  if (!embedded && !open) {
    return <Button size="sm" variant="secondary" className="self-start" onClick={() => setOpen(true)}>Ask Fathom</Button>
  }

  return (
    <aside aria-label="Ask Fathom" className={`flex flex-col gap-3 rounded-card border border-border bg-surface p-4 ${embedded ? '' : 'w-full lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:w-[360px] lg:self-start'}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Ask Fathom</h2>
        {!embedded && <Button size="sm" variant="ghost" aria-label="Collapse Ask Fathom" onClick={() => setOpen(false)}>Hide</Button>}
      </div>
      <div className="min-h-24 space-y-3 overflow-y-auto text-sm">
        {messages.length === 0 && <p className="text-muted">Ask anything about {scopes.find((item) => item.value === scope)?.label.toLowerCase() ?? 'your calls'}.</p>}
        {messages.map((message, index) => message.role === 'user' ? (
          <p key={index} className="ml-6 rounded-lg bg-surface-2 p-2">{message.text}</p>
        ) : (
          <div key={index} className="space-y-1">
            <p className="whitespace-pre-wrap">{message.result.text}</p>
            {message.result.notice && <p className="text-xs italic text-muted">{message.result.notice}</p>}
            <ul className="space-y-1">
              {message.result.citations.map((citation, citationIndex) => (
                <li key={citationIndex}>
                  <Link href={`/meetings/${citation.meeting_slug}?t=${citation.start_ms}`} className="text-xs text-accent underline">
                    {formatMs(citation.start_ms)} · {citation.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {busy && <p className="text-muted">Thinking…</p>}
      </div>
      {prompts.length > 0 && scope === defaultScope && (
        <div className="flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <button key={prompt} onClick={() => send(prompt)} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-2">
              {prompt}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); send(question) }} className="flex flex-col gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
          placeholder="Ask anything…"
          aria-label="Ask a question"
          className="h-10 rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-muted"
        />
        <div className="flex items-center justify-between gap-2">
          <select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Scope" className="h-8 rounded-lg border border-border bg-bg px-2 text-xs">
            {scopes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <Button type="submit" size="sm" variant="primary" disabled={busy || !question.trim()}>Ask</Button>
        </div>
      </form>
    </aside>
  )
}
