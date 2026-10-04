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
