# Fathom rebuild: continuation handoff

Last updated: 2026-10-05, end of the cloud session. This is the current-state file; if it disagrees with anything older, this file wins. Working rules are in `/CLAUDE.md`. The detailed history is `decisions-and-open-items.md` (read its "How to read this file" table first), and the plan and spec sit beside it.

## Where things stand

- Tasks 1 to 28 are implemented and merged to `main`. Task 29 (ship) is started: README, `docs/walkthrough.md` and the Playwright smoke spec exist; nothing is deployed, there is no live URL, and the public repository is undecided.
- Last run in the cloud container (Node 22) on the merged tree: `npm test` 44 files, 449 passed plus 1 expected failure; `npm run typecheck` clean; `npm run build` compiled 12 of 12 pages. The expected failure is a deliberate `it.fails` that marks a known gap (`ask_answers.scope` has no CHECK). Numbers drift, so re-run before relying on them.
- Nothing has been checked in a browser, against loaded data, or with Google sign-in. Treat all runtime behaviour as unverified.
- Hosted Supabase (`FathomAI`, ref `ifnrsvuxzfdxtcclndjp`, Seoul), re-checked read-only on 2026-10-05 through the Supabase connector: 12 public tables, RLS on every one, 0 rows, migrations `init` and `hardening` applied. No data has ever been loaded.

## Gates, in the order to clear them

| # | Gate | Status | Next action |
| --- | --- | --- | --- |
| 1 | Seed generation (Task 11) | 1 of 8 meetings. `eng-standup` (100 lines, 15 min, 6 highlights) passes `seed:check`. Missing: `q4-planning` (showcase, 62 min, 8 speakers), `acme-discovery`, `priya-mei-1on1`, `harbor-interview`, `optimizer-outage-postmortem`, `mobile-design-review`, `weekly-product-sync`, and `ask.json`. The user said "not yet". | On a machine with a working `claude` login (it spends that account's quota, plan estimate 40 to 90 minutes): `npm run seed:gen` (resumable, re-run if one fails). Review the showcase per plan Task 11 Step 4, run `npm run seed:check`, commit `seed/generated`. |
| 2 | Load (Tasks 12, 13) | Not run. The hosted host is blocked from the cloud container; the loader has only run against a fake client. | Set `EXPECT_SUPABASE_REF=ifnrsvuxzfdxtcclndjp` (or `supabase link`), then `npm run seed:check`, `npm run seed:load -- --dry-run`, `npm run seed:load` twice (the second run must print the same counts and delete nothing; expect `ask_answers: 6`), then `npm run seed:clips` and the anonymous search check from plan Task 13. |
| 3 | Browser acceptance | Not started. | Work through `docs/manual-test-checklist.md` (304 items, tally table). Items tagged `G` need Google sign-in, `K` a server `ANTHROPIC_API_KEY`, `D` loaded data. |
| 4 | Google OAuth (Task 15) | Not configured. | The user creates a Google OAuth client and enables Google in Supabase (plan Task 15 Step 8). Site URL and redirect list are set after deploy. |
| 5 | Smoke tests | `e2e/smoke.spec.ts` (9 tests) written. One app bug it exposed is fixed (signed-out Insight in the first second). Not run against data. | After gate 2: `npm run e2e` (builds and serves the app), later `BASE_URL=<live> npm run e2e`. Fix real app failures, not the tests. |
| 6 | Visual review (Task 14) | Open. | Review 1280 px and 390 px captures (`docs/design/refs/` is gitignored and local only) and `/design`. Checklist items VR-11 and VR-12 record the 14px vs 16px text and 24px vs 30/36 title drift from `docs/design/design-system.md`; the user chose to decide after seeing it. |
| 7 | Ship (Task 29 Steps 3 to 12) | Not started. | Deploy (ask first), set the three Supabase variables in Vercel, set Supabase Site URL and redirects, live e2e, replace `<LIVE_URL>` and `<REPO_URL>` in `README.md` and `docs/walkthrough.md`, secret scan, repository (ask first), re-run `rls:test`, then disable the Email provider and rotate the DB password. The user records the walkthrough. |

## Decided by the user, do not re-ask

- Plain subagents were used because the ponytail, superpowers and graphify plugins were unavailable in the cloud session.
- `npm run seed:gen` waits for the user.
- The loader refuses to cascade-delete users' highlights, summaries or shares unless `--allow-cascade` is passed (a dry run reports it).
- UI work was limited to the clear accessibility and robustness fixes (merged, ledger 10.7). The 14px vs 16px design drift is deferred to a browser review.
- The PostCSS advisory bundled in Next 15.5.27 is accepted for this demo (ledger 9.8).

## Still open for the user

- Add a CHECK on `ask_answers.scope`? It needs a new hosted migration, so it is not done. The `it.fails` test flips red when one is added; change it to `it` then.
- Clip lane colours differ from the meeting page (`get_clip` lacks talk times). Fix is a second query in `lib/clip.ts` and `app/clip/[slug]/page.tsx`, no migration. Not done.
- The global `h` highlight shortcut cannot be switched off (WCAG 2.1.4) and holding H repeats it; inactive tab panels unmount, so Ask and Summary state is lost on every switch. Both were offered and not selected.
- The copied Markdown still uses ISO due dates (`lib/markdown.ts`).
- Confirm the README's "Left out, and why" wording, and that the meeting page always showing "← My Calls" (even for calls Priya does not host) is acceptable (checklist open questions).
- Reuse `Schwifty101/fathomAI` for the public repository or create `fathom-rebuild`, and name the Vercel project (plan Task 29 says `fathom-rebuild`).
- Optional history cleanup: two early commits carry a `Co-Authored-By` trailer naming a model; later ones do not.

## Environment and repository state

- **Cloud container.** Node 22. No `supabase`, `vercel` or `graphify` CLI. Outbound traffic to the Supabase host is blocked by the network policy (so `seed:load`, `seed:clips`, `rls:test` and hosted e2e cannot run there). The Supabase connector works from a session (read-only calls were used; `execute_sql` could load data but was not authorised). `claude` is logged in through an OAuth token whose account was not checked. GitHub goes through the MCP tools.
- **Local machine** (reported by earlier sessions, unverified from the cloud): the real `.env.local` (Supabase URL, anon key, service-role key) lives in the `.claude/worktrees/feat+phase-1-foundation` worktree and the main checkout's `.env.local` is a symlink to it, so move that file out before ever removing the worktree. `.env` holds only `SUPABASE_DB_PASSWORD`. The `supabase` CLI is linked to the project. `gh` and `vercel` were logged in. Local branches such as `feat/phase-1-foundation` are now behind `main`. On arrival run `git pull` on `main`, `git worktree list` and `git status`, and never `git add -A` there.
- **Knowledge graph.** `graphify-out/` is gitignored and was never pushed, so it exists only on the local machine (766 nodes, 1847 edges at last report). After any `/graphify .` or `--update`, run `node scripts/repair-graphify.mjs <raw> <repaired>` before building (ledger 9.9; `node --test scripts/repair-graphify.test.mjs`).
- **Agent logs.** `.agent-logs/` is public. The capture hook rewrites the live session's log every turn, so rescan it before each commit (CLAUDE.md). The four logs pushed in `cb114e6` were scanned for secrets, not for personal data.
- **Agent worktrees.** The cloud session's seven temporary agent worktrees and branches were merged and removed. Isolated worktrees may start from `origin/main` rather than your branch: check the base commit before any `npm` command.

## Tidy-ups and known stale spots

- `docs/superpowers/plans/2026-10-05-fathom-rebuild.md` is partly stale; its banner lists the known deviations. Reconciling the whole 7,000-line plan with reality is a large edit and has not been done.
- `tests/a11y-shell-jsx.ts` reads component source with the TypeScript parser because vitest could not import `.tsx` at the time. JSX now works in vitest (`tests/jsx-render.test.ts`), so those tests could be replaced with real `renderToStaticMarkup` tests. Optional.
- Kept deliberately although they look redundant: `CAPTURE-TEST.md` (evidence for the log-capture hook), `seed/ping.ts` (one-word `claude` auth probe, spends a few tokens), `scripts/repair-graphify.*` (developer-only), `.agent-logs/` (a required public deliverable).
- Not verified at runtime: the PostgREST embed `host:team_members(...)` on meetings (only one foreign key was confirmed), the transcript deep-link scroll with `content-visibility: auto`, and real `requestAnimationFrame` behaviour after a hidden tab resumes.
