// Browser-only storage for the visitor's own LLM key. Never imported by server code.
import { useMemo, useSyncExternalStore } from 'react'
import { byoHeaders, validateByoKey, type ByoKey } from './byo-key'

const STORAGE_KEY = 'fathom.llmKey'
const listeners = new Set<() => void>()

// Storage can be missing or throw (private windows, blocked site data), so every access is guarded.
function raw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
const parse = (value: string | null): ByoKey | null => {
  if (!value) return null
  try {
    return validateByoKey(JSON.parse(value))
  } catch {
    return null
  }
}
const emit = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) listener() }
  window.addEventListener('storage', onStorage) // other tabs
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export const loadByoKey = (): ByoKey | null => parse(raw())

/** False when the browser refused to store it. */
export function saveByoKey(key: ByoKey): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(key))
  } catch {
    return false
  }
  emit()
  return true
}

export function clearByoKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
  emit()
}

export function useByoKey(): ByoKey | null {
  const value = useSyncExternalStore(subscribe, raw, () => null)
  return useMemo(() => parse(value), [value])
}

/** Request headers carrying the stored key, or none. Call at send time, not render time. */
export const byoRequestHeaders = (): Record<string, string> => {
  const key = loadByoKey()
  return key ? byoHeaders(key) : {}
}
