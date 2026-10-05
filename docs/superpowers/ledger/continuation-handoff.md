# Fathom rebuild continuation handoff

Date: 2026-10-05. Branch: `feat/phase-1-foundation`; worktree: `.claude/worktrees/feat+phase-1-foundation` under the main checkout. The source of truth for requirements is `docs/superpowers/plans/2026-10-05-fathom-rebuild.md`, with the design spec beside it in `docs/superpowers/specs/`. The older `decisions-and-open-items.md` records the initial Claude agent work and deferred review findings.

## Stop point

The current implementation ends at **Task 26, Ask Fathom** (`d22e7d5`). Do not begin Tasks 27-29 as part of this handoff. Tasks 1-10 have code and checks; Task 11 has not produced data. Task 12's checker and Task 13's loader are committed but cannot pass their real-data gates until Task 11 is run. Tasks 14-26 have implementation commits, but several browser and hosted-service checks remain open. The branch has not been merged, pushed, or deployed.

The latest local checks on the feature branch passed: `npm test` (24 files, 139 tests), `npm run typecheck`, `npm run build` (including `/api/ask`), and `git diff --cached --check`. An invalid `POST /api/ask` returned HTTP 400 in an earlier local production-server smoke check. The Ask unit tests cover canned answers, scope isolation, extractive fallback, rate limit, live citation mapping, and model failure. They do not prove that a hosted database, Google sign-in, or a live model call works.

## What is waiting on services or real data

| Gate | Current evidence | Resume action |
| --- | --- | --- |
| Task 11 synthetic meetings | No eight meeting bundles or `ask.json` in the ignored seed output. A first `eng-standup` attempt found this tool process logged out of Claude. The user later confirmed `claude auth status` is true in their terminal, but this tool process still saw false; the user's session quota had also been reached. | From the feature worktree and a terminal with working Claude access, run `npm run seed:gen -- eng-standup`, inspect that bundle, then run `npm run seed:gen`. Review output quality before loading. |
| Tasks 12-13 data and DB gates | `npm run seed:load` stopped at its missing-bundle preflight before any DB writes. On this date the Supabase hostname lookup returned `ENOTFOUND` from the tool process both inside and outside its sandbox. | Run `npm run seed:check`, then `npm run seed:load` twice for idempotence, `npm run rls:test`, and the anon search check in the plan after DNS/data are available. |
| Tasks 15, 18-26 runtime | The app builds, but meeting lists, playback, summary, highlights, clips, search, and Ask cannot be checked against populated hosted data from this process. Google OAuth configuration and signed-in behavior are unverified. | Follow each task's browser acceptance steps after loading data and configuring Google OAuth. For Task 26, check suggested chips/citations, scope restriction, fallback, and a live answer only if a server-side Anthropic API key is deliberately provided. |
| Task 14 visual review | The user installed Chromium and ran the public-reference capture. Ignored screenshots exist under `docs/design/refs/`; the design system document and `/design` page are tracked. Superdesign's remote extraction failed DNS from this process. | Review the saved 1280px/390px design captures and reduced-motion result in the user's browser environment before treating visual acceptance as complete. |

Task 26 deliberately restricts canned answers to the matching scope. The seeded generation currently creates My Calls prompts, so Team Calls has no canned chips. Ask still accepts free text and uses scoped search. The panel hides initial-scope chips when the visitor switches scopes.

## Merge and repository state

The user authorized merging into `main` **if everything is working**. That condition is not met while data generation, hosted DB, OAuth, and browser checks are outstanding. Keep this feature branch available and leave `main` unchanged until the gates above pass. When they do, rerun tests/typecheck/build, inspect the diff and worktree status, then integrate the branch and commit the merge as appropriate. The local `main` is already five commits ahead of `origin/main`; nothing has been pushed.

The main checkout has untracked `.env`, `graphify-out/`, `supabase/` (including `config.toml` and local `.temp` state), and five `.agent-logs` files. Do not use `git add -A` there. In particular, inspect the untracked `supabase/config.toml` before a future merge because the feature branch tracks a file at the same path. Preserve the main checkout's local state and credentials.

## Claude agents, graph, and logs

Claude's controller used isolated worktrees and cherry-picked Tasks 1-9 into this branch, including the schema/RLS, shared libraries, LLM adapter, due-date logic, roster, and meeting definitions. Subsequent commits on the same branch implement Tasks 10 and 12-26. The graphify agent left a working-tree edit to `decisions-and-open-items.md`; its later claims about a rebuilt SQL graph were not reflected in the saved graph artifact. The currently saved ignored graph has 297 nodes, 397 links, and no SQL-sourced nodes, so treat it as preliminary.

The capture hook used the main checkout's project directory. Consequently, five untracked session logs are only in the main checkout; three earlier logs are tracked on this branch. The five local transcripts were left in place and not published in this handoff. The user stated that the DB password is absent from the logs and graph output; scan any exact log set proposed for publication again at Task 29. Do not copy logs into the branch automatically.

## Next planned work

After the current gates pass and the user resumes new work, the plan continues with Task 27 (live summary regeneration), Task 28 (calendar stub), and Task 29 (deploy, smoke test, README, repository). This handoff records those tasks without starting them.
