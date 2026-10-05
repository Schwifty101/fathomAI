# Fathom Rebuild

A rebuild of the core loop of Fathom, the AI meeting notetaker. You get a library of calls. Each call has a transcript that plays back in sync, an AI summary with switchable templates, action items, highlights and chapters. You can search across every call, ask questions in a side panel, and share a clip that opens without signing in.

- Live demo: `<LIVE_URL>`
- Repository: `<REPO_URL>`
- Demo script for the recording: [`docs/walkthrough.md`](docs/walkthrough.md)

It is a Next.js 15 App Router app on Supabase (Postgres, Auth, row-level security), built to deploy to Vercel. Read the next section before judging it: the recording bot, the media and the calendar link are not real, and all the data is synthetic.

## What is real and what is stubbed

| Area | Status | What that means |
| --- | --- | --- |
| Web app | Real | Next.js 15, React 19, Tailwind 4, TypeScript. Server components read Supabase with the visitor's session. Server actions write highlights and shares. Route handlers serve Ask and regenerate. |
| Database and access rules | Real | 12 tables, 2 views and 2 functions in two migrations. Row-level security on every table, explicit grants, CHECK constraints. Signed-out visitors can read the demo workspace; only the signed-in user can write their own highlights and shares. |
| Search | Real | Postgres full-text search (`tsvector`, GIN index, English stemming) through the `search_segments` function. It matches whole words and their plain variants only, with no semantic matching and no prefix matching. |
| Highlights | Real | A type button captures the whole speaker run at the playhead: consecutive lines by one person, gaps under 3 seconds merged, capped at 5 minutes. Saved per user. |
| Clip sharing | Real | A share row plus a `security definer` function (`get_clip`) that returns only the lines inside the clip window, with speaker names and the meeting title and slug, and nothing about who shared it. The clip page needs no sign-in and has Open Graph metadata and a generated image. |
| Google sign-in | Real code, needs your setup | Supabase OAuth. You must create a Google OAuth client and enable it in Supabase. It is not covered by automated tests. Gated actions: highlight, share, regenerate, live Ask. |
| Team Calls | Real queries over seeded data | Stats come from the `team_stats` view over the seeded participants. |
| Summaries, templates, action items | Seeded content, real UI | Four summary templates and the action items per call were generated once at seed time and committed. Switching templates makes no network call. Copy puts Markdown on the clipboard. Relative due dates ("by Friday") are resolved to real dates in code against the call's date. |
| Ask Fathom | Seeded, extractive, or live | The suggested questions are answered from stored answers with no model call. Other questions get the closest full-text matches with cited moments. Live answers need `ANTHROPIC_API_KEY` on the server and a signed-in visitor. |
| Recording bot and media | Stubbed | There is no audio or video. The player is a `requestAnimationFrame` clock that steps through the transcript, with a speed button and a scrubber. |
| Calendar connect | Stubbed | A demo screen over five seeded events. "Connect Google Calendar (demo)" makes no connection. The connected flag is kept in the browser's local storage and the per-event notetaker switches are not saved at all. Times are shown in UTC. |
| Meeting data | Synthetic | Eight fictional calls for a fictional freight-software company, generated with `claude -p` and committed as JSON under `seed/generated/`. Run `npm run seed:check` to see which bundles exist and pass. |
| My Calls | Stand-in | There are no per-user calls. "My Calls" is the set of calls hosted by one fixed demo persona, Priya Raman, and every visitor sees it. |
| Live AI | Optional | Live Regenerate and live Ask are off unless a server key is set. They are tested against stubbed model clients; they have not been exercised against the real API unless you supply a key. |

## Run it locally

You need Node 22 or newer (`tests/toolchain.test.ts` asserts it), a Supabase project, and the Supabase CLI to apply the schema.

1. Install: `npm ci`
2. Configure: `cp .env.example .env.local`, then fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project's API settings. `.env.local` is gitignored. The service-role key is used only on the server (`lib/supabase/admin.ts` imports `server-only`).
3. Create the schema: `supabase link --project-ref <your-project-ref>`, then `supabase db push`. This applies `supabase/migrations/20261005000000_init.sql` and `supabase/migrations/20261006000000_hardening.sql`.
4. Load the data: `npm run seed:check`, then `npm run seed:load`, then `npm run seed:clips`.
5. Start the app: `npm run dev` and open `http://localhost:3000`. `/` redirects to `/meetings`.
6. Optional, for Google sign-in locally: in the Supabase dashboard enable the Google provider with your own client ID and secret (the Google redirect URI is `https://<your-project-ref>.supabase.co/auth/v1/callback`), set Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the redirect URLs. Everything signed-out works without this.

Notes on step 4:

- `seed:load` and `seed:clips` run with `--env-file=.env.local`, and so does `rls:test`. All three first run a target guard (`scripts/guard-target.ts`). It refuses to continue unless the project ref in `NEXT_PUBLIC_SUPABASE_URL` matches `supabase/.temp/project-ref` (created by `supabase link`) or `EXPECT_SUPABASE_REF` if you did not link, the service key is a `service_role` key, and the shell environment does not override `.env.local`.
- `seed:load` runs the target guard, then `seed:check`, and stops if any bundle or `ask.json` is missing or invalid. It validates every row in memory before any write, upserts everything by stable ID, and only then deletes rows that are no longer in the seed (by explicit id, never touching rows a user created), so loading twice gives the same rows. If a call leaves the seed, its users' highlights, summaries and shares go with it (foreign keys cascade) and the loader logs a warning first. It is not all-or-nothing: a failure part-way can leave some rows updated and others not, but never fewer rows than before, and a re-run converges. `npm run seed:load -- --dry-run` reads the database and reports what it would write and delete without changing anything.
- `seed:clips` creates two public clips from the first two seeded highlights of the `q4-planning` call: `/clip/demo-q4-clip` and `/clip/demo-q4-clip-2`. It owns them with a throwaway user, `demo-clips@example.test`, which it creates and leaves in place.

### Configuration

| Variable | Used for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | App and scripts | Required. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App | Required. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only: usage metering, summary writes, seed scripts, `rls:test` | Required. Never expose it to the client. |
| `ANTHROPIC_API_KEY` | Live Regenerate and live Ask | Optional. Without it the Regenerate button is disabled and Ask uses stored or extractive answers. |
| `ANTHROPIC_MODEL` | Live model | Optional. Defaults to `claude-sonnet-5-5`. |
| `SEED_MODEL` | `seed:gen` | Optional. Model alias passed to the `claude` CLI. Defaults to `sonnet`. |
| `NEXT_PUBLIC_SITE_URL` | Social-card metadata base URL | Optional. If unset, the app uses `VERCEL_PROJECT_PRODUCTION_URL` when present, else `http://localhost:3000` (`app/layout.tsx`). |
| `EXPECT_SUPABASE_REF` | Target guard | Only needed if `supabase/.temp/project-ref` is absent. |

The Supabase database password is used only by the `supabase` CLI. Neither the app nor the npm scripts read it.

## The seed pipeline

The pipeline runs on your machine, never in the deployed app. The team roster is in `seed/team.ts` (eight people, one of them the demo persona) and the eight calls are in `seed/meetings.ts`. One call is the showcase: Q4 Product Planning, eight participants, planned at 62 minutes.

- `npm run seed:gen` generates the committed bundles with the `claude` CLI (`claude -p`), using whatever account you are logged in with. It strips `ANTHROPIC_API_KEY` from the child environment so the CLI uses its own login, and it runs with no tools. Generate one call with `npm run seed:gen -- <slug>`, or pass `--force` to regenerate. It resumes: finished files are kept. Order per call: a brief, then the transcript one chapter at a time, then timestamps stamped in code (about 2.5 words a second with jitter), then summaries (one per template), action items, and highlights. The Ask answers are generated last, once all eight bundles exist.
- Output goes to `seed/generated/<slug>/` as `brief.json`, `transcript.json`, `summaries.json`, `actions.json` and `highlights.json`, plus `seed/generated/ask.json`.
- `npm run seed:check` validates the committed files against the schemas in `lib/schema.ts` without touching a database. Among other things it checks that every speaker is in the cast, timestamps never go backwards, duration is within 5% of target for the showcase (15% for the others), every action item, highlight and Ask citation points at a real line, highlight windows are at most 5 minutes, and relative due dates resolve. It exits non-zero on any problem.
- `npm run seed:load` writes the validated bundles to Supabase with the service role and stable IDs derived from the slugs. It recomputes each participant's talk time, question count and longest monologue from the transcript.

Models make mistakes in structured output, so the generated files are code-stamped and code-checked rather than trusted: line timings, due dates, highlight windows and citation positions come from code, not from the model.

## Tests

| Command | Needs | Covers |
| --- | --- | --- |
| `npm test` | Nothing: no network, no environment variables | Vitest unit tests in `tests/`: playback and active-line search, speaker runs and highlight windows, clip clamping, due-date resolution, snippets, formatting, the schemas, `seed:check`, the target guard, and the Ask and regenerate logic against stubbed model clients and in-memory databases (success, bad JSON, no key, no session, rate limit, suggested prompt, extractive fallback). |
| `npm run typecheck` | Nothing | `tsc --noEmit`. |
| `npm run rls:test` | `.env.local`, a loaded or empty hosted project with both migrations applied, and the Supabase **Email provider switched on** | Creates throwaway users through the admin API, signs them in with a password, and checks that anonymous and cross-user reads and writes are blocked, constraints hold, `ai_usage` is closed to clients and `get_clip` returns only its window. It removes its fixtures and users at the end. |
| `supabase/tests/hardening.sql` | A scratch local Postgres, never a hosted project | SQL probes for the hardening migration, including privileges PostgREST cannot reach (such as TRUNCATE). The header of the file has the `psql` commands. |
| `npm run e2e` | Seeded data in the target database, and `npx playwright install chromium` once | Playwright smoke spec in `e2e/smoke.spec.ts`, signed out, in a fresh browser context. With `BASE_URL` unset it builds and serves the production app on port 3000 (reusing a server already running there). With `BASE_URL=<LIVE_URL>` it tests a deployment instead. |

Not covered by any automated test: Google sign-in, highlight, share and regenerate when signed in, a real model call, rendering of the social preview image, and component behaviour in a browser beyond the smoke spec. There are no component tests.

## Deploying

1. Create a Vercel project from the repository and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Add `ANTHROPIC_API_KEY` in the dashboard only if you want live AI; never commit it.
2. In Supabase, Authentication, URL Configuration: set Site URL to `<LIVE_URL>` and add `<LIVE_URL>/**` and `http://localhost:3000/**` to the redirect URLs.
3. Make sure the link opens signed out in a private window. If it shows a Vercel login page, turn off Deployment Protection for the project.
4. Run `BASE_URL=<LIVE_URL> npm run e2e`.
5. Final hardening step: run `npm run rls:test` one last time, then switch the Supabase **Email provider off** (Authentication, Sign In / Providers). The app only offers Google sign-in, and the provider is left off after this step. `npm run rls:test` signs its test users in with a password, so it needs the Email provider on: to run it again, switch the provider on, run the test, and switch it off again. Whether `seed:clips`, which creates its owner user through the admin API, also needs the provider on has not been checked, so run it before this step.

## Product decisions

- **A public, read-only demo workspace.** Signed-out visitors see everything. Only writes need Google sign-in: highlight, share, regenerate and live Ask.
- **"My Calls" is a fixed persona.** There are no real accounts or calendars to derive a user's calls from, so My Calls shows Priya Raman's hosted calls to everyone. Team Calls shows all of them, with a host and role filter.
- **A simulated player.** With no media, a clock drives the transcript. The active line is found by binary search on start times.
- **A highlight captures the whole speaker run at the playhead.** What is worth keeping is usually everything the current speaker was saying. The design spec says this mirrors Fathom's own behaviour; that was taken from a sample call and has not been checked against the product. There is no manual end control.
- **All summary templates are loaded with the page.** The switcher makes no request. A signed-in user's own live summary, if one exists, replaces the seeded one, chosen on the server.
- **Ask never leaves the input dead.** A stored answer if the question is one of the suggestions, a live answer if a key and a session are present, the closest full-text matches otherwise. Live Ask makes one model attempt with a 20 second timeout and no retry, so a malformed reply falls back to the extractive answer.
- **Limits are enforced on the server.** Live Ask is 10 an hour per user and Regenerate is 5 an hour, counted from the `ai_usage` table, which clients cannot read. The usage row is written before the model is called, so concurrent requests cannot all slip under the limit. Shares are capped at 20 a day per user and 5 minutes each.
- **Time is shown in UTC** everywhere it is displayed.

## Left out, and why

These are scope decisions for a short rebuild judged on the core loop.

- **A real recording bot, media, real calendar sign-in.** Each needs a meeting-platform or Google integration and real audio. A simulated player and a demo screen let the rest be built and demonstrated.
- **CRM and Slack push, Deals, Alerts.** They depend on another vendor's account and a customer's pipeline, and sit outside finding and sharing a moment.
- **Real multi-tenant teams, invites, billing.** They need an organisation model. The fixed demo persona stands in.
- **Playlists.** A cheap later addition: a join table over highlights.
- **Semantic (embedding) search.** Full-text search covers "find where someone said X" at this size. Embeddings add a vendor, a cost and an index to keep fresh.
- **Also not built:** action-item completion state and manual action items, custom highlight buttons, editing a highlight's range, per-user settings, a mobile app.

## Known limitations

- **Every transcript is publicly readable by design.** Treat a clip link as a shortcut, not as access control. Do not load real meeting data into this.
- The seed loader is not all-or-nothing (see the notes on step 4), and it has never been run against the real hosted database. The 20 a day share cap is checked and then inserted in two steps, so a burst of concurrent requests can exceed it.
- Signing in or out resets the playhead on a meeting page, because the page remounts for the new user.
- The transcript is a single tab stop with arrow-key movement between lines, and the meeting tabs respond to the arrow, Home and End keys. The key handling is covered by unit tests but has not been checked in a browser.
- `npm audit --omit=dev` reports two findings (one high, one moderate) in the PostCSS 8.4.31 bundled with Next 15.5.27. The fix is a move to Next 16, which was not taken. The advisories concern attacker-supplied CSS, and this app only builds its own checked-in CSS. Reassess before any untrusted CSS reaches the build.

## Agent logs

[`.agent-logs/`](.agent-logs) holds the session logs of the AI coding agent that wrote this repository. `.claude/hooks/capture.py` writes them: for each turn it records the prompt and the agent's final reply. It does not record tool calls, intermediate steps or reasoning. The calls that generate the seed data run outside the project directory and are not in the logs. The plan and design spec are in `docs/superpowers/plans/` and `docs/superpowers/specs/`, and `docs/superpowers/ledger/` records decisions, verification results and open items.

## Repository layout

| Path | Contents |
| --- | --- |
| `app/` | Routes: `/meetings`, `/meetings/[id]`, `/team`, `/search`, `/calendar`, `/clip/[slug]`, `/design`, `/auth/callback`, `/api/ask`, `/api/regenerate` |
| `components/` | UI, including `components/meeting/` for the player, transcript, tabs and highlight panel |
| `lib/` | Shared schemas (`schema.ts`), prompts, queries, Ask and regenerate logic, Supabase clients |
| `seed/` | Team and call definitions, the generator, `seed:check`, the loader, and `generated/` data |
| `scripts/` | `rls-test.ts`, `seed-clips.ts`, `guard-target.ts`, and a developer-only knowledge-graph helper that the app does not use |
| `supabase/` | Migrations and local SQL probes |
| `e2e/`, `tests/` | Playwright smoke spec and Vitest unit tests |
| `docs/` | Design system notes, the demo script, plan, spec and ledger |
