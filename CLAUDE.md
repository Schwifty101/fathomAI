# Fathom rebuild: guide for Claude Code

A public rebuild of the Fathom AI meeting notetaker: Next.js 15 (App Router, React 19, Tailwind 4, TypeScript) on hosted Supabase (Postgres, Auth, RLS). Meeting data is synthetic, generated with `claude -p` and committed as JSON. The recording bot, media and calendar are simulated. See the README table "What is real and what is stubbed".

## Start here, in this order

1. `docs/superpowers/ledger/continuation-handoff.md`: current state, gates, next steps, open decisions. Trust it over anything older.
2. `docs/superpowers/ledger/decisions-and-open-items.md`: detailed history. Read its "How to read this file" table first; sections 10.x are the latest.
3. `docs/superpowers/plans/2026-10-05-fathom-rebuild.md` (task text) and `specs/` (design). The plan is partly stale (see its banner). Open a task's text only when working on that task.
4. `docs/manual-test-checklist.md`: what the user ticks off by hand in a browser.

## Commands

- `npm ci`, `npm test` (vitest, node environment, JSX enabled), `npm run typecheck`, `npm run build`. Node 22 or newer.
- `npm run seed:check` (no database), `npm run seed:load -- --dry-run`, `npm run seed:load`, `npm run seed:clips`, `npm run rls:test` (needs `.env.local` and the Email provider on), `npm run e2e` (needs loaded data).
- `npm run seed:gen [-- <slug>]` runs `claude -p` on the user's login and spends their quota.

## Rules

- Never `git add -A` or `git add .`. Stage explicit paths. `.env*`, `graphify-out/` and `supabase/.temp` must stay untracked.
- Never print, log or paste a secret value (`SUPABASE_SERVICE_ROLE_KEY`, the anon key, `SUPABASE_DB_PASSWORD`, `ANTHROPIC_API_KEY`). `.agent-logs/` is public. Before committing a log: `grep -ciE '(sk-ant-|eyJ[A-Za-z0-9_-]{30,}|SUPABASE_DB_PASSWORD=|service_role["'"'"': =]+eyJ)' <log>` must print 0, and `grep -qF "$VALUE" <log>` must find none of the real values.
- Do not write to the hosted database (`seed:load`, `seed:clips`, `rls:test`, SQL through a connector) without the user's explicit go-ahead in the current conversation. `scripts/guard-target.ts` checks the project ref; run `--dry-run` first; pass `--allow-cascade` only when the user approves deleting user data.
- Ask before spending quota (`seed:gen`, `seed/ping.ts`), deploying, creating a repository, or pushing to a branch the user has not named.
- Schema: add a new migration, never edit an applied one, and update `tests/schema-conformance.test.ts` (it checks every query, payload key, `onConflict` and `.rpc` call against the migrations).
- Behaviour changes are test first. Keep `npm test`, `npm run typecheck` and `npm run build` green. No new dependencies without asking. There is no jsdom; test pure logic in `lib/`, or render with `renderToStaticMarkup`.
- Do not change `middleware.ts`, `lib/auth.ts` or `lib/supabase/**` without verifying sign-in in a browser.
- Subagents: isolated worktrees may start from `origin/main`, not your branch. Begin every prompt with `git log --oneline -1`, `ls package.json` and a base-commit check before any `npm` command. Give each agent disjoint files. Never `pkill -f`; kill the PID you started.
- Never say something works unless you ran it. Label browser and hosted results as unverified.
- Prose and comments: British English, no em dashes.
- graphify: after `/graphify .` or `--update`, run `node scripts/repair-graphify.mjs <raw> <repaired>` before building (ledger 9.9). `graphify-out/` is gitignored.

## Facts that bite

- Every transcript is readable signed out by design; a clip link is a shortcut, not access control. Only highlights and shares need Google sign-in.
- "My Calls" is the calls hosted by one fixed demo persona (Priya Raman), shown to everyone. All times are UTC.
- Seeded ids are stable (`seed/uuid.ts`). `summaries` is unique on `(meeting_id, template, user_id)` with NULLS NOT DISTINCT; `ask_answers` is unique on `(scope, prompt)`.
- Live Ask and Regenerate are optional behind a server-only `ANTHROPIC_API_KEY`; without it they degrade (stored or extractive answers, disabled button). Rate limits: Ask 10 an hour, Regenerate 5 an hour.
- `seed:check` fails on an unresolved due phrase; due dates are resolved in code (`seed/due.ts`), not by the model.

## Map

`app/` routes and API handlers, `components/` UI (`meeting/` for player, transcript, tabs), `lib/` shared logic and Supabase clients, `seed/` team and meeting definitions, generator, checker, loader and `generated/` data, `scripts/` guard, rls test, clip seeding, graphify repair, `supabase/` migrations and SQL probes, `tests/` vitest, `e2e/` Playwright smoke spec, `docs/` plan, spec, ledger, design system, walkthrough and checklist, `.claude/hooks/capture.py` the log-capture hook (see `CAPTURE-TEST.md`).
