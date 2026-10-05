# Fathom rebuild: continuation handoff

Last updated: 2026-10-05, evening, after the deploy, data load and calendar merge. This is the current-state file; if it disagrees with anything older, this file wins. Working rules are in `/CLAUDE.md`. The detailed history is `decisions-and-open-items.md` (read its "How to read this file" table first), and the plan and spec sit beside it.

## Where things stand

Last verified 2026-10-05, evening, from the user's machine.

- Tasks 1 to 28 are implemented. Task 29 (ship) is mostly done: the app is deployed on Vercel (project `fathom-rebuild`, connected to `Schwifty101/fathomAI`, production `https://fathom-rebuild-eight.vercel.app`), and every push to `main` redeploys it.
- [verified] `npm test` 60 files, 582 passed plus 1 expected failure (a deliberate `it.fails` marking that `ask_answers.scope` has no CHECK); `npm run typecheck` clean; `npm run build` compiles.
- [verified] All 8 meetings are generated and pass `seed:check` (eng-standup from `seed:gen`; the other seven written by hand through `seed:assemble`, with shorter targets of 15 to 25 minutes; the showcase `q4-planning` is 62 minutes with 8 speakers).
- [verified] Hosted Supabase (ref `ifnrsvuxzfdxtcclndjp`) is loaded: 8 team members, 8 meetings, 33 participants, 863 segments, 36 chapters, 32 summaries, 56 action items, 47 highlights, 6 ask answers, 5 calendar events. `seed:load` run twice gave identical counts. `seed:clips` made `/clip/demo-q4-clip` and `/clip/demo-q4-clip-2`. `npm run rls:test` passed in full and cleaned up after itself.
- [verified] `BASE_URL=https://fathom-rebuild-eight.vercel.app npm run e2e`: 9 of 9 passed.
- New: a signed-in visitor can use their own Anthropic, OpenAI or Gemini key for Ask and Regenerate (`lib/byo-key.ts`, `lib/byo-key-store.ts`, `components/LlmKeyForm.tsx`, `lib/llm.ts`). The key stays in the browser and travels in `x-llm-*` headers per request; hourly limits still apply. OpenAI and Gemini are called with plain `fetch`. [unverified] Neither provider was called with a real key. The model name is a required field for OpenAI and Gemini because no default could be verified.
- New, merged to `main` and live: `/calendar` is a real Google Calendar page. "Connect Google Calendar" requests the single scope `https://www.googleapis.com/auth/calendar.events`; the page then lists the next 25 real events and can schedule a call with a Google Meet link (`lib/google-calendar.ts`, `lib/google-session.ts`, `lib/token-seal.ts`, `app/calendar/`, `components/CalendarConnect.tsx`, `components/ScheduleCallForm.tsx`). The refresh token lives in a sealed httpOnly cookie `fathom_gcal` bound to the user id (per browser; no table, no migration). Ordinary sign-in is unchanged. Env vars: `GAUTH_CLIENT_ID`, `GAUTH_CLIENT_SECRET`, `CALENDAR_COOKIE_SECRET` (32 or more characters). The three are set in Vercel for Production and Preview (2026-10-05); redeploy if a deployment predates them. The recording bot is still simulated. [unverified] Nothing Google-facing has been run in a browser; the Google Cloud steps in gate 6 are required first. Checklist section 14a (GC) covers it; the old CA items describe the earlier stub and are superseded.
- New: skeleton loading screens exist for every data route (`app/**/loading.tsx`, six of them, built on `components/ui/Skeleton.tsx`). Measured on 2026-10-05: the Vercel function runs in `iad1` while Supabase is in Seoul, so time to first byte is 1.1 to 2.6 s. Setting the function region to `icn1` in `vercel.json` is an untested option (no `vercel.json` exists yet).
- Not checked in a browser: Google sign-in on the live site, the manual checklist, the visual drift items.

## Gates still open

| # | Gate | Next action |
| --- | --- | --- |
| 1 | Google sign-in on the live URL | The Supabase Site URL, redirect URLs and the Google client's JavaScript origin must name `https://fathom-rebuild-eight.vercel.app` (the domain `fathom-rebuild.vercel.app` was not available). Then try it in a browser. |
| 2 | Browser acceptance | `docs/manual-test-checklist.md`: `G` items need Google sign-in, `K` a key (the server `ANTHROPIC_API_KEY` is not set on Vercel; a visitor key works instead), `D` loaded data (now available). |
| 3 | Visual review (Task 14) | Open. VR-11 and VR-12 record the 14px vs 16px and title drift from `docs/design/design-system.md`. |
| 4 | Close-out (Task 29 Steps 11 to 12) | Re-run `rls:test` after any schema change, disable the Email provider in Supabase, rotate the DB password. The user does these in the dashboard. |
| 5 | History purge | Done 2026-10-05: `graphify-out/` removed from all history with `git filter-repo`, `main` and `claude/serene-galileo-yn8oce` force-pushed (every SHA changed; `main` is now `4aab2e1` plus later commits). Other local clones may still hold the old history; re-clone or `git reset --hard origin/main`. The agent worktrees under `.claude/worktrees/` were removed on 2026-10-05. GitHub keeps old commits reachable by SHA until it garbage-collects; a full purge needs a GitHub support request. |
| 6 | Google Calendar setup | In Google Cloud, for the OAuth client's project: enable the Google Calendar API; add the `https://www.googleapis.com/auth/calendar.events` scope on the OAuth consent screen; while the app is in Testing status add every tester as a test user (a sensitive scope makes an unverified app show a warning screen and caps it at 100 users until Google verifies it). Vercel has `GAUTH_CLIENT_ID`, `GAUTH_CLIENT_SECRET` and `CALENDAR_COOKIE_SECRET` for Production and Preview [set by the controller on 2026-10-05, values are hidden so this cannot be re-checked here]; redeploy so they take effect, and set the same three in `.env.local` to try it locally. Then run checklist section 14a, and these browser checks (none has been run): (a) after Connect, paste this in the browser console on the signed-in site: `const v=document.cookie.split('; ').filter(c=>/^sb-.+-auth-token(\.\d+)?=/.test(c)).sort().map(c=>c.slice(c.indexOf('=')+1)).join('').replace(/^base64-/,''); !('provider_refresh_token' in JSON.parse(atob(v.replace(/-/g,'+').replace(/_/g,'/'))))` (it prints only a boolean: `true` means the provider refresh token is NOT in the Supabase session cookie, so the fix works; `false` means it is still there), and you are still signed in; a plain substring search of `document.cookie` is not enough because the value is base64url encoded, and if the console throws, inspect DevTools > Application > Cookies instead without copying the value anywhere; (b) cancelling Google's consent screen lands on `/meetings?auth_error=1` while still signed in (existing callback behaviour); (c) unticking the calendar box on Google's granular consent screen shows the unavailable message; (d) connecting with a different Google account switches the signed-in user (expected). |

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
- Optional history cleanup: 77 of 142 commits carry a `Co-Authored-By` trailer naming a model (checked 2026-10-05 with `git log -i --grep='co-authored-by'`). Commit author fields show the user's Gmail address.

## Environment and repository state

- **Local machine.** Node 22 or newer. `.env.local` is a normal file in the main checkout (it is no longer a symlink; `.env*` stays untracked). The `supabase` CLI has been linked to the project (`supabase/.temp` is untracked). `gh` is logged in. The only worktree is the main checkout. Never `git add -A` here.
- **Knowledge graph.** `graphify-out/` is gitignored and no longer in the history (see gate 5). A local copy built on 2026-10-05 (1271 nodes, 3323 edges, 60 communities, repaired and healthy) sits in the ignored folder; refresh it with `/graphify . --update` then `node scripts/repair-graphify.mjs <raw> <repaired>` (ledger 9.9).
- **Agent logs.** `.agent-logs/` is public. The capture hook rewrites the live session's log every turn, so rescan it before each commit (CLAUDE.md). The four logs pushed in `cb114e6` were scanned for secrets, not for personal data.
- **Agent worktrees.** Isolated worktrees may start from `origin/main` rather than your branch: check the base commit before any `npm` command.

## Tidy-ups and known stale spots

- `docs/superpowers/plans/2026-10-05-fathom-rebuild.md` is partly stale; its banner lists the known deviations. Reconciling the whole 7,000-line plan with reality is a large edit and has not been done.
- `tests/a11y-shell-jsx.ts` reads component source with the TypeScript parser because vitest could not import `.tsx` at the time. JSX now works in vitest (`tests/jsx-render.test.ts`), so those tests could be replaced with real `renderToStaticMarkup` tests. Optional.
- Kept deliberately although they look redundant: `CAPTURE-TEST.md` (evidence for the log-capture hook), `seed/ping.ts` (one-word `claude` auth probe, spends a few tokens), `scripts/repair-graphify.*` (developer-only), `.agent-logs/` (a required public deliverable).
- Not verified at runtime: the PostgREST embed `host:team_members(...)` on meetings (only one foreign key was confirmed), the transcript deep-link scroll with `content-visibility: auto`, and real `requestAnimationFrame` behaviour after a hidden tab resumes.
