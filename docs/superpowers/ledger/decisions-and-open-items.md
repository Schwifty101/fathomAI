# Decisions, facts and open items

Living record so nothing is lost between sessions. Each line is tagged:
**[verified]** checked with a command or tool this session, **[user]** stated by the user,
**[ruling]** a decision made by the controller (cost if wrong noted), **[unverified]** believed but not checked,
**[later]** deferred until a named point. No secrets belong in this file.

Last updated: 2026-10-05. Plan: `docs/superpowers/plans/2026-10-05-fathom-rebuild.md` (29 tasks, 5 phases).
Spec: `docs/superpowers/specs/2026-10-05-fathom-rebuild-design.md` (header status: "approved in conversation, pending written-spec review").

## 1. Concrete facts

- [verified] Supabase project: name `FathomAI`, ref `ifnrsvuxzfdxtcclndjp`, region Seoul, URL `https://ifnrsvuxzfdxtcclndjp.supabase.co`. At 2026-10-05 it had 0 tables and 0 migrations (via MCP). The org id is a Vercel-integration org.
- [verified] `supabase` CLI 2.102.0 is linked to that ref (`supabase/.temp/project-ref`). The Supabase MCP sees the same project.
- [verified] Node 24.15.0, npm 11.12.1, `gh` logged in as `Schwifty101`, `vercel` and `claude` CLIs installed.
- [verified] `origin` = `https://github.com/Schwifty101/fathomAI.git`, **already PUBLIC**. `origin/main` holds only "first commit"; local `main` is 5 commits ahead and unpushed (hook, spec, plan).
- [verified] The repo had no `.gitignore` and `.env` was not ignored until the first commit on `feat/phase-1-foundation`.
- [user] `SUPABASE_DB_PASSWORD` is in the repo-root `.env` (value intentionally not recorded here).
- [user] Reuse the existing `FathomAI` Supabase project (answers Task 2 Step 1).

## 2. Rulings

- [ruling] Branching: one short-lived branch per plan phase, `feat/phase-N-<name>`, cut from local `main`, one commit per task (plan rule), merged to `main` by PR. Costs if wrong: rename or re-cut a branch.
- [ruling] Worktree for the controller session lives at `.claude/worktrees/feat+phase-1-foundation` (the native tool's location, excluded via `.git/info/exclude` and `.gitignore`).
- [ruling] The native worktree tool branched from `origin/main` (missing the spec, plan and hook). Reset the empty branch to local `main` and renamed it `feat/phase-1-foundation`. Costs if wrong: none, no work was lost.
- [ruling] A separate `chore: gitignore` commit precedes Task 1 so `.env` can never be committed. Task 1 Step 3 "append" must skip lines already present. Also ignores `.superpowers/` (SDD ledger) and `graphify-out/`. Costs if wrong: delete lines.
- [ruling] Task 2 Step 2: `supabase/config.toml` and the link already exist, so skip `supabase init` and `supabase link`. The DB password lives in `.env`, not `.env.local`: pass it to the CLI as the `SUPABASE_DB_PASSWORD` env var read from `.env`; keep the API keys in `.env.local` per plan. Costs if wrong: re-run link.
- [ruling] Nothing is pushed until the user approves (outward-facing, repo is public).

## 3. Unverified or guessed

- [unverified] `SUPABASE_DB_PASSWORD` is correct and `supabase db push` can reach the DB from this network. First test is Task 2.
- [unverified] `claude -p` and `vercel` are logged in.
- [unverified] Whether the Supabase CLI auto-reads `.env` (do not rely on it).
- [unverified] Plan bodies for Tasks 3-13 and 15-28 were only skimmed by headings by the controller. Implementers read their own task text in full.
- [unverified] Seed generation (Task 11) uses the user's subscription quota; size of the cost is unknown.

## 4. Conflicts to settle

- Plan Task 29 Step 10 runs `gh repo create fathom-rebuild --public`, but public repo `Schwifty101/fathomAI` already exists with `origin` set. Needs a user decision at Task 29 (reuse the existing repo, or create a new one).
- Plan Task 29 names the Vercel project `fathom-rebuild`; confirm at deploy.
- The spec status line still says "pending written-spec review".

## 5. Security notes

- The DB password was read into the session transcript. `.agent-logs/` is public once pushed. Before any commit containing `.agent-logs/`, grep it for the password and redact. Rotate the DB password in the Supabase dashboard at the end of the project (Task 29 Step 9 already greps for `SUPABASE_DB_PASSWORD=`).
- API keys are never printed. `SUPABASE_SERVICE_ROLE_KEY` stays server-side only.

## 6. Deferred to the user (raise at the named point, not before)

| Point | What is needed |
| --- | --- |
| Task 14 start | User says to begin the design phase (also uses Playwright MCP and `/tastemaker`) |
| Task 15 | User creates the Google OAuth client and enables Google in Supabase (plan lines 3430-3434) |
| Task 29 Step 3 | Approve first Vercel production deploy |
| Task 29 Step 4 | Optional `ANTHROPIC_API_KEY` added by the user in the Vercel dashboard |
| Task 29 Step 5 | Supabase Site URL and redirect URLs set to the live URL |
| Task 29 Step 6 | Possibly turn off Vercel Deployment Protection; open the link in a private window |
| Task 29 Step 10 | Approve the GitHub repo creation or push (see section 4) |
| Task 29 Step 11 | Disable the Supabase Email provider after the last `rls:test`; rotate the DB password |
| End | User records the walkthrough (camera on, 5 minutes or less) |

## 7. Progress and findings (Tasks 1-9 complete, branch `feat/phase-1-foundation`)

Status: [verified] Tasks 1-9 done and integrated by cherry-pick (linear history, no merge commits). Full suite 11 files / 60 tests pass and `npm run typecheck` is clean. Nothing is pushed.

Newly verified facts:
- [verified] The linked Supabase CLI connected without the DB password, so `SUPABASE_DB_PASSWORD` in `.env` was not needed for `db push`. The schema was applied once: 12 public tables, RLS on all 12, 16 policies, views `team_stats` and `calendar_upcoming`, functions `search_segments` and `get_clip`.
- [verified] `npm run rls:test` passes 33/33 against the hosted project, twice in a row, and leaves no fixtures. Email/password sign-in works, so the Email provider is currently enabled (Task 29 disables it).
- [verified] `claude -p` works with the user's login (`seed/ping.ts` replied OK). It used the subscription; no `ANTHROPIC_API_KEY` is set in the shell.
- [verified] TypeScript is pinned `^6.0.3` because Next 15.5.27 rejects TypeScript 7 (npm latest is 7.0.2). `globals.d.ts` exists only because TS 6 needs a CSS side-effect module declaration. Both are justified deviations from the plan.

Rulings made so far (each costs only a small rework if wrong):
- One short-lived branch per phase; per-task commits kept; parallel tasks run in harness-created isolated worktrees (subagents cannot write to a hand-made sibling worktree) and are integrated by `git cherry-pick`, then the temporary worktree and branch are removed.
- Task 3 got a second commit (`1986801`) instead of an amend because later commits already sat on top. Its checks were hardened beyond the brief: error code `23514`, positive controls, scoped search, no orphaned test users.
- Task 6: the speaker-run gap rule is `< 3000 ms` (spec: "gaps under 3s"), not the brief's `<=`; boundary tests added.
- Task 7: UTF-8 chunk decoding, timeout message, and stdin error handler were folded in before integration because the Task 11 seed run is expensive to redo.
- Task 8: `end of next week`, `next <weekday>` and `eod` were added to `resolveDue` (the brief's regexes resolved the first two wrongly); tests added.
- Task 9: the brief's `MEETINGS` array had 9 entries but its own test and the later seed checks expect 8; the 9th (`sales-pipeline-review`) was dropped. The roster has 8 members and 8 meetings, the spec says "~6" and "~7". Accepted.

Plan text defects to fix in the plan file:
- Task 9 brief lists 9 meetings where the test expects 8.
- Task 1's plan commit command is `git add -A ':!.agent-logs'`, which would also stage the untracked `supabase/` directory and Task 2's `git add` lists `package.json` files it does not change; implementers were told to stage explicit paths instead. Other tasks' commit commands were not audited by the controller.

Deferred minor findings (not blocking, final review should triage):
- DB hardening migration: default table grants are not revoked (anon/authenticated keep INSERT/UPDATE/DELETE/TRUNCATE on `ai_usage`, `shares`, `summaries`, `segments`; RLS blocks rows and PostgREST does not expose TRUNCATE); `get_clip` should use `search_path = public, pg_temp`; `search_segments` has a mutable search path (advisor WARN); shares 20/day cap and slug length are enforced only in the server action (Task 24); `get_clip` also returns `meeting_slug`.
- Task 1: `globals.d.ts` uses `const content: {}`; `@types/node ^26` is ahead of the Node 24 runtime.
- Task 3: cleanup results not inspected; coverage is thin for "no client writes" on `summaries` and anon update/delete.
- Task 4: `formatMs(NaN)` gives `NaN:NaN`; `parseTimeParam` does not guard a NaN or negative duration.
- Task 5: no tests for out-of-range or negative `segment_idx`; `askAnswerSchema` citations have no upper bound (consumers must range-check).
- Task 6: question counting counts `?` characters, not sentences; a run over 5 minutes clamps around the playhead segment rather than from the run start; overlapping same-speaker segments double count talk time.
- Task 7: `pool` leaves other workers running when `fn` throws, and `n <= 0` is a silent no-op; `extractJson` can mis-parse fences containing triple backticks or prose containing `[` or `{`; `child.kill()` is SIGTERM only; the child inherits `ANTHROPIC_API_KEY` if set, so `claude` might bill the API instead of the subscription (unset it for seed runs if that matters).
- Task 8: ISO pass-through is not validated; a bare day-name regex can match ordinary words; `end of week` said on a Saturday gives next Friday; `next weekend` returns next Monday; stamp tests lack empty-input, one-word and overlap-occurs cases.
- Task 9: `validateDefs` reports an unknown member slug but `castOf` then throws a TypeError; `validateDefs` does not check the three-week window or showcase duration (the test does).

Still open: graphify graph build (extraction is done, graph not built; output lives in the main checkout's `graphify-out/`, which is git-ignored).
