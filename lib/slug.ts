import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function newSlug(length = 10): string {
  return Array.from(randomBytes(length), (byte) => ALPHABET[byte & 31]).join('')
}
