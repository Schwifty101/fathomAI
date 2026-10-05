# Decisions, facts and open items

Living record so nothing is lost between sessions. Each line is tagged:
**[verified]** checked with a command or tool this session, **[user]** stated by the user,
**[ruling]** a decision made by the controller (cost if wrong noted), **[unverified]** believed but not checked,
**[later]** deferred until a named point. No secrets belong in this file.

Last updated: 2026-10-05 (see section 9 for verification, Phase 0 and hosted state). Plan: `docs/superpowers/plans/2026-10-05-fathom-rebuild.md` (29 tasks, 5 phases).
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

- [user] The DB password is not in any log or graph output checked so far. `.agent-logs/` would be public once pushed, so scan every log selected for publication before committing it. Rotate the DB password in the Supabase dashboard at the end of the project (Task 29 Step 9 already greps for `SUPABASE_DB_PASSWORD=`).
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

Deferred minor findings (not blocking, final review should triage). **Status update 2026-10-05: the DB-hardening, Task 4, Task 5, Task 7, Task 8 and Task 9 items below were addressed in Phase 0; see section 9 for what was fixed and what remains open.**
- DB hardening migration: default table grants are not revoked (anon/authenticated keep INSERT/UPDATE/DELETE/TRUNCATE on `ai_usage`, `shares`, `summaries`, `segments`; RLS blocks rows and PostgREST does not expose TRUNCATE); `get_clip` should use `search_path = public, pg_temp`; `search_segments` has a mutable search path (advisor WARN); shares 20/day cap and slug length are enforced only in the server action (Task 24); `get_clip` also returns `meeting_slug`.
- Task 1: `globals.d.ts` uses `const content: {}`; `@types/node ^26` is ahead of the Node 24 runtime.
- Task 3: cleanup results not inspected; coverage is thin for "no client writes" on `summaries` and anon update/delete.
- Task 4: `formatMs(NaN)` gives `NaN:NaN`; `parseTimeParam` does not guard a NaN or negative duration.
- Task 5: no tests for out-of-range or negative `segment_idx`; `askAnswerSchema` citations have no upper bound (consumers must range-check).
- Task 6: question counting counts `?` characters, not sentences; a run over 5 minutes clamps around the playhead segment rather than from the run start; overlapping same-speaker segments double count talk time.
- Task 7: `pool` leaves other workers running when `fn` throws, and `n <= 0` is a silent no-op; `extractJson` can mis-parse fences containing triple backticks or prose containing `[` or `{`; `child.kill()` is SIGTERM only; the child inherits `ANTHROPIC_API_KEY` if set, so `claude` might bill the API instead of the subscription (unset it for seed runs if that matters).
- Task 8: ISO pass-through is not validated; a bare day-name regex can match ordinary words; `end of week` said on a Saturday gives next Friday; `next weekend` returns next Monday; stamp tests lack empty-input, one-word and overlap-occurs cases.
- Task 9: `validateDefs` reports an unknown member slug but `castOf` then throws a TypeError; `validateDefs` does not check the three-week window or showcase duration (the test does).

## 8. Graphify graph build and agent-log location

Status: [verified] an ignored graph artifact exists at `graphify-out/`. On 2026-10-05, inspection of `graph.json` found 297 nodes, 397 links, zero nodes sourced from `.sql`, and zero dangling endpoints among the links actually stored. `GRAPH_REPORT.md` still reports an ambiguous README edge and source paths into the main checkout. The claimed later SQL/docs rebuild is not present in this worktree's graph output; the claimed `graphify-caveats-report.md` file is also absent. Treat the graph as a preliminary navigation aid, not proof that the caveats were resolved.

Agent-log location finding:
- [verified] `.claude/hooks/capture.py` writes to `$CLAUDE_PROJECT_DIR/.agent-logs/`, falling back to the hook payload's `cwd`. The main checkout currently has 8 logs, of which 5 are untracked; this worktree has only the 3 already tracked on the branch. The untracked files were not copied or staged.
- [ruling] Leave the 5 parent-checkout session transcripts unpublished for this handoff. Their content may be private, and the durable implementation status is recorded in `continuation-handoff.md`. This does not delete or modify the files.
- [later] At Task 29, decide explicitly whether any more logs need publication. Scan the exact files to be committed for secrets and personal data first; do not assume `git add .agent-logs/` in this worktree includes the parent-only logs.

## 9. Independent verification, Phase 0 hardening, and Tasks 27-28 (2026-10-05)

Status: [verified] `main` and `feat/phase-1-foundation` point at the same commit and nothing is pushed. `npm test` passes (28 files, 234 tests, up from 139), `npm run typecheck` is clean and `npm run build` succeeds. Section 7's "33/33 hosted `rls:test`" claim was not independently verifiable at the time (hosted DNS was unreachable from the verifying tools); it is superseded by the hardened run below.

### 9.1 Independent verification of the Codex work

Five read-only agents re-checked Tasks 1-26 against the plan. Results:
- [verified] The claimed numbers reproduced (139 tests, typecheck, build, `POST /api/ask` with `{}` returns 400). No agent found a defect that broke the build or tests. Tracked content has no real secrets.
- [verified] On a throwaway local Postgres 17.5 the init migration behaved as designed: RLS on every table, anon and cross-user access blocked, search safe against injection-style input, `get_clip` leaks nothing beyond the clip window.
- [verified] Highlights, clips, search and Ask have no XSS path (no `dangerouslySetInnerHTML`; `<mark>` is rebuilt as React elements), keys never reach the client, and live citations are validated against retrieved hits.
- Design fact: every transcript is anon-readable by design (public demo workspace). Clips are a convenience link, not a privacy boundary; do not describe them as one.
- Design fact: `middleware.ts` only refreshes the session; `/meetings`, `/search`, `/team` and clip pages are public. Only highlight and share creation require sign-in.

### 9.2 Phase 0 fixes (three parallel streams, merged without conflicts)

- Seed (stream A): Ask answers are generated per scope (`my_calls` from the demo persona's hosted meetings only, `team_calls` from all) with 3 prompts each and citations limited to listed indices; seeded Ask id is `seedId('ask', scope + '\n' + prompt)`. `resolveDue` rewritten (weekday before `eod`, "next week" ordering, "in two weeks", "next month", "tonight"; invalid ISO dates return null; unresolved phrases are recorded as `due_phrase` and `seed:check` fails on them). Generation is atomic (tmp then rename), resumable per chapter and per summary template (`transcript.partial.json`, `summaries.partial.json`), bounded to 3 concurrent `claude` processes, and regenerating the brief or transcript deletes derived files. Chapter minutes must sum to the target within 5%. The eight meetings were moved to weekdays (`daysAgo` 3, 4, 5, 6, 7, 10, 11, 14). Summary prompts tell the model to omit unsupported sections. The showcase has a per-chapter speaking plan and `seed:check` requires at least 3% talk share per cast member. `seed:check` also validates real calendar dates, duplicate `(scope, prompt)`, scope enum, and highlight ranges.
- DB and scripts (stream B): migration `supabase/migrations/20261006000000_hardening.sql` adds explicit GRANTs and revokes default privileges, pins `search_path = public, pg_temp` on `get_clip` and `search_segments` (a temp-table hijack of `get_clip` was reproduced on the old function), makes `ask_answers` UNIQUE `(scope, prompt)`, replaces the `summaries` expression index with `UNIQUE NULLS NOT DISTINCT (meeting_id, template, user_id)` (PostgREST target `onConflict: 'meeting_id,template,user_id'`), adds CHECKs (`start_ms >= 0`, highlight title <= 80 and note <= 280, share slug format), FK indexes, and fixes `team_stats` double counting. `scripts/guard-target.ts` refuses to run `rls:test`, `seed:clips` or `seed:load` unless the URL ref matches the linked project, the service key decodes to `service_role`, and `.env.local` agrees with the shell environment. `supabase/tests/hardening.sql` holds 78 local SQL probes (all pass; they fail on an init-only database).
- App (stream C): Ask never 500s for a missing service key or a usage-table error (lazy admin client, extractive fallback), the rate limit reserves a usage row first then counts (no read-then-write race), the Anthropic SDK client has a 20 s timeout and no retries and the route exports `maxDuration = 30`; live Ask therefore gets one attempt and no JSON-repair retry [ruling, see 9.4]. Clip pages are `noindex`, cache `getClip` with `React.cache`, set `metadataBase`, and show a sign-in call to action. The scrubber seeks against the inner track, `safeNext` rejects `//` and `/\` results, session-cookie cache headers are applied in middleware and the auth callback, optimistic updates roll back with a toast, clipboard and sign-in failures are caught, `?auth_error=1` is shown, and `formatMs`/`parseTimeParam` handle NaN and `0x10`. `MeetingView` is keyed on the user id, which resets highlights on sign-out but also resets the playhead.
- Follow-ups folded in at merge: highlight `title` is capped at 80 in `highlightsFileSchema`, and `seed/load.ts` reads `ask.json` through `GEN_DIR`.

### 9.3 Hosted state

- [verified] The hardening migration was applied to the hosted project with `supabase db push` (dry run first). `supabase migration list` shows local and remote identical (`20261005000000`, `20261006000000`). All 12 tables have RLS on; at last check every table had 0 rows. The security advisor no longer flags `search_segments`; it still lists `get_clip` as anon- and authenticated-executable (intended, it serves public clip pages) and `ai_usage` as RLS-without-policy (intended, service role only).
- [verified] The hardened `npm run rls:test` passes against the hosted project ("All checks passed"), cleaning up its fixtures and test users. Its first hosted run crashed in setup on a fixture bug (a bulk insert sends omitted keys as `null`, defeating the `talk_time_sec` default); fixed in `97a31da`. It does not cover TRUNCATE privilege (PostgREST cannot reach it); `supabase/tests/hardening.sql` does.
- [verified] The feature worktree has its own real `.env.local` with the Supabase URL, an anon key and a service-role key (values not recorded here). The main checkout's `.env` holds only the DB password.
- [verified] The auto-mode classifier denied one read, `list_migrations` through the Supabase MCP; the CLI's `migration list` gave the same information.

### 9.4 Decisions and rulings

- [ruling] Live Ask uses one model attempt with retries off, so two 20 s attempts cannot exceed `maxDuration`. Cost if wrong: a malformed model reply returns the extractive fallback instead of a repaired answer. Raise the timeout and `maxDuration` to allow one repair retry if that matters.
- [ruling] `seed:check` fails (not warns) on a due phrase it cannot resolve, because an unresolved due date means wrong data. Cost if wrong: a hand edit of `actions.json` after an expensive run.
- [ruling] Merge order was done in the feature worktree first (three merge commits plus one follow-up), verified, then `main` was fast-forwarded. Nothing was pushed.

### 9.5 Open items after Phase 0

Not fixed, by design or for lack of data:
- No generated data exists (`seed/generated/` absent), so `seed:check`, `seed:load` (idempotence, twice) and the browser acceptance steps for Tasks 15 and 18-26 are unrun. The new `claude` CLI flags (`--safe-mode`, `--tools ""`, `--strict-mcp-config`, `--disable-slash-commands`, `--permission-prompts none`) are confirmed in `claude --help` but never run with a prompt; start with `npm run seed:gen -- eng-standup`.
- Google OAuth, the Supabase redirect allow-list, the Email provider (needed by `rls:test`, disabled at Task 29), and any live-model path are unverified.
- Seed loader: clear-then-insert is not transactional and never removes stale participants, meetings or calendar rows. `seed-clips` leaves a `demo-clips@example.test` auth user. `shares` daily cap (20) and its count-then-insert race remain app-only. A highlight or share range beyond the meeting duration cannot be CHECKed cheaply.
- App: `getDemoPersona` returning null silently shows all meetings; `useClock` jumps forward after a hidden tab resumes; participant tile colors can differ between card and meeting page (embedded `participants` has no order); transcript rows are one `<button>` each (about 1000 tab stops); tabs have no arrow-key roving; the header, page and middleware each call `getUser`; `?host=zzz` shows "All hosts" with zero calls; transcript deep-link scroll with `content-visibility: auto` is unchecked in a browser.
- Tests: there are no component or route tests, the query builders in `lib/queries.ts` are untested against real column names, and `useClock`/`useMs` are untested.

### 9.6 Process lessons

- The harness's isolated worktrees started from `origin/main` (`bc7bd74`, README only), not local `main`. Two agents ran `npm ci` before noticing and it partly deleted the main checkout's `node_modules` (8 entries left; gitignored, safe to remove or rebuild with `npm ci`). Every agent prompt now begins with a mandatory base-commit check before any npm command.
- Tasks 27 and 28 ran in parallel isolated worktrees, each prompted to verify its base commit first; both agents found the stale `bc7bd74` base and reset it before running npm. One agent stopped its test server with `pkill -f next-server`, which can also kill unrelated `next` processes; prefer killing by the PID or port you started.

### 9.7 Tasks 27 and 28 (merged)

- [verified] Task 28, `/calendar`: `components/CalendarConnect.tsx` and `app/calendar/page.tsx`. A demo "Connect Google Calendar" card that says plainly no real connection is made; once connected it lists `listUpcoming` events with a per-event `role="switch"` notetaker toggle (local state only). The connected flag is stored in `localStorage` key `calendar-connected`, read in an effect so the first render matches the server render. Times are UTC and labelled as such. The empty state is intentional (the hosted DB has 0 events). A data-layer failure returns a 500 that `app/error.tsx` renders (same as `/meetings`). Not checked in a browser.
- [verified] Task 27, live summary regeneration: `lib/regenerate.ts`, `lib/regenerate-db.ts`, `app/api/regenerate/route.ts`, `tests/regenerate.test.ts` (11 new tests) and the Regenerate control in `components/meeting/MeetingView.tsx`. Adaptations to the hardened schema:
  - The save is an upsert with `onConflict: 'meeting_id,template,user_id'` through the lazy service-role admin client, with the user id taken from `getUser` on the server (never from the request body). `summaries.id` has no default, so the adapter supplies `randomUUID()`. Values written (`source: 'live'`, `kind: 'regenerate'`) were checked against the table CHECK constraints.
  - Usage is reserved first (insert into `ai_usage`) then counted including that row; the model is called only if the count is at most 5 per hour. A failed model call or a failed save still counts. Not-found meetings and missing key or session cost nothing. Any usage or DB error fails closed (`unavailable`, 503); there is no extractive fallback and never an unmetered model call. Tests cover 25 concurrent requests.
  - `maxDuration = 60` (two 20 s attempts for one JSON retry plus DB time); `lib/llm.ts` is unchanged. Output is validated with `summaryFor(template)` (template-allowed headings, no duplicates); a bad reply retries once then returns `llm_failed`.
  - With no `ANTHROPIC_API_KEY` the button is disabled with an explanation (a server-side boolean, `liveAiEnabled`, never the key); a 401 opens the sign-in dialog and also toasts; other errors toast. The usage check runs after the transcript read (the plan did it before).
  - A production-build `POST /api/regenerate` with no key returns `{"error":"Live regeneration is not configured on this server"}`; a malformed body returns 400.
- Not verifiable without a key, hosted data or a browser: a real model call, the upsert against hosted Supabase, the sixth-attempt rate-limit message, the "Generated live" chip, own-summary-over-seed after reload, and the dialog and toasts.

### 9.8 Task 29 groundwork and environment hygiene

- [verified] `playwright.config.ts` and `e2e/smoke.spec.ts` (the plan's 9 signed-out tests) exist. The config adds a `webServer` (production build then `npm start`, reusing a running server) when `BASE_URL` is unset; with `BASE_URL` set it tests that deployment. Vitest only includes `tests/**/*.test.ts`, so the two runners do not collide. Playwright 1.63.0 with the installed Chromium works.
- [verified] First local run against the production build and the empty hosted database: 1 passed (friendly 404 for an unknown meeting and clip), 8 failed because no data is loaded. Page snapshots confirm it: `/team` shows "Calls 0, Team members 0" and `/meetings/q4-planning` shows the friendly 404, while the shell (search box, nav with Calendar, sign-in button) renders correctly. Every selector and string the tests use was matched against the real components (Play/Pause, the clock `m:ss / m:ss`, the `Insight` button, template buttons, `aria-label="Ask Fathom"`, the `Search call recordings` search box, the `Sign in to continue` heading, the clip page text). The seeded names and slugs the tests depend on come from `seed/meetings.ts` (`q4-planning`), `seed/team.ts` (Priya Raman) and `scripts/seed-clips.ts` (`demo-q4-clip`).
- [verified] Environment audit (names and set/empty only, never values): the app reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (all set in `.env.local`), plus optional `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `SEED_MODEL` (default `sonnet`), `NEXT_PUBLIC_SITE_URL` / `VERCEL_PROJECT_PRODUCTION_URL` (metadata base; Vercel sets the latter) and `EXPECT_SUPABASE_REF` (only if `supabase/.temp/project-ref` is absent). Nothing the build needs is missing. `.env.example` now documents all of them and where `SUPABASE_DB_PASSWORD` lives.
- [ruling] No `ANTHROPIC_API_KEY` is configured on purpose: live Ask and Regenerate are optional and degrade gracefully (the user may add a key in the Vercel dashboard later).
- [verified] Credentials for Task 29: `vercel` is logged in as `schwifty101` with no project linked in this checkout, `gh` is logged in as `Schwifty101`, and `claude` is logged in (claude.ai auth). Not credentials in a file, so still unconfigured: the Google OAuth client in the Supabase dashboard (Task 15), and the Supabase Site URL and redirect URLs (Task 29 Step 5, after the live URL exists).
- [verified] An earlier `npm audit --omit=dev` reported 2 findings (1 high, 1 moderate) in Next's nested PostCSS. `npm ls postcss --omit=dev` still shows `next@15.5.27 -> postcss@8.4.31`. The latest audit rerun failed with `ENOTFOUND` even outside the sandbox, so the current audit result was not reverified.
- [ruling] Accept this PostCSS finding for **this demo and its public demo deploy** with a trusted, checked-in CSS build; keep Next 15.5.27. The [XSS](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) and [file-read](https://github.com/advisories/GHSA-6g55-p6wh-862q) advisories require attacker-influenced CSS. Source review found `app/layout.tsx` importing `app/globals.css` and `postcss.config.mjs` configuring the build plugin, with no CSS upload or user-CSS processing path; the installed Next build CSS pipeline constructs PostCSS and passes it to the global CSS loader (`node_modules/next/dist/build/webpack/config/blocks/css/index.js`, `node_modules/next/dist/build/webpack/config/blocks/css/loaders/global.js`). This acceptance is limited to that input path. Cost if wrong: exposing the build to untrusted CSS would require an immediate reassessment.
- [later] Reassess the dependency fix after the demo, or before any untrusted CSS enters build or runtime processing. Treat a Next 16 migration as a separate change: its middleware-to-proxy and Turbopack changes need auth and browser verification.
- [verified] Hygiene: the main checkout's corrupted `node_modules` was removed and rebuilt with `npm ci` (typecheck passes there), its `.env.local` is now a symlink to the feature worktree's real file, and the five merged agent worktrees and branches were deleted (each branch was checked as merged into `main` and each worktree as clean first).
