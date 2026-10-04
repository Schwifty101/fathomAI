import { createHash } from 'node:crypto'

export const DNS_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
export const SEED_NS = '2c1f7a52-5f0e-4c6e-9a8b-3d0b7a1e9c11'

export function uuid5(name: string, namespace: string = DNS_NS): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(ns).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = h.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const seedId = (kind: string, key: string): string => uuid5(`${kind}:${key}`, SEED_NS)
