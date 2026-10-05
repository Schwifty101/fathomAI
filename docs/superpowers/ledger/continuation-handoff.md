# Fathom rebuild continuation handoff

Date: 2026-10-05 (rewritten after independent verification and Phase 0). Branch: `feat/phase-1-foundation`; worktree: `.claude/worktrees/feat+phase-1-foundation` under the main checkout. The source of truth for requirements is `docs/superpowers/plans/2026-10-05-fathom-rebuild.md`, with the design spec beside it in `docs/superpowers/specs/`. `decisions-and-open-items.md` is the detailed record; its section 9 holds the verification findings, Phase 0 fixes, hosted state and open items.

## Stop point

Tasks 1-26 are implemented, independently verified by five read-only agents, and hardened in Phase 0. **Tasks 27 (live summary regeneration) and 28 (calendar stub) are implemented and merged**; both are covered only by unit tests and builds, with no browser or live-model check yet. Task 29 (deploy, smoke test, README, repository) has not started. Task 11 has not produced data.

`main` and `feat/phase-1-foundation` point at the same commit. Nothing has been pushed or deployed (`origin/main` still holds only "first commit"). Latest local checks on the merged tree: `npm test` 28 files / 234 tests, `npm run typecheck`, and `npm run build` (including `/api/regenerate` and `/calendar`) all pass.

## Gates

| Gate | Status | Resume action |
| --- | --- | --- |
| Hosted schema | Done. `20261005000000_init.sql` and `20261006000000_hardening.sql` are applied (`supabase migration list` shows local and remote identical). 12 tables, RLS on all, 0 rows. | None. |
| RLS and constraints on hosted | Done. The hardened `npm run rls:test` passes against the hosted project and cleans up after itself. TRUNCATE privilege is only covered by the local `supabase/tests/hardening.sql` probes. | Re-run `rls:test` once more before Task 29 Step 11 disables the Email provider (the test needs it enabled). |
| Task 11 synthetic meetings | Not run. No `seed/generated/` output. The generation code was fixed in Phase 0 but never exercised with the real model. The new `claude` CLI flags are confirmed in `--help` only. | In a terminal with working Claude auth and quota, from the feature worktree: `npm run seed:gen -- eng-standup`, inspect the bundle, then `npm run seed:gen`. Review output quality before loading. |
| Tasks 12-13 data gates | Not run. `seed:check` was hardened (calendar dates, duplicate prompts, scope enum, highlight ranges, per-scope citations, unresolved due phrases). The loader's missing-bundle preflight works. | `npm run seed:check`, then `npm run seed:load` twice (idempotence), then the anon search check from the plan. `seed:load` runs the target guard first. |
| Tasks 15, 18-28 runtime | Unverified in a browser. Code, unit tests and read-only reviews pass; nothing has run against populated hosted data. Google OAuth and the Supabase redirect allow-list are not configured or tested. | After data is loaded and Google is configured, follow each task's browser acceptance steps. For Ask, check suggested chips per scope, scope restriction, the extractive fallback, and a live answer only if a server-side Anthropic key is deliberately provided. |
| Task 14 visual review | Open. Ignored reference captures exist under `docs/design/refs/`; the design document and `/design` page are tracked. | Review the 1280 px and 390 px captures and the reduced-motion result in a browser. |

## Decisions still open

- Live Ask runs one model attempt with retries off (a ruling, see ledger 9.4). Raise the SDK timeout and `maxDuration` if a JSON-repair retry is wanted.
- `seed:check` fails on an unresolvable due phrase. Switch it to a warning if hand edits after an expensive run are unwanted.
- Task 27 added a sixth regenerate error code, `unavailable` (HTTP 503), for DB or usage failures so the route fails closed instead of returning a raw 500. It is not in the plan's code list; keep it unless you want the plan text changed.
- Task 29: reuse the existing public repo `Schwifty101/fathomAI` or create `fathom-rebuild`; confirm the Vercel project name (ledger section 4).

## Repository and environment state

- The main checkout has untracked local state that must be preserved: `.env` (DB password only), `supabase/.temp`, `graphify-out/`, and the session logs under `.agent-logs/` that exist only there. Do not use `git add -A` there.
- The feature worktree has a real `.env.local` (Supabase URL, anon key, service-role key; values not recorded anywhere). It is gitignored. The main checkout has no `.env.local`.
- The main checkout's `node_modules` is a partial leftover (8 entries) from an agent that ran `npm ci` against the wrong directory. It is gitignored and nothing depends on it: `rm -rf` it, or run `npm ci` there if tests are ever run from main. The feature worktree's `node_modules` is intact.
- Merged agent worktrees remain on disk and can be removed once nothing needs them: `.claude/worktrees/agent-aeb014834259fb85a`, `agent-a1fe4b835d9c5bee2` and `agent-af8094821fd0c3479` (branches `worktree-agent-aeb014834259fb85a`, `worktree-agent-a1fe4b835d9c5bee2`, `fix/seed-pipeline-stream-a`). The Task 27 and 28 worktrees (`agent-a3484a91839dfdea6`, `agent-a1d4fa42c461326d6`, branches `feat/task-27-regenerate`, `feat/task-28-calendar`) are merged and removable too.
- Isolated agent worktrees start from `origin/main`, not local `main`. Every agent prompt must check `git log --oneline -1` and `ls package.json` first and `git reset --hard <base>` if needed, before any `npm` command.

## Logs

The capture hook writes to the main checkout's `.agent-logs/` (via `$CLAUDE_PROJECT_DIR`), so recent session logs exist only there; three early logs are tracked on this branch. Do not copy logs into the branch automatically. At Task 29, decide which logs to publish and scan the exact files for secrets and personal data first (Task 29 Step 9 greps for known patterns; the DB password must never appear).

## Next planned work

1. You run `seed:gen` (Task 11); then Tasks 12-13 gates, Google OAuth, and browser acceptance.
2. Task 29: Playwright smoke tests, deploy (needs your approval), Supabase Site URL and redirect URLs, README, walkthrough, log secret scan, repository (needs your approval), disable the Email provider, rotate the DB password.
