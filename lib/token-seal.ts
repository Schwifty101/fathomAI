import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const IV_LEN = 12
const TAG_LEN = 16

const key = (secret: string) => createHash('sha256').update(secret).digest()

// Seals a token as base64url(iv | authTag | ciphertext) with AES-256-GCM.
export function sealToken(plain: string, secret: string): string {
  if (secret.length < 32) throw new Error('secret must be at least 32 characters')
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

// Never throws: any failure (wrong secret, tampering, garbage) returns null.
export function unsealToken(sealed: string, secret: string): string | null {
  if (secret.length < 32) return null
  try {
    const buf = Buffer.from(sealed, 'base64url')
    if (buf.length < IV_LEN + TAG_LEN) return null
    const decipher = createDecipheriv('aes-256-gcm', key(secret), buf.subarray(0, IV_LEN))
    decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN))
    return Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
