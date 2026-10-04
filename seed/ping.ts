import { claudeCliClient } from './claude-cli'

claudeCliClient()
  .complete({ prompt: 'Reply with the single word OK' })
  .then((r) => console.log('claude replied:', r))
  .catch((e) => { console.error(e); process.exit(1) })
