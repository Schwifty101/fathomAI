# CAPTURE-TEST

## Setup (step 1)
- **Tool:** Claude Code (CLI)
- **Model:** `claude-sonnet-5-5` (Sonnet 5.5). One model plans and executes; no separate planner.
- **Automatic hook mechanism:** yes. Claude Code lifecycle hooks (`UserPromptSubmit`, `Stop`) run a command on every prompt and every end of turn.

## Mechanism (step 2)
- Config file changed: `.claude/settings.json` (project-level, committed). `UserPromptSubmit` runs `capture.py prompt`; `Stop` runs `capture.py stop`.
- Script added: `.claude/hooks/capture.py` (stdlib Python, no deps).
  - Prompt: verbatim `prompt` field from the `UserPromptSubmit` payload.
  - Final response: `last_assistant_message` from the `Stop` payload. Thinking, tool calls and intermediate steps are never read.
  - Model: read from the session transcript (`transcript_path`).
  - Never blocks the session: exits 0 always; failures go to `.agent-logs/capture-errors.log` (none occurred in the real logs).

## Where canaries landed (steps 3-4)
Two separate fresh sessions, each started with `claude -p` in this repo, so the hook is not tied to the session that installed it.
- Canary 1: `.agent-logs/2026-10-04_18-41-26_3afaae34-ff4e-459a-81cb-43e3376dd72f.md`
- Canary 2: `.agent-logs/2026-10-04_18-41-45_24a7db3a-0fc4-4913-a268-f860ca9d1c42.md`

### Canary 1 (raw)
````
[LOG_ENTRY type=PROMPT num=1 session=3afaae34]
timestamp: 2026-10-04T18:41:26.302Z
model: sonnet (alias, no response yet)

CAPTURE TEST — 8x assignment, Soban


[LOG_ENTRY type=RESPONSE num=1 session=3afaae34]
timestamp: 2026-10-04T18:41:30.694Z
model: claude-sonnet-5-5

Capture test received. No task in the message, so I made no changes and ran no tools.

If "8x assignment" is a real task, send the details and I'll start.

Several MCP servers need authorization before they work, and I can't run OAuth in this non-interactive session:
- **claude.ai connectors:** Apify. Authorize it in your claude.ai connector settings.
- **Plugin servers:** apollo, design (atlassian, figma, intercom, linear, slack), marketing (ahrefs, amplitude, canva, klaviyo, similarweb, supermetrics), sales (calendly, clay, close, crunchbase, fireflies, gong, lusha, microsoft-365, monday, otter-ai, outreach, salesforce, zoominfo), and supabase. Authorize these with `claude mcp` or `/mcp` in an interactive session.

Their tools are unavailable until then.
````

### Canary 2 (raw)
````
[LOG_ENTRY type=PROMPT num=1 session=24a7db3a]
timestamp: 2026-10-04T18:41:45.194Z
model: sonnet (alias, no response yet)

CAPTURE TEST — 8x assignment, Soban (second session)


[LOG_ENTRY type=RESPONSE num=1 session=24a7db3a]
timestamp: 2026-10-04T18:41:49.992Z
model: claude-sonnet-5-5

Capture test received. Session live, no task given.

Repo: `/Users/sobanahmad/Work/fathomAI`, branch `main`, one commit. Only `.agent-logs/` and `.claude/` untracked.

What is "8x assignment"? Give task, I do it.

Also: many MCP servers (Apollo, Figma, Linear, Slack, Supabase, etc.) need auth. Session non-interactive, so I can't authorize them. Do it in claude.ai connector settings, or `/mcp` in an interactive session. Those tools stay unavailable until then.
````

## What did not work / known limits
1. **First attempt logged `model: unknown` on the RESPONSE.** The `Stop` hook fires before the transcript line for the final message is flushed, so the model lookup found nothing. Fix: poll the transcript (up to ~3s) until the last assistant text matches `last_assistant_message`. The failed run is kept untouched at `.agent-logs/2026-10-04_18-40-53_7c4a2b93-4bc4-445e-92a7-13e3ccfe77eb.md`.
2. **PROMPT `model:` is approximate.** The `UserPromptSubmit` payload has no model field, so it uses the model of the previous response in the same session, or on a session's first prompt the settings alias (`sonnet (alias, no response yet)`). The RESPONSE entry always has the exact model id, so a mid-build `/model` switch shows up there first.
3. **The setup prompt itself is not in the logs.** The message that installed the hook was sent before the hook existed, and Claude Code snapshots hooks at session start, so the interactive session that installed it is not captured. The canaries above came from headless `claude -p` sessions, not typed interactively. Restart interactive Claude Code in this repo before building.
4. The first synthetic test of my own was wrong (raw newlines in hand-built JSON). That was a test bug, not a hook bug. Redone with `json.dumps`, 3 turns, including a prompt containing fake `[LOG_ENTRY` lines: numbering stayed correct.
