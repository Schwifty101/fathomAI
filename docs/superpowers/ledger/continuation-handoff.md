# Fathom rebuild: continuation handoff

Last updated: 2026-10-05, evening, after the deploy and data load. The "Environment and repository state" section below still describes the earlier cloud session. This is the current-state file; if it disagrees with anything older, this file wins. Working rules are in `/CLAUDE.md`. The detailed history is `decisions-and-open-items.md` (read its "How to read this file" table first), and the plan and spec sit beside it.

## Where things stand

Last verified 2026-10-05, evening, from the user's machine.

- Tasks 1 to 28 are implemented. Task 29 (ship) is mostly done: the app is deployed on Vercel (project `fathom-rebuild`, connected to `Schwifty101/fathomAI`, production `https://fathom-rebuild-eight.vercel.app`), and every push to `main` redeploys it.
- [verified] `npm test` 48 files, 487 passed plus 1 expected failure (a deliberate `it.fails` marking that `ask_answers.scope` has no CHECK); `npm run typecheck` clean; `npm run build` compiles.
- [verified] All 8 meetings are generated and pass `seed:check` (eng-standup from `seed:gen`; the other seven written by hand through `seed:assemble`, with shorter targets of 15 to 25 minutes; the showcase `q4-planning` is 62 minutes with 8 speakers).
- [verified] Hosted Supabase (ref `ifnrsvuxzfdxtcclndjp`) is loaded: 8 team members, 8 meetings, 33 participants, 863 segments, 36 chapters, 32 summaries, 56 action items, 47 highlights, 6 ask answers, 5 calendar events. `seed:load` run twice gave identical counts. `seed:clips` made `/clip/demo-q4-clip` and `/clip/demo-q4-clip-2`. `npm run rls:test` passed in full and cleaned up after itself.
- [verified] `BASE_URL=https://fathom-rebuild-eight.vercel.app npm run e2e`: 9 of 9 passed.
- New: a signed-in visitor can use their own Anthropic, OpenAI or Gemini key for Ask and Regenerate (`lib/byo-key.ts`, `lib/byo-key-store.ts`, `components/LlmKeyForm.tsx`, `lib/llm.ts`). The key stays in the browser and travels in `x-llm-*` headers per request; hourly limits still apply. OpenAI and Gemini are called with plain `fetch`. [unverified] Neither provider was called with a real key. The model name is a required field for OpenAI and Gemini because no default could be verified.
- Not checked in a browser: Google sign-in on the live site, the manual checklist, the visual drift items.

## Gates still open

| # | Gate | Next action |
| --- | --- | --- |
| 1 | Google sign-in on the live URL | The Supabase Site URL, redirect URLs and the Google client's JavaScript origin must name `https://fathom-rebuild-eight.vercel.app` (the domain `fathom-rebuild.vercel.app` was not available). Then try it in a browser. |
| 2 | Browser acceptance | `docs/manual-test-checklist.md`: `G` items need Google sign-in, `K` a key (the server `ANTHROPIC_API_KEY` is not set on Vercel; a visitor key works instead), `D` loaded data (now available). |
| 3 | Visual review (Task 14) | Open. VR-11 and VR-12 record the 14px vs 16px and title drift from `docs/design/design-system.md`. |
| 4 | Close-out (Task 29 Steps 11 to 12) | Re-run `rls:test` after any schema change, disable the Email provider in Supabase, rotate the DB password. The user does these in the dashboard. |
| 5 | History purge | `graphify-out/` is still in the history of `main`. The rewritten history is prepared in a temp clone; the force-push needs the user (see the session notes). Back up the local `graphify-out/` before resetting. |

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
- **Knowledge graph.** `graphify-out/` is committed on `main` (the user's `e42446c` and `cfeb6fa`, which also commented the ignore line out of `.gitignore`): 766 nodes, 1847 edges, 36 communities, no dangling edges or self-loops (checked 2026-10-05), built at `6a43498`. It predates this session's code (no `lib/roving.ts`, `lib/slider.ts`, `lib/team-filter.ts`, the schema tests, the rewritten `seed/load.ts`, `CLAUDE.md`), so run `/graphify . --update`, then `node scripts/repair-graphify.mjs <raw> <repaired>`, before relying on it (ledger 9.9; `node --test scripts/repair-graphify.test.mjs`). `graphify-out/.graphify_health.json` is a stale leftover (816 nodes). `.graphify_root` and `.graphify_python` hold the user's local macOS paths and username and are public on `main`.
- **Agent logs.** `.agent-logs/` is public. The capture hook rewrites the live session's log every turn, so rescan it before each commit (CLAUDE.md). The four logs pushed in `cb114e6` were scanned for secrets, not for personal data.
- **Agent worktrees.** The cloud session's seven temporary agent worktrees and branches were merged and removed. Isolated worktrees may start from `origin/main` rather than your branch: check the base commit before any `npm` command.

## Tidy-ups and known stale spots

- `docs/superpowers/plans/2026-10-05-fathom-rebuild.md` is partly stale; its banner lists the known deviations. Reconciling the whole 7,000-line plan with reality is a large edit and has not been done.
- `tests/a11y-shell-jsx.ts` reads component source with the TypeScript parser because vitest could not import `.tsx` at the time. JSX now works in vitest (`tests/jsx-render.test.ts`), so those tests could be replaced with real `renderToStaticMarkup` tests. Optional.
- Kept deliberately although they look redundant: `CAPTURE-TEST.md` (evidence for the log-capture hook), `seed/ping.ts` (one-word `claude` auth probe, spends a few tokens), `scripts/repair-graphify.*` (developer-only), `.agent-logs/` (a required public deliverable).
- Not verified at runtime: the PostgREST embed `host:team_members(...)` on meetings (only one foreign key was confirmed), the transcript deep-link scroll with `content-visibility: auto`, and real `requestAnimationFrame` behaviour after a hidden tab resumes.
