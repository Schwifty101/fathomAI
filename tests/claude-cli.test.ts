import { describe, expect, it } from 'vitest'
import { childEnv, claudeArgs } from '@/seed/claude-cli'

describe('claude cli adapter', () => {
  it('runs bare: no tools, no settings/hooks, no MCP, no slash commands', () => {
    const args = claudeArgs('sonnet', 'sys')
    expect(args).toContain('--safe-mode')
    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual(['--tools', ''])
    for (const flag of ['--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) {
      expect(args).toContain(flag)
    }
    expect(args.slice(args.indexOf('--system-prompt'), args.indexOf('--system-prompt') + 2)).toEqual(['--system-prompt', 'sys'])
  })
  it('strips API credentials from the child env and keeps the rest', () => {
    const env = childEnv({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't', HOME: '/h', PATH: '/p' })
    expect(env).toEqual({ HOME: '/h', PATH: '/p' })
  })
})
