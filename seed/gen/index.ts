import { claudeCliClient } from '../claude-cli'
import { exists, fileOf } from '../io'
import { MEETINGS } from '../meetings'
import { limitClient, pool, retryClient } from '../pool'
import { generateAsk } from './ask'
import { generateMeeting } from './meeting'

const MAX_CLAUDE_PROCESSES = 3
const FILES = ['brief', 'transcript', 'summaries', 'actions', 'highlights']

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const only = args.filter((arg) => !arg.startsWith('--'))
  const defs = MEETINGS.filter((def) => only.length === 0 || only.includes(def.slug))
  if (defs.length === 0) throw new Error(`no meeting matches: ${only.join(', ')}`)
  // One cap for every call (meetings x summary templates), so at most 3 `claude` processes run at once.
  const client = limitClient(retryClient(claudeCliClient()), MAX_CLAUDE_PROCESSES)
  let failed = 0
  await pool(defs, 2, async (def) => {
    try {
      await generateMeeting(client, def, { force })
    } catch (error) {
      failed++
      console.error(`${def.slug}: FAILED: ${error instanceof Error ? error.message : error}`)
    }
  })
  // Ask answers cite every meeting, so they are (re)generated whenever all eight bundles are complete and
  // ask.json is missing (a regenerated transcript deletes it), including after a single-slug run.
  const complete = MEETINGS.every((def) => FILES.every((name) => exists(fileOf(def.slug, name))))
  if (failed === 0 && complete) await generateAsk(client, MEETINGS, { force: force && only.length === 0 })
  if (failed) {
    console.error(`${failed} meeting(s) failed; re-run to resume (finished files are kept)`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
