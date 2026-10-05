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

Status: [verified] `/graphify .` was rerun on the updated main checkout. The ignored `graphify-out/` now contains `graph.html`, `GRAPH_REPORT.md`, `graph.json`, and a 146-file manifest. Extraction covered 131 code files and 15 documents; all three SQL files parsed (40 SQL nodes, 86 SQL edges). The graph has 747 nodes, 1,815 edges, and 37 communities. The read-only integrity check found 9 dangling endpoint edges, 2 self loops, and 31 undirected same-endpoint collapses; 23 external-reference edges were identified separately. These warnings were resolved afterwards (section 9.9); the graph described here was superseded. Semantic-agent token usage was unavailable and the cost tracker records zero, not an estimated cost. This supersedes the older 297-node graph assessment.

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
- Seed loader: **addressed in section 10.5** (upsert-then-prune, validate before write, `--dry-run`). Still true: it is not all-or-nothing and has never run against the hosted database. `seed-clips` already reuses its `demo-clips@example.test` user; deleting it would cascade-delete both demo clips (`shares.created_by` is NOT NULL), so the earlier note describing it as a defect is withdrawn. The `shares` daily cap (20) and its count-then-insert race remain app-only. A highlight or share range beyond the meeting duration cannot be CHECKed cheaply.
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

### 9.9 Graphify health repair (dangling endpoints, self-loops, edge collapses)

- [verified] GPT's partial work was left untracked in the main checkout: `scripts/repair-graphify.mjs` and its test. Its all-zero health file (`graphify-out/.graphify_health.json`) came from an older extraction. A fresh AST pass over the current code is deterministic (641 nodes, 1718 edges, identical to GPT's) and reproduced all three problems: 9 dangling-endpoint edges (plus 29 external-reference edges), 2 self-loops, and 31 same-endpoint collapses (28 groups).
- Three read-only audit agents ran in parallel with the semantic extraction of the 14 docs (91 nodes, 142 edges, 3 hyperedges; token usage unavailable; coverage partial, the extractor skimmed the plan's task bodies and three large session logs).
- Dangling endpoints: [verified] GPT's handling was correct. All 38 edges (17 targets) point at genuinely external things (8 Python stdlib modules, 28 `node:*` builtins, 3 `server-only`) or at `app/globals.css`, which the AST does not parse. No internal `@/` alias was hiding as external. graphify's own `build_from_json` already mints the same stubs. Only change: human-readable labels (`node:fs`, not `ref_node_fs`).
- Self-loops: [verified] both are false positives (`lib/auth.ts` L6 `db.auth.getUser()` and `seed/load.ts` L18 `db.from(t).upsert(...)`, member calls resolved to the enclosing function of the same name); there is no genuine recursion. GPT's exemption keyed on id plus line number, so any edit would bring them back. Replaced with a rule that reads the source line (`isPhantomSelfCall`): drop a `calls` self-edge only when the line has a member call and no bare call, keep when unsure. [ruling] It is restricted to self-loops. One more arguable phantom exists (`tests/pool.test.ts` L48, `limited.complete(...)` linked to a mock method) and is left alone.
- Edge collapses: [ruling] GPT's design (promote the extra parallel edges to synthetic `edge_fact` nodes) was rejected after measurement. It zeroed the counter by changing endpoints, added 32 nodes that the report listed as if they were code in 8 communities, inflated the degree of 46 real nodes and moved the largest community from 69 to 101 nodes (no false shortest paths, though). Replaced by one merged edge per node pair, the strongest relation as primary, every fact kept in `parallel_facts`, no synthetic nodes. The collapse was a real loss before: for 22 groups graphify kept `relation=contains` with call context and dropped the `calls` fact. Trade-off: no graphify command reads `parallel_facts`, so `query` and `explain` do not show the extra facts; they are in `graph.json`.
- [verified] Result: the repaired extraction passes graphify's health check with all counters at zero, and an independent check of the final `graphify-out/graph.json` found 750 nodes, 1825 links (every extracted edge survived the build), 0 dangling endpoints, 0 self-loops, 0 collapsed pairs, 0 synthetic nodes, 17 external stubs plus the CSS asset node, 30 edges carrying 63 preserved facts, and 38 labeled communities. `node --test scripts/repair-graphify.test.mjs` passes (8 tests).
- Workflow: stock graphify does not repair anything. After every `/graphify .` or `--update`, run `node scripts/repair-graphify.mjs <raw-extraction.json> <repaired.json>` from the repo root before building the graph. Because the previous graph had synthetic nodes, the first build with fewer nodes needed graphify's `force=True` (shrink guard #479); normal rebuilds do not.
- [verified] The incremental flow works with the repair: `/graphify . --update` after the ledger, handoff and a session log changed (no code changed) re-extracted only those 3 docs with the old node ids reused so edges from untouched files did not dangle (`build_merge` drops and replaces a re-extracted file's nodes), merged into the repaired graph, and the merged extraction was already clean; running the repair on it was a no-op (766 to 766 nodes, 1847 to 1847 edges), so it is idempotent. Result: 766 nodes, 1847 edges, 36 communities, 0 dangling, 0 self-loops, 0 collapsed pairs. `graphify-out/.graphify_health.json` is a leftover from the earlier GPT run (older 816-node graph) and no longer describes the graph.
- Not covered: a multi-line call chain whose member call is not on the edge's line is kept (conservative); node-level extractor flaws such as three same-named nested `complete()` functions merged into one node by id collision are neither fixed nor detected by the repair.

## 10. Session break and cloud continuation (2026-10-05, evening)

Tags as above; **[chat]** means taken from the user's pasted transcript of the interrupted local session and not re-run here.

### 10.1 What the interrupted local session did

- [chat] Task 11 probe: `npm run seed:gen -- eng-standup` ran with the new `claude` CLI flags and succeeded (five files). `.agent-logs/` stayed empty during generation, so the flags suppress the capture hook. Read-through found natural dialogue, the correct cast and no real-world name leakage. `seed:check` flagged three same-day deadline phrases.
- [chat] Five background agents were launched with disjoint file ownership (seed loader hardening, README and walkthrough, manual-test checklist, UI robustness and accessibility, static schema conformance tests) and stopped before finishing when the session limit hit. Their worktrees were on the user's machine. [verified] None of their work is on the remote: `origin` held only `main` at `cb114e6` and nothing from them. Treat those five items as not started unless the user supplies the local worktrees.
- [verified] `cb114e6` on `origin/main` holds the eng-standup bundle (`seed/generated/eng-standup/`, five files), four session logs under `.agent-logs/` and `.vscode/settings.json`.

### 10.2 Done in the cloud session

- [verified] Baseline reproduced from a clean `npm ci` (Node 22.22.0 here, Node 24 locally): 28 files / 234 tests pass, `npm run typecheck` clean.
- [verified] `resolveDue` now resolves intraday phrases ("within the hour", "before noon", "by mid-afternoon", "by 3pm", "this afternoon", "in 45 minutes") to the meeting day. The check runs last, so a weekday, "tomorrow", "end of week" or "next week" still wins; a bare "morning" stays unresolved. 17 rows added to `tests/due.test.ts` (red first: 10 failed, then all pass). Suite is 28 files / 251 tests, typecheck clean.
- [verified] The probe bundle's three stale `"due": null` entries in `seed/generated/eng-standup/actions.json` were set to `2026-10-02` (the meeting date). `seed:check` now reports `eng-standup: 100 lines, 15 min, 6 highlights` with no error for it. The remaining 8 problems are the 7 meetings not yet generated plus `ask.json`.
- Commit `df998c7` on `claude/serene-galileo-yn8oce`.

### 10.3 Blockers in the cloud environment (verified)

- The container network policy returns 403 to CONNECT for `ifnrsvuxzfdxtcclndjp.supabase.co:443`. From here `seed:load`, `seed:clips`, `rls:test` and the e2e smoke run against hosted data cannot execute. The Supabase variables are set in the container environment and the URL matches the ledger ref.
- Not installed or not enabled in the cloud session: the `graphify`, `supabase` and `vercel` CLIs and the ponytail, superpowers and graphify plugins or skills (`ListPlugins` and `ListSkills` returned nothing). `graphify-out/` is gitignored and is not on the remote.
- `claude` 2.1.289 is logged in via an OAuth token here. Which account's quota a `seed:gen` run would spend was not checked and no generation was run.

### 10.4 Secret scan of what is already public

- [verified] Task 29 Step 9 regex over `.agent-logs`, `docs`, `seed`, `lib`, `app`, `components`, `scripts`, `e2e`, `supabase`: 5 matches, all prose describing the scan itself (no key values). The literal DB password, service-role key and anon key from the container environment are absent from `HEAD`; the password is also absent from the last 20 commits. Not yet done: a full-history scan and a scan of the other three logs for personal data.

### 10.5 Parallel workstreams merged into this branch

All five ran as plain subagents (ponytail, superpowers and graphify were unavailable). Each branch was re-verified by the controller after merging: the figures below are the controller's, not the agents'.

- [verified] UI robustness and accessibility (6 of 7 items fixed, test first; item 7 investigated only): no demo persona now shows an empty My Calls with an explanation; a clock frame is capped at 250 ms so a hidden tab cannot throw the playhead forward; card and page participant order match; the transcript is one tab stop with arrow keys; the meeting tabs respond to arrow, Home and End; `/team?host=zzz` shows a truthful state. Not browser-checked. Reducing the repeated `getUser` calls is possible only with a shared `React.cache` helper and was left alone until the Task 29 browser acceptance. Defects found but not fixed are listed in the agent report: the `h` shortcut cannot be disabled and has no repeat guard (`components/meeting/MeetingView.tsx`), no `<h1>` on the list pages and no skip link, tabs unmount inactive panels (Ask and Summary state is lost on every switch), the Ask panel has no live region, the scrubber lacks Home, End and Page keys and can show `NaN%` for a zero duration, `signOut` has no try/catch, clip lane colours follow first appearance, the due date shows as a raw ISO string, and three participants leave an empty tile on the card.
- [verified] A real app bug found by the README agent and confirmed in code: every seeded transcript starts at 1000 ms, so before that `addHighlight` found no active segment and returned before the sign-in check, leaving a signed-out visitor with no dialog (and failing the smoke test that presses Insight straight after Play). Fixed with `planHighlight` (sign-in gate first), test first.
- [verified] README and `docs/walkthrough.md` written, with `<LIVE_URL>` and `<REPO_URL>` placeholders. Still to confirm by the user: the "Left out, and why" reasons are the agent's wording from spec sections 1 to 3, and the plan's "1,000 lines" transcript figure is not supported by the data (lines are 8 to 35 words and eng-standup has 100 lines for 15 minutes, so a 62-minute call is roughly 300 to 600 lines).
- [verified] Seed loader rewritten as upsert-then-prune with `--dry-run`, 33 tests against a fake client (23 failed against the old algorithm). It deletes by explicit id, guards user-owned tables with `user_id is null`, and runs the target guard first. **Open decision:** pruning a meeting that leaves the seed also removes users' highlights, summaries and shares on it (FK cascade); the loader logs a warning and proceeds. An abort-unless-flag default is a small change if you prefer it. Unverified: PostgREST behaviour of range paging and `in()` deletes against the real database.
- [verified] Manual checklist `docs/manual-test-checklist.md`: 296 items in 16 sections with a tally table (section totals checked against the real item counts) and a tally helper that runs. Written from the plan, spec and code only (nothing was run against data). After the UI merge the controller rewrote KR-05 to KR-11 as post-fix expectations and added KR-13 (signed-out Insight in the first second). The agent's open questions are listed at the end of that file; the controller verified two: the design doc says transcript text 16px and a 30/36 regular page title while the code uses `text-sm` (14px) and `text-2xl font-semibold` (24px), and `seed:load` should report `ask_answers: 6` (3 prompts per scope, two scopes), now corrected in the plan. Unverified by the controller (the agent's code reading): My Calls month headings (plan says all four under October 2026, the seed dates put three in September), the "← My Calls" link on calls Priya does not host, the mobile section order, auto-follow stopping only on wheel or touch, cyan used more widely than the guide allows, and highlight colours having no text label on the scrubber.
- Still running when this was written: the static schema conformance tests.
