import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { LlmClient } from '@/lib/llm'

const TIMEOUT_MS = 10 * 60_000
const KILL_GRACE_MS = 5_000

// Bare run: no tools, no user/project settings or hooks, no CLAUDE.md, skills, plugins or MCP, and a
// replaced system prompt. `--bare` itself is not used: it needs an API key, not the subscription login.
// Flags verified against `claude --help` only; the first real run should be a single meeting.
export function claudeArgs(model: string, system?: string): string[] {
  return [
    '-p', '--model', model, '--no-session-persistence',
    '--safe-mode', '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--permission-prompts', 'none',
    '--system-prompt', system ?? 'You are a careful assistant. Output exactly the format requested.',
  ]
}

// An inherited API key would make the CLI bill the API account instead of the subscription login.
export function childEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY: _key, ANTHROPIC_AUTH_TOKEN: _token, ...rest } = env
  return rest
}

// Runs `claude -p` from the OS temp dir so the project capture hook does not log every call.
export function claudeCliClient(model: string = process.env.SEED_MODEL ?? 'sonnet'): LlmClient {
  return {
    complete: ({ system, prompt }) =>
      new Promise<string>((resolve, reject) => {
        const child = spawn('claude', claudeArgs(model, system), {
          cwd: tmpdir(), env: childEnv(process.env) as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'pipe'],
        })
        let out = ''
        let err = ''
        let timedOut = false
        let killer: NodeJS.Timeout | undefined
        const timer = setTimeout(() => {
          timedOut = true
          child.kill('SIGTERM')
          killer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
        }, TIMEOUT_MS)
        const done = () => { clearTimeout(timer); clearTimeout(killer) }
        // setEncoding keeps multibyte characters intact across chunk boundaries.
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (err += d))
        child.on('error', (e) => { done(); reject(e) })
        child.on('close', (code) => {
          done()
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
