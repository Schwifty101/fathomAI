# Fathom Rebuild: Design Spec

Date: 2026-10-05
Status: approved in conversation, pending written-spec review

## 1. Goal

A live, public rebuild of fathom.video (AI meeting notetaker), judged on speed,
product judgement and UX. Deliverables: deployed link, public repo with
`.agent-logs/` committed, walkthrough (user records), seeded data.

Core loop: meetings list (My Calls / Team Calls) -> meeting page (synced
playback + transcript) -> AI summary with switchable templates -> action items
-> highlights -> cross-meeting search (global header bar) -> Ask Fathom
(account-level AI chat panel) -> shareable clip that works signed-out. The case that matters most is an
8-person, ~1-hour call: long transcript, speaker attribution, chapters, talk-time,
a scannable summary.

## 2. Decisions and stubs (to be disclosed in README and walkthrough)

- Capture bot is stubbed. No recording, no media. Playback is a simulated,
  clock-driven player over the transcript.
- Calendar connect is a stub UI over seeded upcoming events. No calendar OAuth.
- All data is synthetic (fictional people and companies), generated with
  `claude -p` and committed as JSON.
- AI: summaries, templates and action items are pre-generated at seed time.
  Live regeneration works only when `ANTHROPIC_API_KEY` is set on the server;
  otherwise the UI falls back to the seeded versions. The live path is verified
  against a stubbed client unless a key is supplied.
- Ask Fathom: a persistent, collapsible side panel on My Calls and Team Calls
  (and an Ask tab on a meeting), with a scope selector (My Calls, Team Calls,
  This meeting). The suggested prompts have answers pre-generated at seed time
  with citations that link to `?t=` moments. Free-text questions go live when
  `ANTHROPIC_API_KEY` is set; without a key they fall back to an extractive
  answer (top full-text matches with cited moments) and a notice. The input
  is never dead.
- Team Calls (lite): all calls across a seeded team, with a host and role
  filter, a stats strip and a members table. Without real accounts, "My Calls"
  means calls hosted by a fixed demo persona (a seeded `team_members` row);
  every visitor, signed in or not, sees that persona's calls. Disclosed in the
  README. No CRM, deal or alert features.
- Access model: signed-out visitors see a public read-only demo workspace.
  Writes (highlight, share, regenerate, live Ask) require Google sign-in.
- Auth: Supabase OAuth (Google) only. No email sign-in or sign-up.
- Stack: Next.js (App Router), Supabase (Postgres, Auth, RLS), Vercel.
- Frontend design is a later phase (section 11, step 3). It uses the
  `/tastemaker` skill and screenshots of the fathom.video marketing page (not
  the dashboard). Nothing in this spec fixes visual design.

## 3. Non-goals

Real recording bot, real calendar OAuth, billing, real multi-tenant
teams/orgs and invites, CRM (Salesforce/HubSpot) and Slack integrations, Deals,
Alerts (keyword notifications), Playlists (a possible cheap stretch: a join
table over highlights), deal-stage/outcome filters, Refer/points, Settings,
Help and onboarding videos, semantic/embedding search, mobile app, action-item
completion state, per-user settings, highlight range editing.

## 4. Data model (Postgres)

| Table               | Columns                                                          | Notes                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `team_members`    | id, name, role, is_demo_user                                     | Seeded team (~6). Exactly one `is_demo_user` row: the "My Calls" persona                                                                     |
| `meetings`        | id, title, kind, platform, started_at, duration_sec, host_id     | `host_id` references `team_members`. `kind`: sales, standup, one_on_one, interview, postmortem, design_review, planning                      |
| `participants`    | id, meeting_id, member_id null, name, role, is_internal, talk_time_sec, questions, longest_monologue_sec | `member_id` set for team members. Last three columns derived from segments at load: talk time; question sentences; longest same-speaker run (gaps under 3s merged) |
| `ask_answers`     | id, prompt, scope, answer jsonb                                  | Pre-generated Ask Fathom answers with citations (meeting_id, segment idx, start_ms)                                                          |
| `ai_usage`        | id, user_id, kind, created_at                                    | `kind`: regenerate or ask. Backs per-user rate limits; written by server routes only                                                         |
| `segments`        | id, meeting_id, participant_id, idx, start_ms, end_ms, text, tsv | `tsv` generated tsvector, GIN index; unique (meeting_id, idx)                                                                              |
| `chapters`        | id, meeting_id, start_ms, title                                  |                                                                                                                                              |
| `summaries`       | id, meeting_id, template, content jsonb, user_id null, source    | `template`: general, sales, standup, project_review. `source`: seed or live. Unique (meeting_id, template, coalesce(user_id, zero-uuid)) |
| `action_items`    | id, meeting_id, owner, task, due, start_ms                       | `start_ms` is the transcript anchor                                                                                                        |
| `highlights`      | id, meeting_id, user_id, start_ms, end_ms, note, created_at      |                                                                                                                                              |
| `shares`          | slug (pk), meeting_id, start_ms, end_ms, created_by, created_at  | Check: end_ms - start_ms <= 300000                                                                                                           |
| `calendar_events` | id, title, platform, day_offset, time_of_day                     | Resolved relative to today at read time via a view, so demo data never goes stale                                                            |

## 5. Access rules (RLS)

- Seeded tables (`team_members`, `meetings`, `participants`, `segments`,
  `chapters`, `action_items`, `calendar_events`, `ask_answers`): select for anon
  and authenticated; no client writes. `ai_usage`: no client access at all.
  A `team_stats` view aggregates per member over `participants` (calls, talk-time
  share, questions, longest monologue) and is readable by everyone.
  `summaries`: anon and authenticated may read rows where `user_id is null`;
  an authenticated user may also read rows where `user_id = auth.uid()`.
  Writes only via service role (seed loader and server routes).
- `highlights`: select/insert/update/delete only where `user_id = auth.uid()`.
- `shares`: insert for authenticated with `created_by = auth.uid()`; delete own;
  no direct anon select. Public access goes through security-definer
  `get_clip(slug)`, which returns the clip window's segments, meeting title and
  speaker names only, never the sharer's identity or the full transcript.
- Search: `search_segments(q)` rpc over `segments.tsv` using `ts_headline`;
  returns meeting, speaker, snippet, start_ms.

## 6. Seed pipeline

Runs locally, never in the deployed app. Output is committed under
`seed/generated/<slug>/`.

`seed:gen` (uses `claude -p`, model via `SEED_MODEL`, default Sonnet; resumable,
skips existing files):

1. Brief per meeting: cast (8 speakers for the showcase), agenda, 6-8 chapters
   with beats.
2. Transcript: one call per chapter, given the brief plus the previous chapter's
   last ~15 lines. Returns `{speaker, text}` lines only.
3. Timestamps stamped in code: ~2.5 words/s with jitter, small gaps, occasional
   overlap. Showcase targets ~60-64 min.
4. Summaries: one call per template per meeting over the full transcript.
   Action items return a segment index; code maps it to `start_ms`. Relative due
   dates are resolved in code against the meeting date.
5. Chapter start = first segment of that chapter.
6. Team: a seeded roster of ~6 members (one is the demo persona) is defined
   once; each meeting's cast draws from it (internal) plus fictional externals,
   and each meeting gets a host from the roster.
7. Ask answers: one call per suggested prompt over the per-meeting summaries
   (not full transcripts, to keep context small): "Next steps on projects?",
   "Summarize my recent meetings", "Surprise me with an insight". The prompt
   says "recent", not "today", because seeded dates are absolute and "today"
   would go stale. Citations are segment indices that code maps to `start_ms`.

Content set: ~7 meetings spread over the three weeks before seeding: the
8-person planning showcase, sales discovery, standup, 1:1, customer interview,
incident postmortem, design review.

`seed:check` asserts: zod schema valid (code fences stripped, one retry on bad
JSON); every speaker is in the cast; timestamps monotonic; showcase duration
within 5% of target and all 8 speakers have meaningful talk time; every action
item, chapter anchor and Ask citation resolves to a segment; no unresolved
relative dates; every meeting has a host from the roster; exactly one demo
persona; per-meeting talk-time shares sum to ~100%.

`seed:load`: service role, stable UUIDs derived from slug (idempotent upsert),
recomputes `talk_time_sec`, `questions` and `longest_monologue_sec` from the
segments.

Known model failures to guard against (observed in a test call): output wrapped
in ```json fences; invented absolute due dates inconsistent with the stated
weekday.

## 7. App structure

| Route               | Purpose                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `/`               | Redirects to`/meetings` (landing page arrives with the design phase)      |
| `/meetings`       | My Calls: demo persona's calls grouped by date, kind filter, upcoming events panel, Ask Fathom panel |
| `/team`           | Team Calls: all calls with host and role filter, stats strip (calls, team talk-time share), members table (calls, talk-time %, questions, longest monologue), Ask Fathom panel |
| `/meetings/[id]`  | Core page; honors`?t=<ms>`                                                |
| `/search?q=`      | Results grouped by meeting with snippet, speaker, timestamp, link to`?t=` |
| `/calendar`       | Stub connect + seeded upcoming events                                       |
| `/clip/[slug]`    | Public clip page                                                            |
| `/auth/callback`  | OAuth return                                                                |
| `/api/regenerate` | Key-gated live regeneration                                                 |
| `/api/ask`        | Ask Fathom: live answer when a key is set, extractive fallback otherwise    |

The header is shared by every page: logo, a global "Search Call Recordings" bar
(submits to `/search`), My Calls / Team Calls tabs, calendar link, and sign-in
or avatar.

Layout: `app/`, `components/`, `lib/` (shared zod schema, prompts, Supabase
clients), `seed/`, `supabase/migrations/`. `lib/schema` and `lib/prompts` are
shared by the seed pipeline and `/api/regenerate` so live and seeded output
have identical shape.

### Meeting page

- Simulated player: scrubber, play/pause, 1x/1.5x/2x, +-15s skip, per-speaker
  lanes, chapter and highlight markers. `usePlayback` runs a
  `requestAnimationFrame` clock; the active segment is a binary search over
  `start_ms`, so only the active row re-renders.
- Transcript: plain DOM with `content-visibility: auto` for ~1,000 lines. Click
  to seek; auto-follows playback with a "jump to live" button after manual
  scroll; in-transcript search; speaker filter.
  Ceiling: virtualize above ~5k segments.
- Right panel tabs: Summary, Action items, Chapters, Highlights, Ask. A speaker
  strip shows each participant's talk-time %, questions and longest monologue
  (from `participants`). Mobile: player on top, tabs below.
- One parallel server fetch loads meeting, segments, chapters, action items and
  all four summary templates; the template switcher makes no network call. A
  signed-in user's own `live` summary overrides the seeded one, resolved
  server-side.
- The server passes only a `liveAiEnabled` boolean (never the key). Without a
  key the Regenerate button is disabled with an explanation.

### `/api/regenerate`

Requires a session and a configured key. Writes only a user-scoped `summaries`
row. Rate limit 5/hour/user, counted from `ai_usage`. The Anthropic client is
injected so tests exercise the real route logic. On failure: one retry on
invalid JSON, then error; seeded summary stays.

### `/api/ask`

Body: question plus scope (my_calls, team_calls, or a meeting id).
- Suggested prompts are answered from `ask_answers` with no model call.
- Free text with a key and a session: retrieve top segments in scope via
  `search_segments` plus the in-scope summaries as context (no embeddings),
  call the model, return an answer with citations. Rate limit 10/hour/user from
  `ai_usage`. The client is injected, same as regenerate.
- Free text without a key (or on model failure): extractive fallback. Return
  the top full-text matches in scope with speaker, snippet and `?t=` link, and a
  notice that live answers need a key. No session needed.
- The panel is collapsible and keeps the conversation in component state only.

## 8. Highlights and sharing

- Highlight: `H` or button captures ~5s before to 10s after the playhead,
  snapped to segment boundaries; optional inline note; optimistic insert via
  server action. Shown as scrubber markers and in the Highlights tab (click to
  seek). Signed out: dialog prompts Google sign-in and returns to the same
  `?t=`; the pending highlight is not replayed.
- Share: from a highlight, the current moment, or selected transcript lines. A
  server action inserts a `shares` row (10-char random slug), copies the URL.
  Window capped at 5 minutes (action and DB constraint); 20 shares/user/day.
  Creator can delete their links.
- `/clip/[slug]`: no sign-in; data via `get_clip`; looping clip player, window
  transcript, CTAs to full meeting and sign-in; `generateMetadata` plus a
  `next/og` image (title and pull-quote).

## 9. Auth

Google OAuth through Supabase; `@supabase/ssr` middleware refreshes sessions.
Gated actions: highlight, share, regenerate, live Ask. Everything else is
public, including suggested and extractive Ask answers.

## 10. Errors and testing

Errors: unknown meeting/slug gives a friendly 404; empty search shows
suggestions; failed LLM call shows a toast and keeps the seeded summary.

Tests:

- `seed:check` (section 6).
- Unit: active-segment search, clip-window clamping, regenerate route with a
  stub client (success, bad JSON with retry, no key, no session, rate limited);
  `/api/ask` the same way, plus suggested prompt (no model call) and the
  extractive fallback returning cited, in-scope matches.
- RLS script against the hosted project using admin-created test users: anon
  can read but not write; user A cannot read user B's highlights; `ai_usage` is
  inaccessible to clients; `get_clip` returns only the window. No Docker required.
- One Playwright smoke spec against the deployed URL: signed-out visit, play,
  search, open a suggested Ask answer, open the Team Calls page, open a clip link.
- Final manual checklist from the brief: link opens signed-out, repo public with
  `.agent-logs/`, walkthrough under five minutes with camera on.

## 11. Sequencing

1. Scaffold, Supabase migrations, RLS, RLS tests.
2. Seed: generate, check, load.
3. Design system: screenshot the fathom.video marketing page, run `/tastemaker`,
   define tokens and motion. Precedes all UI work.
4. App: header and global search, My Calls list, meeting page and player,
   summaries and actions, speaker strip, highlights/share/clip, Ask Fathom
   panel (suggested and extractive first, then live), Team Calls, calendar stub,
   live regeneration.
5. Deploy to Vercel, smoke test, README with disclosed stubs, walkthrough
   script.

## 12. User-owned steps

- Create the Google OAuth client and add Supabase's redirect URL.
- Approve creating the public GitHub repo (outward-facing).
- Optionally provide `ANTHROPIC_API_KEY` for the Vercel env.
- Record the walkthrough (camera on, <= 5 min).

## 13. Risks

- `.agent-logs/` is public: no secrets or keys in the session.
- Synthetic transcript quality over an hour: mitigated by chapter-wise
  generation and `seed:check`; showcase may need manual regeneration of a chapter.
- Live regeneration and live Ask are verified only against a stub unless a key
  is supplied.
- "My Calls" is a fixed demo persona, not the signed-in user. A reviewer may
  find that odd; the README and walkthrough say so.
- Supabase project choice: an existing project may be reused or a new one
  created; decide in planning.
