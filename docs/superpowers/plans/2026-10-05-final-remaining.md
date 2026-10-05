> **Historical (completed 2026-10-05).** The seed data was hand-written and built with `seed:assemble`, not generated with `seed:gen` as Chunk 2 says, and the `graphify-out/` history purge (Chunk 0) was done.
> Current state: `docs/superpowers/ledger/continuation-handoff.md`.

# Final plan: remaining work to ship

Source of truth for state: `docs/superpowers/ledger/continuation-handoff.md`. This plan covers only what is left. Each chunk ends with a stop point; do not start the next chunk until the user says so.

## Chunk 0: purge `graphify-out/` from git and history (sequential, first)

Why first: it rewrites every SHA, so nothing else may be branched or pushed before it.

1. Fresh clone to a temp dir, `git filter-repo --path graphify-out --invert-paths`. Fresh clone avoids the worktree and locked-branch problems of rewriting in place.
2. Force-push `main` with `--force-with-lease`. Delete the stale remote branch `claude/serene-galileo-yn8oce` if it still holds the paths (check with `git log origin/<branch> -- graphify-out`).
3. In the main checkout: `git fetch`, `git reset --hard origin/main` (after confirming the only dirty files are `graphify-out/*` and the live agent log), uncomment `graphify-out/` in `.gitignore`, keep the local `graphify-out/` folder (now ignored).
4. Local agent worktrees under `.claude/worktrees/` and their branches point at the old history. Remove them with `git worktree remove` and `git branch -D` only after confirming each is merged (handoff says they are).
5. Verify: `git log --all -- graphify-out` is empty, `git rev-list --objects --all | grep graphify-out` is empty, `git ls-files graphify-out` is empty.

Note: GitHub keeps old commits reachable by SHA and in forks or PR refs until it garbage-collects. Truly purging needs a GitHub support request. The two files with the local username (`.graphify_root`, `.graphify_python`) are the only sensitive content.

## Chunk 1: make `main` green (one agent, no external effects)

`npm ci`, `npm test`, `npm run typecheck`, `npm run build`. Report the numbers. Fix only real breakage.

## Chunk 2: seed data (parallel agents, spends quota)

7 meetings left plus `ask.json`: `q4-planning`, `acme-discovery`, `priya-mei-1on1`, `harbor-interview`, `optimizer-outage-postmortem`, `mobile-design-review`, `weekly-product-sync`. One agent per slug runs `npm run seed:gen -- <slug>` (disjoint output folders under `seed/generated/<slug>/`). Then `ask.json` last (it reads the others), then `npm run seed:check`. Review the showcase (`q4-planning`) by reading, then commit `seed/generated` with explicit paths.

## Chunk 3: load hosted data (sequential, writes to the hosted DB)

`EXPECT_SUPABASE_REF=ifnrsvuxzfdxtcclndjp`, `seed:check`, `seed:load -- --dry-run`, `seed:load` twice (second run: same counts, deletes nothing, `ask_answers: 6`), `seed:clips`, anonymous search check (plan Task 13), `rls:test`.

## Chunk 4: local verification

`npm run e2e` against loaded data. Fix app failures, not tests. Browser items in `docs/manual-test-checklist.md` stay with the user.

## Chunk 5: Vercel project and deploy

1. `vercel link` (new project, scope `schwiftys-projects`, name from the user), `vercel git connect` to `Schwifty101/fathomAI`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for Production and Preview by piping values from `.env.local` (never printing them). `ANTHROPIC_API_KEY` stays unset unless the user supplies one (Ask and Regenerate degrade).
3. Deploy, then `BASE_URL=<live> npm run e2e`.
4. Replace `<LIVE_URL>` and `<REPO_URL>` in `README.md` and `docs/walkthrough.md`. Secret scan per CLAUDE.md.

## Chunk 6: Google sign-in (needs the user)

Supabase Auth: Site URL and redirect list set to the live URL; Google provider enabled with the OAuth client. Then the `G`-tagged checklist items.

## Chunk 7: close-out

Re-run `rls:test`, disable the Email provider, rotate the DB password (user action in the dashboard).

## Not planned (decided or optional)

CHECK on `ask_answers.scope`, `h` shortcut and tab state, ISO due dates in Markdown, 14px vs 16px drift, reconciling the old plan. They need the user's decision first.
