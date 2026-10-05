import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const GEN_DIR = join(process.cwd(), 'seed', 'generated')
export const fileOf = (slug: string, name: string, dir: string = GEN_DIR) => join(dir, slug, `${name}.json`)
export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  // Write-then-rename: a crash mid-write must never leave a truncated file that resume treats as done.
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmp, path)
}
export const readJson = <T = unknown>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
export const exists = existsSync
