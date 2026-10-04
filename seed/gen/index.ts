import { claudeCliClient } from '../claude-cli'
import { MEETINGS } from '../meetings'
import { pool } from '../pool'
import { generateAsk } from './ask'
import { generateMeeting } from './meeting'

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const only = args.filter((arg) => !arg.startsWith('--'))
  const defs = MEETINGS.filter((def) => only.length === 0 || only.includes(def.slug))
  if (defs.length === 0) throw new Error(`no meeting matches: ${only.join(', ')}`)
  const client = claudeCliClient()
  let failed = 0
  await pool(defs, 2, async (def) => {
    try {
      await generateMeeting(client, def, { force })
    } catch (error) {
      failed++
      console.error(`${def.slug}: FAILED: ${error instanceof Error ? error.message : error}`)
    }
  })
  if (only.length === 0 && failed === 0) await generateAsk(client, MEETINGS, { force })
  if (failed) {
    console.error(`${failed} meeting(s) failed; re-run to resume (finished files are kept)`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
