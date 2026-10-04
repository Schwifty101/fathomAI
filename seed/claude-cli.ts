import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { LlmClient } from '@/lib/llm'

// Runs `claude -p` from the OS temp dir so the project capture hook does not log every call,
// with a replaced system prompt so global style hooks (e.g. terse modes) do not leak in.
// --bare is not used: it requires an API key, not the subscription login.
export function claudeCliClient(model: string = process.env.SEED_MODEL ?? 'sonnet'): LlmClient {
  return {
    complete: ({ system, prompt }) =>
      new Promise<string>((resolve, reject) => {
        const args = [
          '-p', '--model', model, '--no-session-persistence', '--disable-slash-commands',
          '--system-prompt', system ?? 'You are a careful assistant. Output exactly the format requested.',
        ]
        const child = spawn('claude', args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
        let out = ''
        let err = ''
        let timedOut = false
        const timer = setTimeout(() => { timedOut = true; child.kill() }, 10 * 60_000)
        // setEncoding keeps multibyte characters intact across chunk boundaries.
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (err += d))
        child.on('error', (e) => { clearTimeout(timer); reject(e) })
        child.on('close', (code) => {
          clearTimeout(timer)
          if (timedOut) return reject(new Error('claude timed out after 10 minutes'))
          // The CLI often prints failures (e.g. usage limits) to stdout, so include both.
          code === 0
            ? resolve(out.trim())
            : reject(new Error(`claude exited ${code}: stderr: ${err.slice(0, 500)} stdout: ${out.slice(0, 500)}`))
        })
        // An early-exiting child must not raise an uncaught EPIPE; `close` reports the failure.
        child.stdin.on('error', () => {})
        child.stdin.end(prompt)
      }),
  }
}
