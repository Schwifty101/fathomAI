# Fathom Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a public rebuild of fathom.video (AI meeting notetaker) with a synthetic, pre-generated dataset, signed-out demo access, and Google sign-in for writes.

**Architecture:** Next.js 15 App Router on Vercel talks to a hosted Supabase project (Postgres + Auth + RLS). A local seed pipeline (`claude -p`) generates synthetic meetings as committed JSON; a loader pushes them to Supabase. Signed-out visitors read a public demo workspace; highlights, shares and live AI features require Google OAuth. Live AI (regenerate, Ask) is optional behind `ANTHROPIC_API_KEY` and degrades to seeded or extractive output.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS v4, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), zod, `@anthropic-ai/sdk`, Vitest, tsx, Playwright, Vercel, npm.

**Spec:** `docs/superpowers/specs/2026-10-05-fathom-rebuild-design.md`. Executors read the spec and this plan.

## Global Constraints

- Node 24 + npm. ESM (`"type": "module"`). TypeScript `strict: true`. Path alias `@/*` maps to the repo root.
- Pin `next@15`, `react@19`, `react-dom@19` (`middleware.ts` and async `params`/`searchParams`/`cookies()` APIs are used as written).
- Tailwind CSS v4 (CSS-first, `@import "tailwindcss"`, tokens in `@theme static`). UI uses only token utilities (`bg-bg`, `text-fg`, ...) and the primitives in `components/ui/`. Never hard-code colors in components.
- Only these runtime deps: `next react react-dom @supabase/supabase-js @supabase/ssr zod @anthropic-ai/sdk`. Dev deps: `typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss vitest tsx @playwright/test`. Do not add others without a stated reason.
- All seeded data is synthetic (fictional people and companies). The shared real Fathom transcript is never committed or seeded.
- Secrets live only in `.env.local` (gitignored) and Vercel env. `.agent-logs/` is public: never print or paste keys. `SUPABASE_SERVICE_ROLE_KEY` is used only in server code and scripts, never imported from a client component.
- Clients never write seeded tables. Server routes and scripts write with the service role.
- The LLM key never reaches the browser. The server passes only a `liveAiEnabled` boolean.
- Highlight types: `action_item, insight, positive, feedback, objection, tech_question`. Summary templates: `general, sales, standup, project_review`. Clip window max 300000 ms. Speaker-run gap 3000 ms.
- Seed LLM calls run as `claude -p --model $SEED_MODEL` (default `sonnet`) with `--no-session-persistence --disable-slash-commands --system-prompt <task system prompt>`, with `cwd` set to the OS temp dir. `--bare` does not work with subscription login. The temp cwd stops the project capture hook writing a log per call.
- One commit per task. Every commit message ends with the trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (use a second `-m`).
- Tests: `npm test` (Vitest) must pass and `npm run typecheck` must be clean before each commit that touches TypeScript.

## Review Focus

Inputs the spec implies that no feature task would otherwise exercise. Each has a test in the named task.

1. `?t=` deep-link that is negative, `NaN`, empty or beyond the meeting length: expect clamp to `[0, duration]`, never a crash. (Task 4, `parseTimeParam`)
2. OAuth `next` param pointing off-site (`//evil.com`, `https://evil.com`, `/\evil`): expect redirect to `/meetings`. (Task 15, `safeNext`)
3. Search query of only punctuation, quotes or 500 characters: expect empty results and no error; query is trimmed and capped at 200 chars. (Task 3 RLS script for the rpc, Task 25 `normalizeQuery`)
4. Share window with `end <= start`, longer than 5 minutes, or outside the meeting: expect rejection or clamp, never a stored invalid row; the DB check constraint is the backstop. (Task 24 `clampWindow`, Task 3 constraint test)
5. Highlight pressed before the first segment starts, or on a meeting with no segments: expect a no-op with no network call. (Task 23 `buildHighlight` returns `null`)

---

## File Structure

```
app/
  layout.tsx, page.tsx, globals.css, not-found.tsx
  meetings/page.tsx                      My Calls (+ Ask Fathom panel)
  meetings/[id]/page.tsx, actions.ts     Meeting page (id is the meeting slug); server actions for highlights and shares
  team/page.tsx                          Team Calls
  search/page.tsx
  calendar/page.tsx
  clip/[slug]/page.tsx, opengraph-image.tsx
  auth/callback/route.ts
  api/ask/route.ts, api/regenerate/route.ts
  design/page.tsx                        style guide (Task 14)
components/
  ui/{Button,Chip,Card}.tsx              design-system primitives (Task 14)
  Header.tsx, SearchBar.tsx, NavTabs.tsx, AuthButton.tsx, SignInDialog.tsx, Toaster.tsx
  MeetingCard.tsx, UpcomingEvents.tsx, TeamTable.tsx, AskPanel.tsx, CalendarConnect.tsx
  meeting/{MeetingView,Player,Scrubber,Transcript,SpeakerStrip,Tabs,SummaryTab,ActionItemsTab,
           ChaptersTab,HighlightPanel,HighlightsTab,ClipView,playback-hooks}.tsx|ts
lib/                                     client-safe unless noted
  format.ts, schema.ts, speaker-runs.ts, stats.ts, llm.ts, prompts.ts, highlight.ts, share.ts,
  snippet.ts, markdown.ts, group.ts, safe-next.ts, playback.ts, lanes.ts, ask.ts, regenerate.ts,
  queries.ts, types.ts, toast.ts, clip.ts, auth.ts
  slug.ts, ask-db.ts, regenerate-db.ts   server only
  supabase/{client,server,anon,admin}.ts
middleware.ts
seed/                                    local tooling, never part of the deployed app
  uuid.ts, team.ts, meetings.ts, stamp.ts, due.ts, io.ts, pool.ts, claude-cli.ts, ping.ts
  gen/{meeting,ask,index}.ts, check.ts, load.ts
  generated/<slug>/{brief,transcript,summaries,actions,highlights}.json, generated/ask.json
scripts/rls-test.ts, scripts/seed-clips.ts
supabase/migrations/20261005000000_init.sql
tests/                                   Vitest, one file per unit
e2e/smoke.spec.ts, playwright.config.ts
docs/design/                             design brief (Task 14)
docs/walkthrough.md                      recording outline (Task 29)
```

---

## Phase 1: Foundation

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tests/toolchain.test.ts`
- Modify: `.gitignore` (create if absent)

**Interfaces:**
- Produces: npm scripts `dev build start test typecheck seed:gen seed:check seed:load rls:test e2e`; Tailwind tokens (`bg-bg`, `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `border-border`, `bg-accent`, `text-accent-fg`, `text-danger`) and CSS variables `--color-hl-action|insight|positive|feedback|objection|tech`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "fathom-rebuild",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "seed:gen": "tsx seed/gen/index.ts",
    "seed:check": "tsx seed/check.ts",
    "seed:load": "tsx --env-file=.env.local seed/load.ts",
    "rls:test": "tsx --env-file=.env.local scripts/rls-test.ts",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install next@15 react@19 react-dom@19 @supabase/supabase-js @supabase/ssr zod @anthropic-ai/sdk
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss vitest tsx @playwright/test
```
Expected: exit 0. Then `npx next --version` prints `15.x`.

- [ ] **Step 3: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

`postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
```

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Optional: enables live regenerate and live Ask
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
# Seed generation only
SEED_MODEL=sonnet
```

`.gitignore` (append, keep any existing lines):
```
node_modules
.next
.env*.local
.env
*.tsbuildinfo
next-env.d.ts
supabase/.temp
docs/design/refs/
playwright-report
test-results
```

- [ ] **Step 4: Write the app shell and tokens**

`app/globals.css` (neutral dark defaults; Task 14 replaces the values, not the names):
```css
@import "tailwindcss";

@theme static {
  --color-bg: #0e1013;
  --color-surface: #161a20;
  --color-surface-2: #1e242c;
  --color-fg: #eef1f5;
  --color-muted: #98a2b3;
  --color-border: #2a313b;
  --color-accent: #3b9eff;
  --color-accent-fg: #06121f;
  --color-danger: #ff6b6b;
  --color-hl-action: #e5e7eb;
  --color-hl-insight: #3b9eff;
  --color-hl-positive: #34d399;
  --color-hl-feedback: #fbbf24;
  --color-hl-objection: #f87171;
  --color-hl-tech: #a78bfa;
  --radius-card: 12px;
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

html, body { background: var(--color-bg); color: var(--color-fg); font-family: var(--font-sans); }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fathom Rebuild',
  description: 'AI meeting notetaker demo: transcripts, summaries, highlights and search.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  )
}
```

`app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/meetings')
}
```

- [ ] **Step 5: Write a toolchain test**

`tests/toolchain.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs on Node 22 or newer', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(22)
  })
})
```
This only proves Vitest runs; real tests start in Task 4.

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: Vitest 1 passed; typecheck clean; build succeeds (the `/meetings` route does not exist yet, the redirect target is fine at build time).

- [ ] **Step 7: Commit**

```bash
git add -A ':!.agent-logs'
git commit -m "chore: scaffold Next 15, Tailwind v4, Vitest, tokens" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Supabase project, schema, RLS, functions

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261005000000_init.sql`
- Modify: `.env.local` (create, gitignored)

**Interfaces:**
- Produces tables `team_members, meetings, participants, segments, chapters, summaries, action_items, highlights, shares, calendar_events, ask_answers, ai_usage`; views `team_stats`, `calendar_upcoming`; functions `search_segments(q, scope_host, scope_meeting, max_rows)` returning `(meeting_id, meeting_slug, meeting_title, segment_idx, start_ms, speaker, snippet, rank)` and `get_clip(p_slug) -> jsonb`.

- [ ] **Step 1: Ask the user which Supabase project to use**

This creates or reuses an external, possibly billable resource, so ask first (use AskUserQuestion): "Reuse an existing Supabase project, or create a new one named `fathom-rebuild`?" Run `supabase projects list` to show the options. Do not proceed until answered.

- [ ] **Step 2: Create or select the project and link it**

New project:
```bash
supabase orgs list
DBPW="$(openssl rand -base64 24 | tr -d '/+=')"
supabase projects create fathom-rebuild --org-id <ORG_ID> --db-password "$DBPW" --region us-east-1
echo "SUPABASE_DB_PASSWORD=$DBPW" >> .env.local
```
Then:
```bash
supabase init
supabase link --project-ref <REF> --password "$(grep SUPABASE_DB_PASSWORD .env.local | cut -d= -f2)"
supabase projects api-keys --project-ref <REF>
```
Write `NEXT_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>`, `SUPABASE_SERVICE_ROLE_KEY=<service_role>` into `.env.local`. Never echo these keys into the chat.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261005000000_init.sql`:
```sql
create type highlight_type as enum
  ('action_item','insight','positive','feedback','objection','tech_question');

create table team_members (
  id uuid primary key,
  name text not null,
  role text not null,
  is_demo_user boolean not null default false
);
create unique index team_members_one_demo on team_members (is_demo_user) where is_demo_user;

create table meetings (
  id uuid primary key,
  slug text not null unique,
  title text not null,
  kind text not null check (kind in
    ('sales','standup','one_on_one','interview','postmortem','design_review','planning')),
  platform text not null check (platform in ('zoom','meet','teams')),
  started_at timestamptz not null,
  duration_sec int not null check (duration_sec > 0),
  highlight_sec int not null default 0,
  host_id uuid not null references team_members(id)
);

create table participants (
  id uuid primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  member_id uuid references team_members(id),
  name text not null,
  role text not null,
  is_internal boolean not null,
  talk_time_sec int not null default 0,
  questions int not null default 0,
  longest_monologue_sec int not null default 0,
  unique (meeting_id, name)
);

create table segments (
  id uuid primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  idx int not null,
  start_ms int not null,
  end_ms int not null,
  text text not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored,
  unique (meeting_id, idx),
  check (end_ms > start_ms)
);
create index segments_tsv_idx on segments using gin (tsv);

create table chapters (
  id uuid primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  start_ms int not null,
  title text not null
);

create table summaries (
  id uuid primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  template text not null check (template in ('general','sales','standup','project_review')),
  content jsonb not null,
  user_id uuid references auth.users(id) on delete cascade,
  source text not null check (source in ('seed','live')),
  model text,
  created_at timestamptz not null default now()
);
create unique index summaries_unique on summaries
  (meeting_id, template, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table action_items (
  id uuid primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  owner text not null,
  task text not null,
  due date,
  start_ms int not null
);

create table highlights (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type highlight_type not null,
  title text not null,
  note text,
  start_ms int not null,
  end_ms int not null,
  created_at timestamptz not null default now(),
  check (end_ms > start_ms and end_ms - start_ms <= 300000)
);
create index highlights_meeting_idx on highlights (meeting_id);

create table shares (
  slug text primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  start_ms int not null,
  end_ms int not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (end_ms > start_ms and end_ms - start_ms <= 300000)
);

create table calendar_events (
  id uuid primary key,
  title text not null,
  platform text not null check (platform in ('zoom','meet','teams')),
  day_offset int not null,
  time_of_day time not null
);

create table ask_answers (
  id uuid primary key,
  prompt text not null unique,
  scope text not null default 'my_calls',
  answer jsonb not null
);

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('regenerate','ask')),
  created_at timestamptz not null default now()
);
create index ai_usage_lookup on ai_usage (user_id, kind, created_at);

-- Views (security_invoker so base-table RLS applies)
create view calendar_upcoming with (security_invoker = true) as
select id, title, platform,
       (date_trunc('day', now()) + day_offset * interval '1 day' + time_of_day) as starts_at
from calendar_events;

create view team_stats with (security_invoker = true) as
with totals as (
  select meeting_id, sum(talk_time_sec) as total_sec from participants group by meeting_id
)
select tm.id as member_id, tm.name, tm.role,
       count(distinct p.meeting_id)::int as calls,
       coalesce(sum(p.talk_time_sec), 0)::int as talk_sec,
       coalesce(round(100.0 * sum(p.talk_time_sec) / nullif(sum(t.total_sec), 0)), 0)::int as talk_pct,
       coalesce(sum(p.questions), 0)::int as questions,
       coalesce(max(p.longest_monologue_sec), 0)::int as longest_monologue_sec
from team_members tm
left join participants p on p.member_id = tm.id
left join totals t on t.meeting_id = p.meeting_id
group by tm.id, tm.name, tm.role;

-- Search
create function search_segments(
  q text,
  scope_host uuid default null,
  scope_meeting uuid default null,
  max_rows int default 30
) returns table (
  meeting_id uuid, meeting_slug text, meeting_title text, segment_idx int,
  start_ms int, speaker text, snippet text, rank real
) language sql stable security invoker as $$
  select s.meeting_id, m.slug, m.title, s.idx, s.start_ms, p.name,
         ts_headline('english', s.text, websearch_to_tsquery('english', q),
                     'StartSel=<mark>,StopSel=</mark>,MaxWords=30,MinWords=12'),
         ts_rank(s.tsv, websearch_to_tsquery('english', q))
  from segments s
  join meetings m on m.id = s.meeting_id
  join participants p on p.id = s.participant_id
  where s.tsv @@ websearch_to_tsquery('english', q)
    and (scope_host is null or m.host_id = scope_host)
    and (scope_meeting is null or s.meeting_id = scope_meeting)
  order by ts_rank(s.tsv, websearch_to_tsquery('english', q)) desc, m.started_at desc, s.idx
  limit least(max_rows, 100);
$$;

-- Public clip access: window segments only, no sharer identity
create function get_clip(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s shares%rowtype;
  result jsonb;
begin
  select * into s from shares where slug = p_slug;
  if not found then return null; end if;
  select jsonb_build_object(
    'slug', s.slug,
    'meeting_slug', m.slug,
    'title', m.title,
    'start_ms', s.start_ms,
    'end_ms', s.end_ms,
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'idx', g.idx, 'start_ms', g.start_ms, 'end_ms', g.end_ms,
        'speaker', p.name, 'text', g.text) order by g.idx)
      from segments g join participants p on p.id = g.participant_id
      where g.meeting_id = s.meeting_id and g.end_ms > s.start_ms and g.start_ms < s.end_ms
    ), '[]'::jsonb))
  into result
  from meetings m where m.id = s.meeting_id;
  return result;
end $$;
revoke all on function get_clip(text) from public;
grant execute on function get_clip(text) to anon, authenticated;

-- RLS
alter table team_members enable row level security;
alter table meetings enable row level security;
alter table participants enable row level security;
alter table segments enable row level security;
alter table chapters enable row level security;
alter table summaries enable row level security;
alter table action_items enable row level security;
alter table highlights enable row level security;
alter table shares enable row level security;
alter table calendar_events enable row level security;
alter table ask_answers enable row level security;
alter table ai_usage enable row level security;

create policy "public read" on team_members for select to anon, authenticated using (true);
create policy "public read" on meetings for select to anon, authenticated using (true);
create policy "public read" on participants for select to anon, authenticated using (true);
create policy "public read" on segments for select to anon, authenticated using (true);
create policy "public read" on chapters for select to anon, authenticated using (true);
create policy "public read" on action_items for select to anon, authenticated using (true);
create policy "public read" on calendar_events for select to anon, authenticated using (true);
create policy "public read" on ask_answers for select to anon, authenticated using (true);

create policy "read seeded or own" on summaries for select to anon, authenticated
  using (user_id is null or user_id = auth.uid());

create policy "read seeded or own" on highlights for select to anon, authenticated
  using (user_id is null or user_id = auth.uid());
create policy "insert own" on highlights for insert to authenticated
  with check (user_id = auth.uid());
create policy "update own" on highlights for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own" on highlights for delete to authenticated
  using (user_id = auth.uid());

create policy "select own" on shares for select to authenticated using (created_by = auth.uid());
create policy "insert own" on shares for insert to authenticated with check (created_by = auth.uid());
create policy "delete own" on shares for delete to authenticated using (created_by = auth.uid());

-- ai_usage: RLS on, no policies => no client access (service role only)
```

- [ ] **Step 4: Push the migration**

Run: `supabase db push`
Expected: "Applying migration 20261005000000_init.sql" then success. Verify:
```bash
supabase db query --linked "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo "verify in Task 3"
```
(If `db query` is unavailable in this CLI version, Task 3 verifies the schema.)

- [ ] **Step 5: Commit**

```bash
git add supabase package.json package-lock.json
git commit -m "feat(db): schema, RLS, search and clip functions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: RLS and function test script

**Files:**
- Create: `scripts/rls-test.ts`

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; schema from Task 2.
- Produces: `npm run rls:test` exiting 0 only if every check passes. Creates and removes its own fixtures.

- [ ] **Step 1: Write the script (this is the failing test: it asserts the policies)**

```ts
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, serviceKey, opts)
const anonClient = () => createClient(url, anonKey, opts)

let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) {
    failures++
    if (detail !== undefined) console.log('      ', JSON.stringify(detail))
  }
}

async function makeUser(tag: string) {
  const email = `rls-${tag}-${Date.now()}@example.test`
  const password = randomUUID()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = anonClient()
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { id: data.user.id, client }
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const memberId = randomUUID()
  const meetingId = randomUUID()
  const partId = randomUUID()
  const slug = `rls-test-${suffix}`
  const shareSlug = `rls${suffix}`
  const userIds: string[] = []
  const anon = anonClient()

  try {
    const A = await makeUser('a'); userIds.push(A.id)
    const B = await makeUser('b'); userIds.push(B.id)

    // fixtures via service role
    const must = async (p: PromiseLike<{ error: unknown }>) => {
      const { error } = await p
      if (error) throw error
    }
    await must(admin.from('team_members').insert({ id: memberId, name: 'RLS Tester', role: 'qa', is_demo_user: false }))
    await must(admin.from('meetings').insert({
      id: meetingId, slug, title: 'RLS fixture', kind: 'standup', platform: 'zoom',
      started_at: new Date().toISOString(), duration_sec: 420, host_id: memberId,
    }))
    await must(admin.from('participants').insert({
      id: partId, meeting_id: meetingId, member_id: memberId, name: 'RLS Tester', role: 'qa', is_internal: true,
    }))
    await must(admin.from('segments').insert([
      { id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 0, start_ms: 0, end_ms: 10000, text: 'alpha rollout plan for friday' },
      { id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 1, start_ms: 10000, end_ms: 20000, text: 'beta budget review next week' },
      { id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 2, start_ms: 400000, end_ms: 410000, text: 'gamma wrap up and thanks' },
    ]))
    const content = { sections: [{ heading: 'H', bullets: ['b'] }] }
    await must(admin.from('summaries').insert([
      { id: randomUUID(), meeting_id: meetingId, template: 'general', content, user_id: null, source: 'seed' },
      { id: randomUUID(), meeting_id: meetingId, template: 'general', content, user_id: A.id, source: 'live' },
    ]))
    const hlSeed = randomUUID(); const hlA = randomUUID()
    await must(admin.from('highlights').insert([
      { id: hlSeed, meeting_id: meetingId, user_id: null, type: 'insight', title: 'seed', start_ms: 0, end_ms: 10000 },
      { id: hlA, meeting_id: meetingId, user_id: A.id, type: 'insight', title: 'mine', start_ms: 0, end_ms: 10000 },
    ]))
    await must(admin.from('shares').insert({ slug: shareSlug, meeting_id: meetingId, start_ms: 0, end_ms: 15000, created_by: A.id }))
    await must(admin.from('ai_usage').insert({ user_id: A.id, kind: 'ask' }))

    // 1. anon reads seeded content, cannot write
    const m = await anon.from('meetings').select('id').eq('id', meetingId)
    check('anon can read meetings', m.data?.length === 1, m.error)
    const w = await anon.from('meetings').insert({
      id: randomUUID(), slug: 'x', title: 'x', kind: 'standup', platform: 'zoom',
      started_at: new Date().toISOString(), duration_sec: 1, host_id: memberId,
    })
    check('anon cannot insert meetings', !!w.error, w)
    const wa = await A.client.from('segments').insert({
      id: randomUUID(), meeting_id: meetingId, participant_id: partId, idx: 99, start_ms: 1, end_ms: 2, text: 'x',
    })
    check('authenticated cannot insert segments', !!wa.error, wa)

    // 2. summaries: seed visible to all, live row only to its owner
    const sAnon = await anon.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('anon sees only seeded summary', sAnon.data?.length === 1 && sAnon.data[0].user_id === null, sAnon)
    const sA = await A.client.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('user A sees seeded + own summary', sA.data?.length === 2, sA)
    const sB = await B.client.from('summaries').select('user_id').eq('meeting_id', meetingId)
    check('user B sees only seeded summary', sB.data?.length === 1, sB)

    // 3. highlights
    const hAnon = await anon.from('highlights').select('id').eq('meeting_id', meetingId)
    check('anon sees only seeded highlight', hAnon.data?.length === 1, hAnon)
    const hB = await B.client.from('highlights').select('id').eq('meeting_id', meetingId)
    check("user B cannot see user A's highlight", hB.data?.length === 1 && hB.data[0].id === hlSeed, hB)
    const hSpoof = await A.client.from('highlights').insert({
      meeting_id: meetingId, user_id: B.id, type: 'insight', title: 'spoof', start_ms: 0, end_ms: 1000,
    })
    check('A cannot insert a highlight as B', !!hSpoof.error, hSpoof)
    const hOwn = await A.client.from('highlights').insert({
      meeting_id: meetingId, user_id: A.id, type: 'feedback', title: 'ok', start_ms: 0, end_ms: 1000,
    })
    check('A can insert own highlight', !hOwn.error, hOwn.error)
    const hUpd = await B.client.from('highlights').update({ title: 'hijack' }).eq('id', hlA).select()
    check("B cannot update A's highlight", (hUpd.data?.length ?? 0) === 0, hUpd)
    const hDel = await B.client.from('highlights').delete().eq('id', hlA).select()
    check("B cannot delete A's highlight", (hDel.data?.length ?? 0) === 0, hDel)
    const hLong = await A.client.from('highlights').insert({
      meeting_id: meetingId, user_id: A.id, type: 'insight', title: 'long', start_ms: 0, end_ms: 400000,
    })
    check('highlight longer than 5 minutes is rejected', !!hLong.error, hLong)

    // 4. ai_usage is service-role only
    const uA = await A.client.from('ai_usage').select('id')
    check('ai_usage invisible to clients', (uA.data?.length ?? 0) === 0, uA)
    const uIns = await A.client.from('ai_usage').insert({ user_id: A.id, kind: 'ask' })
    check('ai_usage not writable by clients', !!uIns.error, uIns)

    // 5. shares
    const shAnon = await anon.from('shares').select('slug')
    check('anon cannot list shares', (shAnon.data?.length ?? 0) === 0, shAnon)
    const shA = await A.client.from('shares').select('slug').eq('slug', shareSlug)
    check('creator sees own share', shA.data?.length === 1, shA)
    const shB = await B.client.from('shares').select('slug').eq('slug', shareSlug)
    check("B cannot see A's share", (shB.data?.length ?? 0) === 0, shB)
    const shSpoof = await A.client.from('shares').insert({
      slug: `sp${suffix}`, meeting_id: meetingId, start_ms: 0, end_ms: 1000, created_by: B.id,
    })
    check('A cannot create a share as B', !!shSpoof.error, shSpoof)
    const shLong = await A.client.from('shares').insert({
      slug: `lg${suffix}`, meeting_id: meetingId, start_ms: 0, end_ms: 400000, created_by: A.id,
    })
    check('share longer than 5 minutes is rejected', !!shLong.error, shLong)
    const shBad = await A.client.from('shares').insert({
      slug: `bd${suffix}`, meeting_id: meetingId, start_ms: 5000, end_ms: 5000, created_by: A.id,
    })
    check('share with end <= start is rejected', !!shBad.error, shBad)

    // 6. get_clip returns only the window and no sharer identity
    const clip = await anon.rpc('get_clip', { p_slug: shareSlug })
    const segs = (clip.data?.segments ?? []) as { idx: number }[]
    check('get_clip returns only in-window segments', segs.length === 2 && segs.every((s) => s.idx < 2), clip)
    check('get_clip hides sharer identity', Boolean(clip.data) && !('created_by' in clip.data), clip.data)
    const none = await anon.rpc('get_clip', { p_slug: 'does-not-exist' })
    check('get_clip returns null for unknown slug', none.data === null && !none.error, none)

    // 7. search_segments
    const hit = await anon.rpc('search_segments', { q: 'budget review' })
    check('search finds a matching segment', (hit.data ?? []).some((r: { meeting_slug: string }) => r.meeting_slug === slug), hit.error)
    for (const q of ['!!!', '"', '   ', 'a'.repeat(500)]) {
      const r = await anon.rpc('search_segments', { q })
      check(`search tolerates odd query ${JSON.stringify(q.slice(0, 12))}`, !r.error, r.error)
    }

    // 8. team_stats readable
    const ts = await anon.from('team_stats').select('member_id').eq('member_id', memberId)
    check('team_stats is readable by anon', ts.data?.length === 1, ts.error)
  } finally {
    await admin.from('meetings').delete().eq('id', meetingId)
    await admin.from('team_members').delete().eq('id', memberId)
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  }

  console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Run it**

Run: `npm run rls:test`
Expected: every line `PASS`, final `All checks passed`. If a check fails, fix the migration (a new migration file, not an edit of the pushed one) and re-run.

- [ ] **Step 3: Commit**

```bash
git add scripts/rls-test.ts
git commit -m "test(db): RLS, constraint, clip and search checks" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
## Phase 2: Shared libraries and seed pipeline

### Task 4: Stable IDs and formatting helpers

**Files:**
- Create: `seed/uuid.ts`, `lib/format.ts`, `tests/uuid.test.ts`, `tests/format.test.ts`

**Interfaces:**
- Produces: `uuid5(name: string, namespace?: string): string`, `seedId(kind: string, key: string): string`; `formatMs(ms: number): string`, `formatMinutes(sec: number): string`, `parseTimeParam(value: string | string[] | undefined, durationMs: number): number`.

- [ ] **Step 1: Write the failing tests**

`tests/uuid.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { seedId, uuid5 } from '@/seed/uuid'

describe('uuid5', () => {
  it('matches the RFC 4122 DNS reference vector', () => {
    expect(uuid5('python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  })
  it('seedId is stable and distinguishes kind and key', () => {
    expect(seedId('meeting', 'q4')).toBe(seedId('meeting', 'q4'))
    expect(seedId('meeting', 'q4')).not.toBe(seedId('member', 'q4'))
    expect(seedId('meeting', 'q4')).not.toBe(seedId('meeting', 'q5'))
  })
})
```

`tests/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatMinutes, formatMs, parseTimeParam } from '@/lib/format'

describe('formatMs', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatMs(0)).toBe('0:00')
    expect(formatMs(26_000)).toBe('0:26')
    expect(formatMs(140_000)).toBe('2:20')
    expect(formatMs(3_723_000)).toBe('1:02:03')
  })
  it('clamps negatives to zero', () => {
    expect(formatMs(-5)).toBe('0:00')
  })
})

describe('formatMinutes', () => {
  it('pluralizes and never shows 0', () => {
    expect(formatMinutes(20)).toBe('1 min')
    expect(formatMinutes(480)).toBe('8 mins')
  })
})

describe('parseTimeParam', () => {
  const dur = 60_000
  it('parses a valid value', () => expect(parseTimeParam('12000', dur)).toBe(12_000))
  it('takes the first of an array', () => expect(parseTimeParam(['5000', '9'], dur)).toBe(5_000))
  it('returns 0 for missing, empty, NaN and garbage', () => {
    expect(parseTimeParam(undefined, dur)).toBe(0)
    expect(parseTimeParam('', dur)).toBe(0)
    expect(parseTimeParam('abc', dur)).toBe(0)
    expect(parseTimeParam('NaN', dur)).toBe(0)
    expect(parseTimeParam('Infinity', dur)).toBe(0)
  })
  it('clamps negative and past-the-end values', () => {
    expect(parseTimeParam('-500', dur)).toBe(0)
    expect(parseTimeParam('999999999', dur)).toBe(dur)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/uuid.test.ts tests/format.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`seed/uuid.ts`:
```ts
import { createHash } from 'node:crypto'

export const DNS_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
export const SEED_NS = '2c1f7a52-5f0e-4c6e-9a8b-3d0b7a1e9c11'

export function uuid5(name: string, namespace: string = DNS_NS): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(ns).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = h.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const seedId = (kind: string, key: string): string => uuid5(`${kind}:${key}`, SEED_NS)
```

`lib/format.ts`:
```ts
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const ss = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatMinutes(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60))
  return `${m} ${m === 1 ? 'min' : 'mins'}`
}

export function parseTimeParam(value: string | string[] | undefined, durationMs: number): number {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Number(raw)
  if (raw === undefined || raw === '' || !Number.isFinite(n)) return 0
  return Math.min(Math.max(0, Math.round(n)), durationMs)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/uuid.test.ts tests/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add seed/uuid.ts lib/format.ts tests/uuid.test.ts tests/format.test.ts
git commit -m "feat: stable ids and time formatting helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared constants and zod schemas

**Files:**
- Create: `lib/schema.ts`, `tests/schema.test.ts`

**Interfaces:**
- Produces: `HIGHLIGHT_TYPES`, `HighlightType`, `HIGHLIGHT_META`, `hlColor(t)`, `TEMPLATES`, `Template`, `TEMPLATE_LABELS`, `MEETING_KINDS`, `PLATFORMS`, `MAX_CLIP_MS`; schemas `summaryContentSchema`/`SummaryContent`, `briefSchema`/`Brief`, factories `chapterLinesSchema(speakers)`, `actionItemsSchema(speakers, maxIdx)`, `highlightPicksSchema(maxIdx)`, `askAnswerSchema(slugs)`, `liveAskSchema`; file schemas `transcriptFileSchema`/`TranscriptFile`, `summariesFileSchema`, `actionsFileSchema`, `highlightsFileSchema`, `askFileSchema`.

- [ ] **Step 1: Write the failing test**

`tests/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  actionItemsSchema, askAnswerSchema, briefSchema, chapterLinesSchema, highlightPicksSchema,
  HIGHLIGHT_TYPES, hlColor, summaryContentSchema, TEMPLATES,
} from '@/lib/schema'

describe('schema', () => {
  it('has six highlight types and four templates', () => {
    expect(HIGHLIGHT_TYPES).toHaveLength(6)
    expect(TEMPLATES).toHaveLength(4)
  })
  it('hlColor maps to a css variable', () => {
    expect(hlColor('tech_question')).toBe('var(--color-hl-tech)')
  })
  it('summary needs at least one section with bullets', () => {
    expect(summaryContentSchema.safeParse({ sections: [] }).success).toBe(false)
    expect(summaryContentSchema.safeParse({ sections: [{ heading: 'A', bullets: ['b'] }] }).success).toBe(true)
  })
  it('brief needs at least three chapters', () => {
    const ch = { title: 't', beats: ['b'], minutes: 5 }
    expect(briefSchema.safeParse({ agenda: ['a'], chapters: [ch, ch] }).success).toBe(false)
    expect(briefSchema.safeParse({ agenda: ['a'], chapters: [ch, ch, ch] }).success).toBe(true)
  })
  it('chapter lines reject speakers outside the cast', () => {
    const s = chapterLinesSchema(['Ann', 'Bob'])
    expect(s.safeParse([{ speaker: 'Ann', text: 'hi' }]).success).toBe(true)
    expect(s.safeParse([{ speaker: 'Eve', text: 'hi' }]).success).toBe(false)
  })
  it('action items reject unknown owners and out-of-range indices', () => {
    const s = actionItemsSchema(['Ann'], 10)
    const item = { owner: 'Ann', task: 'Do it', due_phrase: 'Friday', segment_idx: 3 }
    expect(s.safeParse({ action_items: [item] }).success).toBe(true)
    expect(s.safeParse({ action_items: [{ ...item, owner: 'Eve' }] }).success).toBe(false)
    expect(s.safeParse({ action_items: [{ ...item, segment_idx: 11 }] }).success).toBe(false)
  })
  it('highlight picks need 3 to 6 valid entries', () => {
    const pick = { segment_idx: 1, type: 'insight', title: 'A moment' }
    const s = highlightPicksSchema(5)
    expect(s.safeParse({ highlights: [pick, pick] }).success).toBe(false)
    expect(s.safeParse({ highlights: [pick, pick, pick] }).success).toBe(true)
    expect(s.safeParse({ highlights: [pick, pick, { ...pick, type: 'nope' }] }).success).toBe(false)
  })
  it('ask answers must cite known meeting slugs', () => {
    const s = askAnswerSchema(['q4'])
    const ok = { text: 'x', citations: [{ meeting_slug: 'q4', segment_idx: 2, label: 'l' }] }
    expect(s.safeParse(ok).success).toBe(true)
    expect(s.safeParse({ ...ok, citations: [{ ...ok.citations[0], meeting_slug: 'zz' }] }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/schema.ts`**

```ts
import { z } from 'zod'

export const HIGHLIGHT_TYPES = [
  'action_item', 'insight', 'positive', 'feedback', 'objection', 'tech_question',
] as const
export type HighlightType = (typeof HIGHLIGHT_TYPES)[number]

export const HIGHLIGHT_META: Record<HighlightType, { label: string; token: string }> = {
  action_item: { label: 'Action item', token: 'action' },
  insight: { label: 'Insight', token: 'insight' },
  positive: { label: 'Positive', token: 'positive' },
  feedback: { label: 'Feedback', token: 'feedback' },
  objection: { label: 'Objection', token: 'objection' },
  tech_question: { label: 'Tech question', token: 'tech' },
}
export const hlColor = (t: HighlightType) => `var(--color-hl-${HIGHLIGHT_META[t].token})`

export const TEMPLATES = ['general', 'sales', 'standup', 'project_review'] as const
export type Template = (typeof TEMPLATES)[number]
export const TEMPLATE_LABELS: Record<Template, string> = {
  general: 'General', sales: 'Sales', standup: 'Standup', project_review: 'Project review',
}

export const MEETING_KINDS = [
  'sales', 'standup', 'one_on_one', 'interview', 'postmortem', 'design_review', 'planning',
] as const
export const PLATFORMS = ['zoom', 'meet', 'teams'] as const
export const MAX_CLIP_MS = 300_000

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const summaryContentSchema = z.object({
  sections: z
    .array(z.object({ heading: z.string().min(1), bullets: z.array(z.string().min(1)).min(1) }))
    .min(1),
})
export type SummaryContent = z.infer<typeof summaryContentSchema>

export const lineSchema = z.object({ speaker: z.string().min(1), text: z.string().min(1) })

export const chapterLinesSchema = (speakers: readonly string[]) =>
  z.array(lineSchema).min(1).refine((ls) => ls.every((l) => speakers.includes(l.speaker)), {
    message: `speaker must be exactly one of: ${speakers.join(', ')}`,
  })

export const briefSchema = z.object({
  agenda: z.array(z.string().min(1)).min(1),
  chapters: z
    .array(z.object({
      title: z.string().min(1),
      beats: z.array(z.string().min(1)).min(1),
      minutes: z.number().positive(),
    }))
    .min(3),
})
export type Brief = z.infer<typeof briefSchema>

export const actionItemsSchema = (speakers: readonly string[], maxIdx: number) =>
  z.object({
    action_items: z
      .array(z.object({
        owner: z.string().refine((o) => speakers.includes(o), { message: 'owner must be a participant' }),
        task: z.string().min(1),
        due_phrase: z.string().nullable(),
        segment_idx: z.number().int().min(0).max(maxIdx),
      }))
      .min(1),
  })

export const highlightPicksSchema = (maxIdx: number) =>
  z.object({
    highlights: z
      .array(z.object({
        segment_idx: z.number().int().min(0).max(maxIdx),
        type: z.enum(HIGHLIGHT_TYPES),
        title: z.string().min(1).max(80),
      }))
      .min(3)
      .max(6),
  })

export const askAnswerSchema = (slugs: readonly string[]) =>
  z.object({
    text: z.string().min(1),
    citations: z
      .array(z.object({
        meeting_slug: z.string().refine((s) => slugs.includes(s), { message: 'unknown meeting_slug' }),
        segment_idx: z.number().int().min(0),
        label: z.string().min(1),
      }))
      .min(1),
  })

export const liveAskSchema = z.object({ text: z.string().min(1), refs: z.array(z.string()) })

// Shapes of the committed seed files (validated by seed:check)
export const transcriptFileSchema = z.object({
  lines: z
    .array(z.object({
      idx: z.number().int().min(0),
      speaker: z.string().min(1),
      text: z.string().min(1),
      start_ms: z.number().int().min(0),
      end_ms: z.number().int().min(1),
    }))
    .min(1),
  chapters: z.array(z.object({ title: z.string().min(1), start_idx: z.number().int().min(0) })).min(1),
  duration_ms: z.number().int().positive(),
})
export type TranscriptFile = z.infer<typeof transcriptFileSchema>

export const summariesFileSchema = z.object({
  general: summaryContentSchema,
  sales: summaryContentSchema,
  standup: summaryContentSchema,
  project_review: summaryContentSchema,
})

export const actionsFileSchema = z.array(z.object({
  owner: z.string().min(1),
  task: z.string().min(1),
  due: isoDate.nullable(),
  segment_idx: z.number().int().min(0),
  start_ms: z.number().int().min(0),
}))

export const highlightsFileSchema = z.array(z.object({
  segment_idx: z.number().int().min(0),
  type: z.enum(HIGHLIGHT_TYPES),
  title: z.string().min(1),
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(1),
}))

export const askFileSchema = z.array(z.object({
  prompt: z.string().min(1),
  scope: z.string().min(1),
  text: z.string().min(1),
  citations: z.array(z.object({
    meeting_slug: z.string().min(1),
    segment_idx: z.number().int().min(0),
    label: z.string().min(1),
  })).min(1),
}))
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/schema.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts tests/schema.test.ts
git commit -m "feat: shared constants and zod schemas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Speaker runs and participant stats

**Files:**
- Create: `lib/speaker-runs.ts`, `lib/stats.ts`, `tests/speaker-runs.test.ts`, `tests/stats.test.ts`

**Interfaces:**
- Produces: `RUN_GAP_MS = 3000`, `MAX_RUN_MS = 300000`, `type Seg = { participant_id: string; start_ms: number; end_ms: number }`, `type Run = { startIdx: number; endIdx: number; start_ms: number; end_ms: number }`, `findActiveIdx(segs, ms): number` (-1 before first), `splitRuns(segs): Run[]`, `expandToRun(segs, idx): Run | null`; `deriveParticipantStats(segs: (Seg & {text: string})[]): Map<string, {talk_time_sec; questions; longest_monologue_sec}>`, `unionSeconds(windows: {start_ms; end_ms}[]): number`.
- Segment arrays are ordered by `idx` and `segs[i].idx === i`.

- [ ] **Step 1: Write the failing tests**

`tests/speaker-runs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { expandToRun, findActiveIdx, MAX_RUN_MS, splitRuns, type Seg } from '@/lib/speaker-runs'

const seg = (p: string, s: number, e: number): Seg => ({ participant_id: p, start_ms: s, end_ms: e })

describe('findActiveIdx', () => {
  const segs = [seg('a', 0, 10_000), seg('b', 10_000, 20_000), seg('a', 20_000, 30_000)]
  it('returns -1 before the first segment', () => expect(findActiveIdx(segs, -1)).toBe(-1))
  it('finds the segment containing the time', () => {
    expect(findActiveIdx(segs, 0)).toBe(0)
    expect(findActiveIdx(segs, 9_999)).toBe(0)
    expect(findActiveIdx(segs, 10_000)).toBe(1)
    expect(findActiveIdx(segs, 99_999)).toBe(2)
  })
  it('handles an empty list', () => expect(findActiveIdx([], 5)).toBe(-1))
})

describe('splitRuns / expandToRun', () => {
  it('a single segment is its own run', () => {
    expect(expandToRun([seg('a', 0, 1000)], 0)).toEqual({ startIdx: 0, endIdx: 0, start_ms: 0, end_ms: 1000 })
  })
  it('merges consecutive same-speaker segments across small gaps', () => {
    const segs = [seg('a', 0, 4000), seg('a', 5000, 9000), seg('b', 9500, 12000)]
    expect(expandToRun(segs, 1)).toEqual({ startIdx: 0, endIdx: 1, start_ms: 0, end_ms: 9000 })
    expect(splitRuns(segs)).toHaveLength(2)
  })
  it('splits when the gap exceeds 3 seconds or the speaker changes', () => {
    const segs = [seg('a', 0, 4000), seg('a', 8000, 9000), seg('b', 9000, 10_000), seg('a', 10_000, 11_000)]
    expect(splitRuns(segs).map((r) => [r.startIdx, r.endIdx])).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]])
  })
  it('returns null for an out-of-range index and [] runs for no segments', () => {
    expect(expandToRun([seg('a', 0, 1)], 5)).toBeNull()
    expect(expandToRun([seg('a', 0, 1)], -1)).toBeNull()
    expect(splitRuns([])).toEqual([])
  })
  it('clamps a long monologue to 5 minutes and keeps the playhead segment inside', () => {
    const segs = Array.from({ length: 100 }, (_, i) => seg('a', i * 10_000, (i + 1) * 10_000))
    for (const idx of [0, 50, 99]) {
      const run = expandToRun(segs, idx)!
      expect(run.end_ms - run.start_ms).toBeLessThanOrEqual(MAX_RUN_MS)
      expect(run.start_ms).toBeLessThanOrEqual(segs[idx].start_ms)
      expect(run.end_ms).toBeGreaterThanOrEqual(segs[idx].end_ms)
    }
  })
})
```

`tests/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { deriveParticipantStats, unionSeconds } from '@/lib/stats'

describe('deriveParticipantStats', () => {
  const segs = [
    { participant_id: 'p1', start_ms: 0, end_ms: 4000, text: 'Hi there?' },
    { participant_id: 'p1', start_ms: 5000, end_ms: 9000, text: 'How are you?' },
    { participant_id: 'p2', start_ms: 10_000, end_ms: 12_000, text: 'Fine.' },
    { participant_id: 'p1', start_ms: 30_000, end_ms: 33_000, text: 'Ok' },
  ]
  it('sums talk time, counts questions and finds the longest monologue', () => {
    const s = deriveParticipantStats(segs)
    expect(s.get('p1')).toEqual({ talk_time_sec: 11, questions: 2, longest_monologue_sec: 9 })
    expect(s.get('p2')).toEqual({ talk_time_sec: 2, questions: 0, longest_monologue_sec: 2 })
  })
  it('returns an empty map for no segments', () => {
    expect(deriveParticipantStats([]).size).toBe(0)
  })
})

describe('unionSeconds', () => {
  it('merges overlapping windows', () => {
    expect(unionSeconds([
      { start_ms: 0, end_ms: 10_000 },
      { start_ms: 5000, end_ms: 20_000 },
      { start_ms: 30_000, end_ms: 40_000 },
    ])).toBe(30)
  })
  it('is 0 for no windows', () => expect(unionSeconds([])).toBe(0))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/speaker-runs.test.ts tests/stats.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`lib/speaker-runs.ts`:
```ts
export const RUN_GAP_MS = 3000
export const MAX_RUN_MS = 300_000

export type Seg = { participant_id: string; start_ms: number; end_ms: number }
export type Run = { startIdx: number; endIdx: number; start_ms: number; end_ms: number }

const continues = (prev: Seg, cur: Seg) =>
  prev.participant_id === cur.participant_id && cur.start_ms - prev.end_ms <= RUN_GAP_MS

// Last segment whose start_ms <= ms; -1 before the first segment.
export function findActiveIdx(segs: readonly Seg[], ms: number): number {
  let lo = 0
  let hi = segs.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segs[mid].start_ms <= ms) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

export function splitRuns(segs: readonly Seg[]): Run[] {
  const runs: Run[] = []
  let startIdx = 0
  for (let i = 1; i <= segs.length; i++) {
    if (i === segs.length || !continues(segs[i - 1], segs[i])) {
      runs.push({ startIdx, endIdx: i - 1, start_ms: segs[startIdx].start_ms, end_ms: segs[i - 1].end_ms })
      startIdx = i
    }
  }
  return runs
}

// The speaker run containing idx, with the time window clamped to MAX_RUN_MS.
// startIdx/endIdx describe the full run; start_ms/end_ms the (possibly clamped) window.
export function expandToRun(segs: readonly Seg[], idx: number): Run | null {
  if (idx < 0 || idx >= segs.length) return null
  let a = idx
  let b = idx
  while (a > 0 && continues(segs[a - 1], segs[a])) a--
  while (b < segs.length - 1 && continues(segs[b], segs[b + 1])) b++
  let start = segs[a].start_ms
  let end = segs[b].end_ms
  if (end - start > MAX_RUN_MS) {
    const mid = segs[idx].start_ms
    start = Math.max(start, mid - MAX_RUN_MS / 2)
    end = Math.min(end, start + MAX_RUN_MS)
    start = Math.max(segs[a].start_ms, end - MAX_RUN_MS)
  }
  return { startIdx: a, endIdx: b, start_ms: start, end_ms: end }
}
```

`lib/stats.ts`:
```ts
import { splitRuns, type Seg } from './speaker-runs'

export type ParticipantStats = { talk_time_sec: number; questions: number; longest_monologue_sec: number }

export function deriveParticipantStats(
  segs: readonly (Seg & { text: string })[],
): Map<string, ParticipantStats> {
  const talkMs = new Map<string, number>()
  const questions = new Map<string, number>()
  const longestMs = new Map<string, number>()
  for (const s of segs) {
    talkMs.set(s.participant_id, (talkMs.get(s.participant_id) ?? 0) + (s.end_ms - s.start_ms))
    questions.set(s.participant_id, (questions.get(s.participant_id) ?? 0) + (s.text.match(/\?/g)?.length ?? 0))
  }
  for (const run of splitRuns(segs)) {
    const id = segs[run.startIdx].participant_id
    longestMs.set(id, Math.max(longestMs.get(id) ?? 0, run.end_ms - run.start_ms))
  }
  const out = new Map<string, ParticipantStats>()
  for (const id of talkMs.keys()) {
    out.set(id, {
      talk_time_sec: Math.round(talkMs.get(id)! / 1000),
      questions: questions.get(id) ?? 0,
      longest_monologue_sec: Math.round((longestMs.get(id) ?? 0) / 1000),
    })
  }
  return out
}

export function unionSeconds(windows: readonly { start_ms: number; end_ms: number }[]): number {
  const sorted = [...windows].sort((a, b) => a.start_ms - b.start_ms)
  let total = 0
  let curStart = -1
  let curEnd = -1
  for (const w of sorted) {
    if (curEnd < 0 || w.start_ms > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart
      curStart = w.start_ms
      curEnd = w.end_ms
    } else curEnd = Math.max(curEnd, w.end_ms)
  }
  if (curEnd >= 0) total += curEnd - curStart
  return Math.round(total / 1000)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/speaker-runs.test.ts tests/stats.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/speaker-runs.ts lib/stats.ts tests/speaker-runs.test.ts tests/stats.test.ts
git commit -m "feat: speaker-run expansion and participant stats" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: LLM client, JSON extraction, concurrency pool

**Files:**
- Create: `lib/llm.ts`, `seed/claude-cli.ts`, `seed/pool.ts`, `seed/ping.ts`, `tests/llm.test.ts`, `tests/pool.test.ts`

**Interfaces:**
- Produces: `type LlmRequest = { system?: string; prompt: string; maxTokens?: number }`, `interface LlmClient { complete(req: LlmRequest): Promise<string> }`, `extractJson(text): unknown`, `completeJson<T>(client, req, schema: z.ZodType<T>, retries = 1): Promise<T>`, `anthropicClient(apiKey, model?): LlmClient`; `claudeCliClient(model?): LlmClient`; `pool<T>(items, n, fn): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`tests/llm.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { completeJson, extractJson, type LlmClient } from '@/lib/llm'

function fake(replies: string[]): LlmClient & { prompts: string[] } {
  let i = 0
  const prompts: string[] = []
  return {
    prompts,
    async complete(req) {
      prompts.push(req.prompt)
      return replies[Math.min(i++, replies.length - 1)]
    },
  }
}

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }))
  it('strips ```json fences', () => expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 }))
  it('finds JSON inside prose', () => expect(extractJson('Here you go:\n[1,2]\nThanks')).toEqual([1, 2]))
  it('throws when there is no JSON', () => expect(() => extractJson('nothing here')).toThrow())
})

describe('completeJson', () => {
  const schema = z.object({ n: z.number() })
  it('returns on the first valid reply without retrying', async () => {
    const c = fake(['{"n":1}'])
    expect(await completeJson(c, { prompt: 'p' }, schema)).toEqual({ n: 1 })
    expect(c.prompts).toHaveLength(1)
  })
  it('retries once on invalid JSON and tells the model what was wrong', async () => {
    const c = fake(['not json', '{"n":2}'])
    expect(await completeJson(c, { prompt: 'p' }, schema)).toEqual({ n: 2 })
    expect(c.prompts[1]).toContain('rejected')
  })
  it('retries once on schema failure', async () => {
    const c = fake(['{"n":"x"}', '{"n":3}'])
    expect(await completeJson(c, { prompt: 'p' }, schema)).toEqual({ n: 3 })
  })
  it('throws after the retries are exhausted', async () => {
    const c = fake(['bad', 'still bad'])
    await expect(completeJson(c, { prompt: 'p' }, schema)).rejects.toThrow(/failed validation/)
  })
})
```

`tests/pool.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { pool } from '@/seed/pool'

describe('pool', () => {
  it('never exceeds the concurrency limit and runs every item', async () => {
    let running = 0
    let max = 0
    const done: number[] = []
    await pool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++
      max = Math.max(max, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      done.push(n)
    })
    expect(max).toBe(2)
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/llm.test.ts tests/pool.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`lib/llm.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'

export type LlmRequest = { system?: string; prompt: string; maxTokens?: number }
export interface LlmClient {
  complete(req: LlmRequest): Promise<string>
}

// Models wrap JSON in ```json fences or prose; take the outermost JSON value.
export function extractJson(text: string): unknown {
  const t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : t
  const start = body.search(/[[{]/)
  if (start === -1) throw new Error('no JSON found in model output')
  const close = body[start] === '{' ? '}' : ']'
  const end = body.lastIndexOf(close)
  if (end <= start) throw new Error('unterminated JSON in model output')
  return JSON.parse(body.slice(start, end + 1))
}

export async function completeJson<T>(
  client: LlmClient,
  req: LlmRequest,
  schema: z.ZodType<T>,
  retries = 1,
): Promise<T> {
  let prompt = req.prompt
  let lastError = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    const text = await client.complete({ ...req, prompt })
    try {
      return schema.parse(extractJson(text))
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      prompt = `${req.prompt}\n\nYour previous reply was rejected: ${lastError.slice(0, 600)}\nReply with ONLY the corrected JSON, no commentary, no code fences.`
    }
  }
  throw new Error(`model output failed validation after ${retries + 1} attempts: ${lastError}`)
}

export function anthropicClient(
  apiKey: string,
  model: string = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
): LlmClient {
  const sdk = new Anthropic({ apiKey })
  return {
    async complete({ system, prompt, maxTokens = 4096 }) {
      const res = await sdk.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      })
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    },
  }
}
```

`seed/pool.ts`:
```ts
export async function pool<T>(
  items: readonly T[],
  n: number,
  fn: (item: T, i: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
}
```

`seed/claude-cli.ts`:
```ts
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { LlmClient } from '@/lib/llm'

// Runs `claude -p` from the OS temp dir so the project capture hook does not log every call,
// with a replaced system prompt so global style hooks (e.g. terse modes) do not leak in.
// --bare is not used: it requires an API key, not the subscription login.
export function claudeCliClient(model: string = process.env.SEED_MODEL ?? 'sonnet'): LlmClient {
  return {
    complete: ({ system, prompt }) =>
      new Promise<string>((resolve, reject) => {
        const args = [
          '-p', '--model', model, '--no-session-persistence', '--disable-slash-commands',
          '--system-prompt', system ?? 'You are a careful assistant. Output exactly the format requested.',
        ]
        const child = spawn('claude', args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
        let out = ''
        let err = ''
        const timer = setTimeout(() => child.kill(), 10 * 60_000)
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (err += d))
        child.on('error', (e) => { clearTimeout(timer); reject(e) })
        child.on('close', (code) => {
          clearTimeout(timer)
          code === 0 ? resolve(out.trim()) : reject(new Error(`claude exited ${code}: ${err.slice(0, 500)}`))
        })
        child.stdin.end(prompt)
      }),
  }
}
```

`seed/ping.ts`:
```ts
import { claudeCliClient } from './claude-cli'

claudeCliClient()
  .complete({ prompt: 'Reply with the single word OK' })
  .then((r) => console.log('claude replied:', r))
  .catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/llm.test.ts tests/pool.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Smoke-test the real CLI client**

Run: `npx tsx seed/ping.ts`
Expected: `claude replied: OK` (any short affirmative). If it hangs or errors, stop and diagnose before continuing: the whole seed pipeline depends on it. Confirm no new file appeared under `.agent-logs/` from this call: `git status --short .agent-logs`.

- [ ] **Step 6: Commit**

```bash
git add lib/llm.ts seed/claude-cli.ts seed/pool.ts seed/ping.ts tests/llm.test.ts tests/pool.test.ts
git commit -m "feat: LLM client abstraction, JSON extraction, claude CLI adapter" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Due-date resolution and timestamp stamping

**Files:**
- Create: `seed/due.ts`, `seed/stamp.ts`, `tests/due.test.ts`, `tests/stamp.test.ts`

**Interfaces:**
- Produces: `resolveDue(phrase: string | null, meetingDate: Date): string | null` (ISO `YYYY-MM-DD`, UTC); `type Line = { speaker: string; text: string }`, `type Stamped = Line & { idx: number; start_ms: number; end_ms: number }`, `mulberry32(seed: number): () => number`, `stampTimestamps(lines: readonly Line[], opts: { targetMs: number; seed: number }): Stamped[]`.

- [ ] **Step 1: Write the failing tests**

`tests/due.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { resolveDue } from '@/seed/due'

const sunday = new Date('2026-10-04T15:00:00Z') // a Sunday: the test call that got this wrong
const monday = new Date('2026-10-05T15:00:00Z')

describe('resolveDue', () => {
  it('resolves weekday names to the next occurrence', () => {
    expect(resolveDue('Thursday', sunday)).toBe('2026-10-08')
    expect(resolveDue('by Friday', sunday)).toBe('2026-10-09')
    expect(resolveDue('Fri', sunday)).toBe('2026-10-09')
  })
  it('a weekday equal to the meeting day means next week', () => {
    expect(resolveDue('by Monday', monday)).toBe('2026-10-12')
  })
  it('resolves today, tomorrow, end of week, next week, end of month', () => {
    expect(resolveDue('today', sunday)).toBe('2026-10-04')
    expect(resolveDue('tomorrow', sunday)).toBe('2026-10-05')
    expect(resolveDue('end of week', sunday)).toBe('2026-10-09')
    expect(resolveDue('next week', monday)).toBe('2026-10-12')
    expect(resolveDue('end of the month', sunday)).toBe('2026-10-31')
  })
  it('passes ISO dates through', () => expect(resolveDue('2026-11-02', sunday)).toBe('2026-11-02'))
  it('returns null for null, empty and unrecognized phrases', () => {
    expect(resolveDue(null, sunday)).toBeNull()
    expect(resolveDue('', sunday)).toBeNull()
    expect(resolveDue('whenever we can', sunday)).toBeNull()
    expect(resolveDue('monthly review', sunday)).toBeNull()
  })
})
```

`tests/stamp.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { stampTimestamps, type Line } from '@/seed/stamp'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
const lines = (count: number, wordsPer: number): Line[] =>
  Array.from({ length: count }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', text: words(wordsPer) }))

describe('stampTimestamps', () => {
  it('is deterministic for a given seed and differs across seeds', () => {
    const a = stampTimestamps(lines(30, 12), { targetMs: 120_000, seed: 1 })
    const b = stampTimestamps(lines(30, 12), { targetMs: 120_000, seed: 1 })
    const c = stampTimestamps(lines(30, 12), { targetMs: 120_000, seed: 2 })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
  it('keeps starts increasing, ends after starts, and idx contiguous', () => {
    const out = stampTimestamps(lines(200, 15), { targetMs: 1_300_000, seed: 7 })
    out.forEach((l, i) => {
      expect(l.idx).toBe(i)
      expect(l.end_ms).toBeGreaterThan(l.start_ms)
      if (i > 0) expect(l.start_ms).toBeGreaterThan(out[i - 1].start_ms)
    })
  })
  it('lands within 5% of the target when the natural pace allows scaling', () => {
    const target = 1_300_000
    const out = stampTimestamps(lines(200, 15), { targetMs: target, seed: 7 })
    expect(Math.abs(out.at(-1)!.end_ms - target) / target).toBeLessThan(0.05)
  })
  it('clamps pace scaling to between 0.8x and 1.25x', () => {
    const shrunk = stampTimestamps(lines(50, 15), { targetMs: 1, seed: 3 }).at(-1)!.end_ms
    const stretched = stampTimestamps(lines(50, 15), { targetMs: 10_000_000, seed: 3 }).at(-1)!.end_ms
    // the 1000ms lead-in is not scaled, so compare the scaled part: 1.25 / 0.8 = 1.5625
    expect((stretched - 1000) / (shrunk - 1000)).toBeCloseTo(1.5625, 1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/due.test.ts tests/stamp.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`seed/due.ts`:
```ts
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_WORD = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

// Models guess calendar dates badly, so they return the spoken phrase and code resolves it.
export function resolveDue(phrase: string | null, meetingDate: Date): string | null {
  if (!phrase) return null
  const p = phrase.toLowerCase().trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p
  const base = new Date(Date.UTC(meetingDate.getUTCFullYear(), meetingDate.getUTCMonth(), meetingDate.getUTCDate()))
  const cur = base.getUTCDay()
  if (/\btoday\b/.test(p)) return iso(base)
  if (/\btomorrow\b/.test(p)) return iso(addDays(base, 1))
  if (/end of (the )?month/.test(p)) return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)))
  if (/end of (the )?week|\beow\b/.test(p)) return iso(addDays(base, (5 - cur + 7) % 7))
  if (/next week/.test(p)) return iso(addDays(base, (1 - cur + 7) % 7 || 7))
  const m = p.match(DAY_WORD)
  if (m) return iso(addDays(base, (DAYS.indexOf(m[1].slice(0, 3)) - cur + 7) % 7 || 7))
  return null
}
```

`seed/stamp.ts`:
```ts
export type Line = { speaker: string; text: string }
export type Stamped = Line & { idx: number; start_ms: number; end_ms: number }

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS_PER_SEC = 2.5

// LLM timestamps drift, so lines are timed in code: word count / pace with jitter, gaps,
// the occasional overlap, then uniformly scaled (0.8x-1.25x) toward the target duration.
export function stampTimestamps(
  lines: readonly Line[],
  opts: { targetMs: number; seed: number },
): Stamped[] {
  const rng = mulberry32(opts.seed)
  const durs: number[] = []
  const gaps: number[] = []
  lines.forEach((l, i) => {
    const words = l.text.trim().split(/\s+/).length
    durs.push((words / WORDS_PER_SEC) * 1000 * (0.85 + 0.3 * rng()))
    let gap = 150 + rng() * 750
    if (i > 0 && l.speaker !== lines[i - 1].speaker && rng() < 0.06) gap = -250
    gaps.push(gap)
  })
  const natural = durs.reduce((a, b) => a + b, 0) + gaps.slice(1).reduce((a, b) => a + b, 0)
  const scale = Math.min(1.25, Math.max(0.8, opts.targetMs / natural))
  let cursor = 1000
  let prevStart = 0
  return lines.map((l, i) => {
    if (i > 0) cursor += gaps[i] * scale
    let start = Math.round(cursor)
    if (i > 0 && start <= prevStart) start = prevStart + 1
    const end = Math.max(start + 400, Math.round(start + durs[i] * scale))
    cursor = end
    prevStart = start
    return { ...l, idx: i, start_ms: start, end_ms: end }
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/due.test.ts tests/stamp.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add seed/due.ts seed/stamp.ts tests/due.test.ts tests/stamp.test.ts
git commit -m "feat(seed): due-date resolution and deterministic timestamping" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Team roster and meeting definitions

**Files:**
- Create: `seed/team.ts`, `seed/meetings.ts`, `tests/seed-defs.test.ts`

**Interfaces:**
- Produces: `TEAM: Member[]`, `memberBySlug: Map<string, Member>`, `COMPANY`, `PRODUCT`; `MeetingDef`, `MEETINGS: MeetingDef[]`, `SEED_ANCHOR: number`, `startedAt(def): Date`, `type CastMember = { name; role; is_internal: boolean; member?: string }`, `castOf(def): CastMember[]`, `validateDefs(): string[]`.

- [ ] **Step 1: Write the failing test**

`tests/seed-defs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { castOf, MEETINGS, SEED_ANCHOR, startedAt, validateDefs } from '@/seed/meetings'
import { TEAM } from '@/seed/team'

describe('seed definitions', () => {
  it('are internally consistent', () => expect(validateDefs()).toEqual([]))
  it('has 8 team members with exactly one demo persona', () => {
    expect(TEAM).toHaveLength(8)
    expect(TEAM.filter((m) => m.demo)).toHaveLength(1)
  })
  it('has 8 meetings and one 8-person showcase of about an hour', () => {
    expect(MEETINGS).toHaveLength(8)
    const show = MEETINGS.filter((m) => m.showcase)
    expect(show).toHaveLength(1)
    expect(castOf(show[0])).toHaveLength(8)
    expect(show[0].targetMin).toBeGreaterThanOrEqual(60)
  })
  it('every meeting started before the anchor and within the last three weeks', () => {
    for (const m of MEETINGS) {
      const t = startedAt(m).getTime()
      expect(t).toBeLessThan(SEED_ANCHOR)
      expect(SEED_ANCHOR - t).toBeLessThan(21 * 86_400_000)
    }
  })
  it('the demo persona hosts at least three meetings', () => {
    const demo = TEAM.find((m) => m.demo)!.slug
    expect(MEETINGS.filter((m) => m.host === demo).length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/seed-defs.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`seed/team.ts`:
```ts
export type Member = { slug: string; name: string; role: string; demo?: boolean }

export const COMPANY = 'Kestrel'
export const PRODUCT =
  'Kestrel Dispatch, route planning and dispatch software for regional freight carriers'

export const TEAM: Member[] = [
  { slug: 'priya', name: 'Priya Raman', role: 'Product Lead', demo: true },
  { slug: 'daniel', name: 'Daniel Ortiz', role: 'Sales' },
  { slug: 'mei', name: 'Mei Tanaka', role: 'Engineering Manager' },
  { slug: 'jonas', name: 'Jonas Weber', role: 'Design Lead' },
  { slug: 'amara', name: 'Amara Nwosu', role: 'Customer Success' },
  { slug: 'lucas', name: 'Lucas Ferreira', role: 'Data & Analytics' },
  { slug: 'hannah', name: 'Hannah Cole', role: 'Marketing' },
  { slug: 'omar', name: 'Omar Haddad', role: 'Finance' },
]

export const memberBySlug = new Map(TEAM.map((m) => [m.slug, m]))
```

`seed/meetings.ts`:
```ts
import { memberBySlug, TEAM } from './team'

export type External = { name: string; role: string }
export type MeetingDef = {
  slug: string
  title: string
  kind: 'sales' | 'standup' | 'one_on_one' | 'interview' | 'postmortem' | 'design_review' | 'planning'
  platform: 'zoom' | 'meet' | 'teams'
  daysAgo: number
  hourUtc: number
  host: string
  internal: string[]
  externals: External[]
  targetMin: number
  topic: string
  showcase?: boolean
}

export const SEED_ANCHOR = Date.UTC(2026, 9, 5) // 2026-10-05

export const startedAt = (d: MeetingDef) =>
  new Date(SEED_ANCHOR - d.daysAgo * 86_400_000 + d.hourUtc * 3_600_000)

export type CastMember = { name: string; role: string; is_internal: boolean; member?: string }

export function castOf(d: MeetingDef): CastMember[] {
  const inside = d.internal.map((slug) => {
    const m = memberBySlug.get(slug)!
    return { name: m.name, role: m.role, is_internal: true, member: slug }
  })
  return [...inside, ...d.externals.map((e) => ({ ...e, is_internal: false }))]
}

export const MEETINGS: MeetingDef[] = [
  {
    slug: 'q4-planning', title: 'Q4 Product Planning', kind: 'planning', platform: 'zoom',
    daysAgo: 2, hourUtc: 15, host: 'priya',
    internal: ['priya', 'daniel', 'mei', 'jonas', 'amara', 'lucas', 'hannah', 'omar'],
    externals: [], targetMin: 62, showcase: true,
    topic: 'Q4 planning for Kestrel Dispatch. Review Q3 results (churn 4.1%, ETA accuracy 82%, new customers take 19 days to onboard), choose the three Q4 bets (driver mobile app v2, an ETA-accuracy model, self-serve onboarding), size engineering capacity, agree budget and two hires, align launch marketing, and name risks and owners. The team disagrees about whether to cut self-serve onboarding to protect the mobile app.',
  },
  {
    slug: 'acme-discovery', title: 'Discovery Call // Acme Freight', kind: 'sales', platform: 'meet',
    daysAgo: 5, hourUtc: 16, host: 'daniel', internal: ['daniel', 'priya'],
    externals: [
      { name: 'Elena Voss', role: 'VP Operations, Acme Freight' },
      { name: 'Tom Brandt', role: 'Dispatch Manager, Acme Freight' },
    ],
    targetMin: 35,
    topic: 'Discovery call with Acme Freight, a 140-truck regional carrier that dispatches with spreadsheets and phone calls. Pain: late deliveries, idle drivers, no live ETAs for their customers. They are evaluating two competitors. Budget of roughly $60k a year is approved, decision due by end of next month, a security review is required, and Tom objects that migrating their data will be painful.',
  },
  {
    slug: 'eng-standup', title: 'Engineering Standup', kind: 'standup', platform: 'zoom',
    daysAgo: 1, hourUtc: 9, host: 'mei', internal: ['mei', 'lucas', 'jonas', 'amara'],
    externals: [], targetMin: 15,
    topic: 'Daily engineering standup. Each person says what they did yesterday, what they will do today and what blocks them. Topics: the ETA model retraining pipeline, a driver-app crash on Android 14, a design handoff waiting on review, and a customer escalation from support.',
  },
  {
    slug: 'priya-mei-1on1', title: 'Priya / Mei 1:1', kind: 'one_on_one', platform: 'meet',
    daysAgo: 3, hourUtc: 14, host: 'priya', internal: ['priya', 'mei'],
    externals: [], targetMin: 30,
    topic: 'A 1:1 between Priya (Product Lead) and Mei (Engineering Manager): workload and burnout on the platform team, worry about Q4 scope, hiring two backend engineers, Mei growing toward a director role, and feedback on how product and engineering plan together.',
  },
  {
    slug: 'harbor-interview', title: 'Customer Interview // Harbor Logistics', kind: 'interview', platform: 'zoom',
    daysAgo: 8, hourUtc: 17, host: 'amara', internal: ['amara'],
    externals: [{ name: 'Rafael Mendes', role: 'Operations Manager, Harbor Logistics' }],
    targetMin: 40,
    topic: 'Customer interview with Harbor Logistics about how they use Kestrel Dispatch: their daily workflow, what they love (the live map, auto-assign), frustrations (clunky bulk import, slow reports), what they would pay more for (proactive delay alerts), competitor mentions, and a request for an API.',
  },
  {
    slug: 'optimizer-outage-postmortem', title: 'Route Optimizer Outage Postmortem', kind: 'postmortem', platform: 'teams',
    daysAgo: 11, hourUtc: 13, host: 'mei', internal: ['mei', 'lucas', 'jonas', 'amara', 'omar'],
    externals: [], targetMin: 45,
    topic: 'Blameless postmortem of a 52-minute outage of the route optimizer last Tuesday: a deploy changed a database index, a nightly job locked tables, and dispatchers saw empty routes. Cover the timeline, the detection gap (alerts fired late), customer impact (31 customers), what went well, the root cause, and action items on alert thresholds, deploy checklists and status-page communication.',
  },
  {
    slug: 'mobile-design-review', title: 'Mobile App Design Review', kind: 'design_review', platform: 'meet',
    daysAgo: 15, hourUtc: 18, host: 'priya', internal: ['priya', 'jonas', 'mei', 'hannah'],
    externals: [], targetMin: 50,
    topic: 'Design review of the Kestrel driver mobile app v2: the onboarding flow, the new stop-list screen, offline-mode behavior, accessibility contrast issues, push notification copy, and an argument about swipe-to-complete versus a confirm button.',
  },
  {
    slug: 'weekly-product-sync', title: 'Weekly Product Sync', kind: 'planning', platform: 'zoom',
    daysAgo: 4, hourUtc: 10, host: 'priya', internal: ['priya', 'daniel', 'amara', 'lucas'],
    externals: [], targetMin: 25,
    topic: 'Weekly product sync: top feature requests from customers, pipeline feedback from sales, support ticket trends, and what to prioritize before the next planning cycle.',
  },
  {
    slug: 'sales-pipeline-review', title: 'Sales Pipeline Review', kind: 'sales', platform: 'teams',
    daysAgo: 6, hourUtc: 12, host: 'daniel', internal: ['daniel', 'priya', 'hannah'],
    externals: [], targetMin: 30,
    topic: 'Weekly sales pipeline review: deals at risk, forecast versus quota, a stalled enterprise deal, and marketing support for two campaigns.',
  },
]

export function validateDefs(): string[] {
  const errs: string[] = []
  const slugs = new Set<string>()
  if (TEAM.filter((m) => m.demo).length !== 1) errs.push('team must have exactly one demo persona')
  for (const d of MEETINGS) {
    if (slugs.has(d.slug)) errs.push(`duplicate slug ${d.slug}`)
    slugs.add(d.slug)
    if (!d.internal.includes(d.host)) errs.push(`${d.slug}: host must be in internal`)
    for (const s of d.internal) if (!memberBySlug.has(s)) errs.push(`${d.slug}: unknown member ${s}`)
    if (startedAt(d).getTime() >= SEED_ANCHOR) errs.push(`${d.slug}: must start before the anchor`)
    const names = castOf(d).map((c) => c.name)
    if (new Set(names).size !== names.length) errs.push(`${d.slug}: duplicate cast names`)
  }
  const showcase = MEETINGS.filter((d) => d.showcase)
  if (showcase.length !== 1 || castOf(showcase[0]).length !== 8) {
    errs.push('need exactly one showcase meeting with 8 participants')
  }
  return errs
}
```
- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/seed-defs.test.ts && npm run typecheck`
Expected: PASS (8 meetings after adding the eighth definition).

- [ ] **Step 5: Commit**

```bash
git add seed/team.ts seed/meetings.ts tests/seed-defs.test.ts
git commit -m "feat(seed): team roster and meeting definitions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Prompts and the generation pipeline

**Files:**
- Create: `lib/prompts.ts`, `seed/io.ts`, `seed/gen/meeting.ts`, `seed/gen/ask.ts`, `seed/gen/index.ts`, `tests/gen-meeting.test.ts`

**Interfaces:**
- Consumes: `LlmClient`, `completeJson` (Task 7); schemas (Task 5); `expandToRun` (Task 6); `resolveDue`, `stampTimestamps` (Task 8); `MeetingDef`, `castOf`, `startedAt`, `MEETINGS` (Task 9).
- Produces: `lib/prompts.ts` exports `SYSTEM_WRITER`, `SYSTEM_ANALYST`, `formatTranscript(lines: TLine[])`, `TEMPLATE_GUIDE`, `briefPrompt`, `chapterPrompt`, `summaryPrompt(template, {title,date,transcript})`, `actionItemsPrompt`, `highlightsPrompt`, `ASK_PROMPTS`, `askPrompt`, `liveAskPrompt`. Every prompt's first line is `TASK: <name>`. `seed/io.ts` exports `GEN_DIR`, `fileOf(slug, name, dir?)`, `writeJson`, `readJson<T>`, `exists`. `generateMeeting(client, def, opts?)` writes `seed/generated/<slug>/{brief,transcript,summaries,actions,highlights}.json` and skips files that exist unless `opts.force`. `generateAsk(client, defs, opts?)` writes `seed/generated/ask.json`.

- [ ] **Step 1: Write the failing test**

`tests/gen-meeting.test.ts`:
```ts
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LlmClient } from '@/lib/llm'
import { actionsFileSchema, briefSchema, highlightsFileSchema, summariesFileSchema, transcriptFileSchema } from '@/lib/schema'
import { generateMeeting } from '@/seed/gen/meeting'
import { fileOf, readJson } from '@/seed/io'
import type { MeetingDef } from '@/seed/meetings'

const def: MeetingDef = {
  slug: 'tiny', title: 'Tiny Sync', kind: 'standup', platform: 'zoom', daysAgo: 1, hourUtc: 9,
  host: 'priya', internal: ['priya', 'mei'], externals: [], targetMin: 6, topic: 'A tiny test meeting.',
}
const A = 'Priya Raman'
const B = 'Mei Tanaka'
const chapterLines = Array.from({ length: 6 }, (_, i) => ({
  speaker: i % 2 ? B : A,
  text: 'we should review the numbers and then decide what to ship this week',
}))

const fake: LlmClient = {
  async complete({ prompt }) {
    switch (prompt.split('\n')[0]) {
      case 'TASK: brief':
        return JSON.stringify({
          agenda: ['a'],
          chapters: [1, 2, 3].map((i) => ({ title: `Chapter ${i}`, beats: ['beat'], minutes: 2 })),
        })
      case 'TASK: chapter':
        return '```json\n' + JSON.stringify(chapterLines) + '\n```'
      case 'TASK: summary':
        return JSON.stringify({ sections: [{ heading: 'Overview', bullets: ['They met.'] }] })
      case 'TASK: actions':
        return JSON.stringify({ action_items: [{ owner: A, task: 'Ship it', due_phrase: 'Friday', segment_idx: 4 }] })
      case 'TASK: highlights':
        return JSON.stringify({
          highlights: [
            { segment_idx: 0, type: 'insight', title: 'Kickoff moment' },
            { segment_idx: 6, type: 'objection', title: 'A concern is raised' },
            { segment_idx: 12, type: 'action_item', title: 'Owner takes the task' },
          ],
        })
      default:
        throw new Error(`unexpected prompt: ${prompt.slice(0, 40)}`)
    }
  },
}
const never: LlmClient = { async complete() { throw new Error('should not be called') } }

describe('generateMeeting', () => {
  it('writes every file in the expected shape', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    for (const n of ['brief', 'transcript', 'summaries', 'actions', 'highlights']) {
      expect(existsSync(fileOf('tiny', n, dir))).toBe(true)
    }
    expect(briefSchema.safeParse(readJson(fileOf('tiny', 'brief', dir))).success).toBe(true)
    const t = transcriptFileSchema.parse(readJson(fileOf('tiny', 'transcript', dir)))
    expect(t.lines).toHaveLength(18)
    expect(t.chapters.map((c) => c.start_idx)).toEqual([0, 6, 12])
    expect(t.duration_ms).toBe(t.lines.at(-1)!.end_ms)
    expect(summariesFileSchema.safeParse(readJson(fileOf('tiny', 'summaries', dir))).success).toBe(true)
    expect(actionsFileSchema.safeParse(readJson(fileOf('tiny', 'actions', dir))).success).toBe(true)
  })
  it('resolves relative due phrases against the meeting date', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    const actions = actionsFileSchema.parse(readJson(fileOf('tiny', 'actions', dir)))
    expect(actions[0].due).toBe('2026-10-09')
  })
  it('expands highlight picks to speaker-run windows within 5 minutes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    const hl = highlightsFileSchema.parse(readJson(fileOf('tiny', 'highlights', dir)))
    expect(hl).toHaveLength(3)
    for (const h of hl) {
      expect(h.end_ms).toBeGreaterThan(h.start_ms)
      expect(h.end_ms - h.start_ms).toBeLessThanOrEqual(300_000)
    }
  })
  it('is resumable: existing files are not regenerated', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-'))
    await generateMeeting(fake, def, { dir, log: () => {} })
    await expect(generateMeeting(never, def, { dir, log: () => {} })).resolves.toBeUndefined()
  })
})
```
- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/gen-meeting.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement prompts**

`lib/prompts.ts`:
```ts
import type { Template } from './schema'

export const SYSTEM_WRITER =
  'You are a screenwriter producing realistic, natural, fully punctuated spoken dialogue for business meetings. Use complete sentences, never terse fragments. Output exactly the format requested and nothing else.'
export const SYSTEM_ANALYST =
  'You are a precise meeting analyst. Use only facts present in the material you are given. Write complete, plain sentences. Output exactly the format requested and nothing else.'

export type PromptMeeting = { title: string; kind: string; targetMin: number; topic: string; showcase?: boolean }
export type PromptPerson = { name: string; role: string }
export type TLine = { idx: number; speaker: string; text: string }

const COMPANY =
  'Company: Kestrel. Product: Kestrel Dispatch, route planning and dispatch software for regional freight carriers.'
const people = (cast: readonly PromptPerson[]) => cast.map((c) => `${c.name} (${c.role})`).join('; ')

export const formatTranscript = (lines: readonly TLine[]) =>
  lines.map((l) => `[${l.idx}] ${l.speaker}: ${l.text}`).join('\n')

export const TEMPLATE_GUIDE: Record<Template, { headings: string[]; focus: string }> = {
  general: {
    headings: ['Overview', 'Key points', 'Decisions', 'Open questions'],
    focus: 'A neutral recap of what was discussed and decided.',
  },
  sales: {
    headings: ['Pain points', 'Current solution', 'Budget and timeline', 'Objections', 'Next steps'],
    focus: 'A sales-call view: needs, constraints, and the buying process.',
  },
  standup: {
    headings: ['Yesterday', 'Today', 'Blockers'],
    focus: 'What each person did, will do, and what blocks them. Name the person in every bullet.',
  },
  project_review: {
    headings: ['Goals', 'Progress', 'Risks', 'Decisions', 'Next steps'],
    focus: 'A project-status review.',
  },
}

export function briefPrompt(def: PromptMeeting, cast: readonly PromptPerson[]): string {
  const long = def.targetMin >= 45
  return `TASK: brief
Plan a realistic ${def.targetMin}-minute ${def.kind.replace(/_/g, ' ')} meeting titled "${def.title}".
${COMPANY}
Topic: ${def.topic}
Participants: ${people(cast)}

Return ONLY JSON: {"agenda": string[], "chapters": [{"title": string, "beats": string[], "minutes": number}]}
Rules: ${long ? '6 to 8' : '3 to 5'} chapters in meeting order; chapter minutes add up to ${def.targetMin}; each chapter has 2 to 4 concrete beats with specific numbers, names or disagreements.`
}

export function chapterPrompt(a: {
  def: PromptMeeting
  cast: readonly PromptPerson[]
  chapter: { title: string; beats: string[]; minutes: number }
  index: number
  total: number
  prev: { speaker: string; text: string }[]
  words: number
}): string {
  const last = a.index === a.total - 1
  const prev = a.prev.length
    ? `Previous lines (continue naturally, do not repeat them):\n${a.prev.map((l) => `${l.speaker}: ${l.text}`).join('\n')}`
    : 'This is the start of the meeting: include greetings.'
  return `TASK: chapter
Write chapter ${a.index + 1} of ${a.total} ("${a.chapter.title}") of the meeting "${a.def.title}" as spoken dialogue.
${COMPANY}
Topic: ${a.def.topic}
Participants (use these exact names as speakers): ${a.cast.map((c) => `${c.name} (${c.role})`).join('; ')}
Chapter beats:
${a.chapter.beats.map((b) => `- ${b}`).join('\n')}
${prev}
${last ? 'This is the final chapter: end with a wrap-up and thanks.' : ''}
Length: about ${a.words} words in total.

Return ONLY JSON: [{"speaker": string, "text": string}]
Rules: each line is 1 to 3 sentences (8 to 35 words); natural back-and-forth with questions, interruptions, agreement and disagreement; ${a.def.showcase ? 'at least four different people speak in this chapter and everyone speaks over the whole meeting; ' : ''}stay in character and on topic; no stage directions.`
}

export function summaryPrompt(
  template: Template,
  ctx: { title: string; date: string; transcript: string },
): string {
  const g = TEMPLATE_GUIDE[template]
  return `TASK: summary
Summarize this meeting using the "${template}" template. ${g.focus}
Meeting: "${ctx.title}" on ${ctx.date}.
Use exactly these section headings, in this order: ${g.headings.join(' | ')}.

Return ONLY JSON: {"sections": [{"heading": string, "bullets": string[]}]}
Rules: 2 to 6 concise bullets per section, each a full sentence grounded in the transcript, naming people and numbers.

Transcript:
${ctx.transcript}`
}

export function actionItemsPrompt(ctx: {
  title: string; date: string; weekday: string; transcript: string; speakers: readonly string[]
}): string {
  return `TASK: actions
Extract the action items from this meeting. Meeting: "${ctx.title}", held on ${ctx.date} (${ctx.weekday}).

Return ONLY JSON: {"action_items": [{"owner": string, "task": string, "due_phrase": string | null, "segment_idx": number}]}
Rules: owner must be exactly one of: ${ctx.speakers.join(', ')}; task is an imperative sentence; due_phrase is the deadline wording as spoken ("Thursday", "end of week", "next week", "tomorrow") or null, and you must never compute a calendar date; segment_idx is the [number] of the line where the commitment was made. 3 to 8 items.

Transcript:
${ctx.transcript}`
}

export function highlightsPrompt(ctx: { title: string; transcript: string }): string {
  return `TASK: highlights
Pick 3 to 6 moments in "${ctx.title}" that a product or sales lead would bookmark.

Return ONLY JSON: {"highlights": [{"segment_idx": number, "type": "action_item" | "insight" | "positive" | "feedback" | "objection" | "tech_question", "title": string}]}
Rules: segment_idx is the [number] of a line inside the moment; title is 3 to 8 words; spread the picks across the meeting; use a variety of types where the transcript supports it.

Transcript:
${ctx.transcript}`
}

export const ASK_PROMPTS = [
  'Next steps on projects?',
  'Summarize my recent meetings',
  'Surprise me with an insight',
] as const

export function askPrompt(question: string, corpus: string): string {
  return `TASK: ask
You answer questions about a team's recent meetings using only the notes below.
Question: ${question}

Return ONLY JSON: {"text": string, "citations": [{"meeting_slug": string, "segment_idx": number, "label": string}]}
Rules: text is 3 to 6 plain-text sentences or short dash bullets; give 2 to 5 citations; each citation uses a meeting_slug and a segment_idx that both appear in the notes; label is a short phrase describing the cited moment.

Notes:
${corpus}`
}

export function liveAskPrompt(question: string, context: string): string {
  return `TASK: live-ask
Answer the question using only the excerpts below.
Question: ${question}

Return ONLY JSON: {"text": string, "refs": string[]}
Rules: text is 2 to 6 plain-text sentences; refs lists the excerpt ids (like "slug#12") you relied on; if the excerpts do not answer the question, say so in text and return an empty refs array.

Excerpts:
${context}`
}
```

- [ ] **Step 4: Implement io and the meeting generator**

`seed/io.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const GEN_DIR = join(process.cwd(), 'seed', 'generated')
export const fileOf = (slug: string, name: string, dir: string = GEN_DIR) => join(dir, slug, `${name}.json`)
export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}
export const readJson = <T = unknown>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
export const exists = existsSync
```

`seed/gen/meeting.ts`:
```ts
import { completeJson, type LlmClient } from '@/lib/llm'
import { expandToRun } from '@/lib/speaker-runs'
import {
  actionItemsSchema, briefSchema, chapterLinesSchema, highlightPicksSchema,
  summaryContentSchema, TEMPLATES, type Brief, type TranscriptFile,
} from '@/lib/schema'
import {
  actionItemsPrompt, briefPrompt, chapterPrompt, formatTranscript, highlightsPrompt,
  SYSTEM_ANALYST, SYSTEM_WRITER, summaryPrompt,
} from '@/lib/prompts'
import { resolveDue } from '../due'
import { exists, fileOf, GEN_DIR, readJson, writeJson } from '../io'
import { castOf, startedAt, type MeetingDef } from '../meetings'
import { stampTimestamps, type Line } from '../stamp'

export type GenOptions = { dir?: string; force?: boolean; log?: (m: string) => void }

const hashSeed = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function generateMeeting(client: LlmClient, def: MeetingDef, opts: GenOptions = {}): Promise<void> {
  const { dir = GEN_DIR, force = false, log = console.log } = opts
  const cast = castOf(def)
  const names = cast.map((c) => c.name)
  const path = (n: string) => fileOf(def.slug, n, dir)
  const need = (n: string) => force || !exists(path(n))

  if (need('brief')) {
    log(`${def.slug}: brief`)
    const brief = await completeJson(
      client, { system: SYSTEM_WRITER, prompt: briefPrompt(def, cast), maxTokens: 2000 }, briefSchema,
    )
    writeJson(path('brief'), brief)
  }
  const brief = readJson<Brief>(path('brief'))

  if (need('transcript')) {
    const lines: Line[] = []
    const chapters: { title: string; start_idx: number }[] = []
    for (let i = 0; i < brief.chapters.length; i++) {
      const ch = brief.chapters[i]
      log(`${def.slug}: chapter ${i + 1}/${brief.chapters.length} "${ch.title}"`)
      chapters.push({ title: ch.title, start_idx: lines.length })
      const got = await completeJson(
        client,
        {
          system: SYSTEM_WRITER,
          prompt: chapterPrompt({
            def, cast, chapter: ch, index: i, total: brief.chapters.length,
            prev: lines.slice(-15), words: Math.round(ch.minutes * 150),
          }),
          maxTokens: 8000,
        },
        chapterLinesSchema(names),
      )
      lines.push(...got)
    }
    const stamped = stampTimestamps(lines, { targetMs: def.targetMin * 60_000, seed: hashSeed(def.slug) })
    const file: TranscriptFile = { lines: stamped, chapters, duration_ms: stamped.at(-1)!.end_ms }
    writeJson(path('transcript'), file)
  }
  const transcript = readJson<TranscriptFile>(path('transcript'))
  const text = formatTranscript(transcript.lines)
  const date = startedAt(def)
  const isoDate = date.toISOString().slice(0, 10)

  if (need('summaries')) {
    log(`${def.slug}: summaries`)
    const entries = await Promise.all(
      TEMPLATES.map(async (t) => [
        t,
        await completeJson(
          client,
          { system: SYSTEM_ANALYST, prompt: summaryPrompt(t, { title: def.title, date: isoDate, transcript: text }), maxTokens: 3000 },
          summaryContentSchema,
        ),
      ] as const),
    )
    writeJson(path('summaries'), Object.fromEntries(entries))
  }

  if (need('actions')) {
    log(`${def.slug}: action items`)
    const got = await completeJson(
      client,
      {
        system: SYSTEM_ANALYST,
        prompt: actionItemsPrompt({
          title: def.title, date: isoDate, weekday: WEEKDAYS[date.getUTCDay()], transcript: text, speakers: names,
        }),
        maxTokens: 2500,
      },
      actionItemsSchema(names, transcript.lines.length - 1),
    )
    writeJson(
      path('actions'),
      got.action_items.map((a) => ({
        owner: a.owner,
        task: a.task,
        due: resolveDue(a.due_phrase, date),
        segment_idx: a.segment_idx,
        start_ms: transcript.lines[a.segment_idx].start_ms,
      })),
    )
  }

  if (need('highlights')) {
    log(`${def.slug}: highlights`)
    const got = await completeJson(
      client,
      { system: SYSTEM_ANALYST, prompt: highlightsPrompt({ title: def.title, transcript: text }), maxTokens: 1500 },
      highlightPicksSchema(transcript.lines.length - 1),
    )
    const segs = transcript.lines.map((l) => ({ participant_id: l.speaker, start_ms: l.start_ms, end_ms: l.end_ms }))
    writeJson(
      path('highlights'),
      got.highlights.flatMap((p) => {
        const run = expandToRun(segs, p.segment_idx)
        return run
          ? [{ segment_idx: p.segment_idx, type: p.type, title: p.title, start_ms: run.start_ms, end_ms: run.end_ms }]
          : []
      }),
    )
  }
}
```

- [ ] **Step 5: Implement the Ask generator and the CLI**

`seed/gen/ask.ts`:
```ts
import { completeJson, type LlmClient } from '@/lib/llm'
import { ASK_PROMPTS, askPrompt, SYSTEM_ANALYST } from '@/lib/prompts'
import { askAnswerSchema, type SummaryContent, type TranscriptFile } from '@/lib/schema'
import { exists, fileOf, GEN_DIR, readJson, writeJson } from '../io'
import { startedAt, type MeetingDef } from '../meetings'
import { memberBySlug } from '../team'
import type { GenOptions } from './meeting'
import { join } from 'node:path'

type ActionRow = { segment_idx: number; owner: string; task: string; due: string | null }
type HighlightRow = { segment_idx: number; type: string; title: string }

export async function generateAsk(client: LlmClient, defs: readonly MeetingDef[], opts: GenOptions = {}): Promise<void> {
  const { dir = GEN_DIR, force = false, log = console.log } = opts
  const out = join(dir, 'ask.json')
  if (!force && exists(out)) {
    log('ask: exists, skipping')
    return
  }
  const lineCounts = new Map<string, number>()
  const corpus = defs
    .map((d) => {
      const t = readJson<TranscriptFile>(fileOf(d.slug, 'transcript', dir))
      lineCounts.set(d.slug, t.lines.length)
      const general = readJson<{ general: SummaryContent }>(fileOf(d.slug, 'summaries', dir)).general
      const acts = readJson<ActionRow[]>(fileOf(d.slug, 'actions', dir))
      const hls = readJson<HighlightRow[]>(fileOf(d.slug, 'highlights', dir))
      return [
        `## ${d.slug}: ${d.title} (${startedAt(d).toISOString().slice(0, 10)}, host ${memberBySlug.get(d.host)!.name})`,
        ...general.sections.flatMap((s) => [`${s.heading}:`, ...s.bullets.map((b) => `- ${b}`)]),
        'Action items:',
        ...acts.map((a) => `- [${a.segment_idx}] ${a.owner}: ${a.task}${a.due ? ` (due ${a.due})` : ''}`),
        'Highlights:',
        ...hls.map((h) => `- [${h.segment_idx}] ${h.type}: ${h.title}`),
      ].join('\n')
    })
    .join('\n\n')

  const slugs = defs.map((d) => d.slug)
  const answers = []
  for (const prompt of ASK_PROMPTS) {
    log(`ask: "${prompt}"`)
    const a = await completeJson(
      client, { system: SYSTEM_ANALYST, prompt: askPrompt(prompt, corpus), maxTokens: 2000 }, askAnswerSchema(slugs),
    )
    const citations = a.citations.filter((c) => c.segment_idx < (lineCounts.get(c.meeting_slug) ?? 0))
    if (citations.length === 0) throw new Error(`ask "${prompt}": no citation points at a real line`)
    answers.push({ prompt, scope: 'my_calls', text: a.text, citations })
  }
  writeJson(out, answers)
}
```

`seed/gen/index.ts`:
```ts
import { claudeCliClient } from '../claude-cli'
import { MEETINGS } from '../meetings'
import { pool } from '../pool'
import { generateAsk } from './ask'
import { generateMeeting } from './meeting'

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const only = args.filter((a) => !a.startsWith('--'))
  const defs = MEETINGS.filter((d) => only.length === 0 || only.includes(d.slug))
  if (defs.length === 0) throw new Error(`no meeting matches: ${only.join(', ')}`)
  const client = claudeCliClient()
  let failed = 0
  await pool(defs, 2, async (d) => {
    try {
      await generateMeeting(client, d, { force })
    } catch (e) {
      failed++
      console.error(`${d.slug}: FAILED: ${e instanceof Error ? e.message : e}`)
    }
  })
  if (only.length === 0 && failed === 0) await generateAsk(client, MEETINGS, { force })
  if (failed) {
    console.error(`${failed} meeting(s) failed; re-run to resume (finished files are kept)`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run tests/gen-meeting.test.ts && npm run typecheck`
Expected: PASS (4 tests), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add lib/prompts.ts seed/io.ts seed/gen tests/gen-meeting.test.ts
git commit -m "feat(seed): prompts and resumable generation pipeline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Run generation and review the output

**Files:**
- Create: `seed/generated/**` (generated JSON)

This task is operational: it spends real model time (roughly 40 to 90 minutes in total) and the output is judged by reading it.

- [ ] **Step 1: Generate one short meeting first**

Run: `npm run seed:gen -- eng-standup`
Expected: log lines `eng-standup: brief`, `chapter 1/N`, ..., `highlights`; five files under `seed/generated/eng-standup/`. Confirm `.agent-logs/` gained no new files: `git status --short .agent-logs`.

- [ ] **Step 2: Read it**

Run:
```bash
node -e "const t=require('./seed/generated/eng-standup/transcript.json');console.log(t.lines.length,'lines',Math.round(t.duration_ms/60000),'min');t.lines.slice(0,12).forEach(l=>console.log(Math.round(l.start_ms/1000)+'s',l.speaker+':',l.text))"
```
Expected: natural, full-sentence dialogue (not terse fragments), names from the cast only, roughly 15 minutes. If it reads terse or odd (style leakage from global hooks), stop and fix `seed/claude-cli.ts` args before spending more time.

- [ ] **Step 3: Generate everything**

Run (background, it is long): `npm run seed:gen`
Expected: all eight meetings, then `ask: "Next steps on projects?"` and the other two prompts. If any meeting fails, re-run the same command: finished files are kept.

- [ ] **Step 4: Review the showcase**

Run:
```bash
node -e "const t=require('./seed/generated/q4-planning/transcript.json');const c={};t.lines.forEach(l=>c[l.speaker]=(c[l.speaker]||0)+(l.end_ms-l.start_ms));console.log(t.lines.length,'lines',Math.round(t.duration_ms/60000),'min',t.chapters.length,'chapters');console.log(Object.entries(c).map(([k,v])=>k+': '+Math.round(v/1000)+'s').join('\n'));console.log(t.lines.slice(200,210).map(l=>l.speaker+': '+l.text).join('\n'))"
```
Expected: about 60 to 64 minutes, 6 to 8 chapters, all eight speakers with real talk time. Read the summaries and highlights of two other meetings. Then check for unwanted real-world names:
```bash
grep -ril "fathom\|salesforce\|hubspot\|samsara\|gong" seed/generated || echo "clean"
```
Expected: `clean`. If a file matches, delete that one JSON file and re-run `npm run seed:gen` to regenerate it.

- [ ] **Step 5: Commit the generated data**

```bash
git add seed/generated
git commit -m "data(seed): generated synthetic meetings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(The checker in Task 12 may still flag issues; if so, fix them in a follow-up commit.)

---

### Task 12: Seed checker

**Files:**
- Create: `seed/check.ts`, `tests/seed-check.test.ts`

**Interfaces:**
- Consumes: schemas (Task 5), `MEETINGS`, `castOf`, `validateDefs` (Task 9), `ASK_PROMPTS` (Task 10), `GEN_DIR`/`fileOf`/`readJson`/`exists` (Task 10).
- Produces: `type MeetingFiles = Record<'brief' | 'transcript' | 'summaries' | 'actions' | 'highlights', unknown>`, `checkMeeting(def, files): string[]`, `checkAsk(ask: unknown, lineCounts: Map<string, number>): string[]`, `runAll(dir?): { errors: string[]; info: string[] }`; CLI `npm run seed:check` exits 1 on any error.

- [ ] **Step 1: Write the failing tests**

`tests/seed-check.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { checkAsk, checkMeeting, type MeetingFiles } from '@/seed/check'
import type { MeetingDef } from '@/seed/meetings'
import { stampTimestamps } from '@/seed/stamp'

const def: MeetingDef = {
  slug: 't', title: 'T', kind: 'standup', platform: 'zoom', daysAgo: 1, hourUtc: 9,
  host: 'priya', internal: ['priya', 'mei'], externals: [], targetMin: 1, topic: 'x',
}
const names = ['Priya Raman', 'Mei Tanaka']
const sentence = 'we should review the numbers and then decide what to ship this week'

function fixture(text = sentence, speakerOf = (i: number) => names[i % 2]): MeetingFiles {
  const raw = Array.from({ length: 12 }, (_, i) => ({ speaker: speakerOf(i), text }))
  const lines = stampTimestamps(raw, { targetMs: 60_000, seed: 1 })
  const content = { sections: [{ heading: 'Overview', bullets: ['They met.'] }] }
  return {
    brief: { agenda: ['a'], chapters: [1, 2, 3].map((i) => ({ title: `C${i}`, beats: ['b'], minutes: 1 })) },
    transcript: {
      lines,
      chapters: [{ title: 'A', start_idx: 0 }, { title: 'B', start_idx: 4 }, { title: 'C', start_idx: 8 }],
      duration_ms: lines.at(-1)!.end_ms,
    },
    summaries: { general: content, sales: content, standup: content, project_review: content },
    actions: [{ owner: names[0], task: 'Ship it', due: '2026-10-09', segment_idx: 3, start_ms: lines[3].start_ms }],
    highlights: [0, 4, 8].map((i, k) => ({
      segment_idx: i, type: (['insight', 'objection', 'action_item'] as const)[k], title: 'A moment',
      start_ms: lines[i].start_ms, end_ms: lines[i].end_ms,
    })),
  }
}
const mut = (f: MeetingFiles, fn: (f: any) => void): MeetingFiles => {
  const c = structuredClone(f) as any
  fn(c)
  return c
}

describe('checkMeeting', () => {
  it('passes a valid fixture', () => expect(checkMeeting(def, fixture())).toEqual([]))
  it('flags a speaker outside the cast', () => {
    const bad = mut(fixture(), (f) => { f.transcript.lines[2].speaker = 'Eve' })
    expect(checkMeeting(def, bad).join('\n')).toContain('unknown speaker')
  })
  it('flags non-monotonic timestamps', () => {
    const bad = mut(fixture(), (f) => { f.transcript.lines[5].start_ms = 0 })
    expect(checkMeeting(def, bad).join('\n')).toContain('not monotonic')
  })
  it('flags an unresolved relative due date', () => {
    const bad = mut(fixture(), (f) => { f.actions[0].due = 'Friday' })
    expect(checkMeeting(def, bad).join('\n')).toContain('actions.json invalid')
  })
  it('flags an action item anchor that does not match its line', () => {
    const bad = mut(fixture(), (f) => { f.actions[0].start_ms = 1 })
    expect(checkMeeting(def, bad).join('\n')).toContain('start_ms')
  })
  it('flags a highlight window longer than 5 minutes', () => {
    const bad = mut(fixture(), (f) => { f.highlights[0].end_ms = f.highlights[0].start_ms + 400_000 })
    expect(checkMeeting(def, bad).join('\n')).toContain('highlight window')
  })
  it('flags terse, caveman-style dialogue', () => {
    expect(checkMeeting(def, fixture('ok sure')).join('\n')).toContain('average words per line')
  })
  it('flags a showcase speaker with no meaningful talk time', () => {
    const show = { ...def, showcase: true }
    const bad = fixture(sentence, () => names[0])
    expect(checkMeeting(show, bad).join('\n')).toContain('talk share')
  })
  it('flags a duration far from the target', () => {
    const bad = mut(fixture(), (f) => { f.transcript.duration_ms = 600_000; f.transcript.lines.at(-1).end_ms = 600_000 })
    expect(checkMeeting(def, bad).join('\n')).toContain('duration')
  })
})

describe('checkAsk', () => {
  const counts = new Map([['t', 12]])
  const answer = (prompt: string) => ({
    prompt, scope: 'my_calls', text: 'x', citations: [{ meeting_slug: 't', segment_idx: 3, label: 'l' }],
  })
  const all = ['Next steps on projects?', 'Summarize my recent meetings', 'Surprise me with an insight'].map(answer)
  it('passes when every prompt is answered and citations resolve', () => expect(checkAsk(all, counts)).toEqual([]))
  it('flags citations that point past the transcript', () => {
    const bad = structuredClone(all)
    bad[0].citations[0].segment_idx = 99
    expect(checkAsk(bad, counts).join('\n')).toContain('citation')
  })
  it('flags a missing suggested prompt', () => {
    expect(checkAsk(all.slice(1), counts).join('\n')).toContain('Next steps on projects?')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/seed-check.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `seed/check.ts`**

```ts
import { pathToFileURL } from 'node:url'
import { ASK_PROMPTS } from '@/lib/prompts'
import {
  actionsFileSchema, askFileSchema, briefSchema, highlightsFileSchema, MAX_CLIP_MS,
  summariesFileSchema, transcriptFileSchema,
} from '@/lib/schema'
import { exists, fileOf, GEN_DIR, readJson } from './io'
import { castOf, MEETINGS, validateDefs, type MeetingDef } from './meetings'

export type MeetingFiles = Record<'brief' | 'transcript' | 'summaries' | 'actions' | 'highlights', unknown>
const FILE_NAMES = ['brief', 'transcript', 'summaries', 'actions', 'highlights'] as const

export function checkMeeting(def: MeetingDef, files: MeetingFiles): string[] {
  const errs: string[] = []
  const fail = (m: string) => errs.push(`${def.slug}: ${m}`)
  const results = {
    brief: briefSchema.safeParse(files.brief),
    transcript: transcriptFileSchema.safeParse(files.transcript),
    summaries: summariesFileSchema.safeParse(files.summaries),
    actions: actionsFileSchema.safeParse(files.actions),
    highlights: highlightsFileSchema.safeParse(files.highlights),
  }
  for (const [name, r] of Object.entries(results)) {
    if (!r.success) {
      const issue = r.error.issues[0]
      fail(`${name}.json invalid: ${issue?.message} at ${issue?.path.join('.')}`)
    }
  }
  if (!results.transcript.success) return errs

  const t = results.transcript.data
  const cast = castOf(def).map((c) => c.name)
  const lines = t.lines

  lines.forEach((l, i) => {
    if (l.idx !== i) fail(`line ${i} has idx ${l.idx}`)
    if (!cast.includes(l.speaker)) fail(`line ${i}: unknown speaker "${l.speaker}"`)
    if (l.end_ms <= l.start_ms) fail(`line ${i}: end_ms must be after start_ms`)
    if (i > 0 && l.start_ms < lines[i - 1].start_ms) fail(`line ${i}: timestamps not monotonic`)
  })
  if (t.duration_ms !== lines.at(-1)!.end_ms) fail('duration_ms does not equal the last line end_ms')
  const target = def.targetMin * 60_000
  const tol = def.showcase ? 0.05 : 0.15
  if (Math.abs(t.duration_ms - target) / target > tol) {
    fail(`duration ${Math.round(t.duration_ms / 60000)} min is outside ${tol * 100}% of ${def.targetMin} min`)
  }
  t.chapters.forEach((c, i) => {
    if (c.start_idx >= lines.length) fail(`chapter "${c.title}" starts past the end`)
    if (i > 0 && c.start_idx <= t.chapters[i - 1].start_idx) fail(`chapter "${c.title}" is out of order`)
  })
  if (t.chapters[0].start_idx !== 0) fail('first chapter must start at line 0')

  const words = lines.reduce((n, l) => n + l.text.trim().split(/\s+/).length, 0)
  if (words / lines.length < 7) fail(`average words per line is ${(words / lines.length).toFixed(1)} (<7): dialogue looks terse`)

  if (def.showcase) {
    const talk = new Map<string, number>()
    for (const l of lines) talk.set(l.speaker, (talk.get(l.speaker) ?? 0) + (l.end_ms - l.start_ms))
    const total = [...talk.values()].reduce((a, b) => a + b, 0)
    for (const name of cast) {
      const share = (talk.get(name) ?? 0) / total
      if (share < 0.02) fail(`${name} talk share is ${(share * 100).toFixed(1)}% (<2%)`)
    }
  }

  if (results.actions.success) {
    for (const a of results.actions.data) {
      if (a.segment_idx >= lines.length) fail(`action "${a.task}": segment_idx out of range`)
      else if (lines[a.segment_idx].start_ms !== a.start_ms) fail(`action "${a.task}": start_ms does not match its line`)
      if (!cast.includes(a.owner)) fail(`action "${a.task}": owner "${a.owner}" is not in the cast`)
    }
  }
  if (results.highlights.success) {
    const hs = results.highlights.data
    if (hs.length < 3 || hs.length > 6) fail(`expected 3 to 6 highlights, found ${hs.length}`)
    for (const h of hs) {
      if (h.segment_idx >= lines.length) fail(`highlight "${h.title}": segment_idx out of range`)
      if (h.end_ms <= h.start_ms || h.end_ms - h.start_ms > MAX_CLIP_MS) {
        fail(`highlight window for "${h.title}" must be positive and at most 5 minutes`)
      }
    }
  }
  return errs
}

export function checkAsk(ask: unknown, lineCounts: Map<string, number>): string[] {
  const parsed = askFileSchema.safeParse(ask)
  if (!parsed.success) return [`ask.json invalid: ${parsed.error.issues[0]?.message}`]
  const errs: string[] = []
  for (const p of ASK_PROMPTS) {
    if (!parsed.data.some((a) => a.prompt === p)) errs.push(`ask.json: missing answer for "${p}"`)
  }
  for (const a of parsed.data) {
    for (const c of a.citations) {
      const n = lineCounts.get(c.meeting_slug)
      if (n === undefined || c.segment_idx >= n) {
        errs.push(`ask "${a.prompt}": citation ${c.meeting_slug}#${c.segment_idx} does not resolve`)
      }
    }
  }
  return errs
}

export function runAll(dir: string = GEN_DIR): { errors: string[]; info: string[] } {
  const errors = [...validateDefs()]
  const info: string[] = []
  const counts = new Map<string, number>()
  for (const d of MEETINGS) {
    const missing = FILE_NAMES.filter((n) => !exists(fileOf(d.slug, n, dir)))
    if (missing.length) {
      errors.push(`${d.slug}: missing ${missing.join(', ')}`)
      continue
    }
    const files = Object.fromEntries(FILE_NAMES.map((n) => [n, readJson(fileOf(d.slug, n, dir))])) as MeetingFiles
    errors.push(...checkMeeting(d, files))
    const t = transcriptFileSchema.safeParse(files.transcript)
    if (t.success) {
      counts.set(d.slug, t.data.lines.length)
      info.push(`${d.slug}: ${t.data.lines.length} lines, ${Math.round(t.data.duration_ms / 60000)} min, ${(files.highlights as unknown[]).length} highlights`)
    }
  }
  const askPath = `${dir}/ask.json`
  if (!exists(askPath)) errors.push('ask.json is missing')
  else errors.push(...checkAsk(readJson(askPath), counts))
  return { errors, info }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, info } = runAll()
  info.forEach((l) => console.log(l))
  if (errors.length) {
    errors.forEach((e) => console.error(`ERROR ${e}`))
    console.error(`\n${errors.length} problem(s)`)
    process.exit(1)
  }
  console.log('\nseed:check passed')
}
```

- [ ] **Step 4: Run to verify pass, then check the real data**

Run: `npx vitest run tests/seed-check.test.ts && npm run typecheck && npm run seed:check`
Expected: tests PASS; `seed:check` prints one info line per meeting and `seed:check passed`. If the real data fails a check, fix by deleting the offending JSON file and re-running `npm run seed:gen` (or `npm run seed:gen -- <slug> --force`); do not loosen a check to make bad data pass.

- [ ] **Step 5: Commit**

```bash
git add seed/check.ts tests/seed-check.test.ts seed/generated
git commit -m "feat(seed): checker for generated data" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Seed loader

**Files:**
- Create: `seed/load.ts`

**Interfaces:**
- Consumes: `runAll` (Task 12), `deriveParticipantStats`, `unionSeconds` (Task 6), `seedId` (Task 4), file shapes (Task 5), `TEAM`, `MEETINGS`, `castOf`, `startedAt` (Task 9), schema (Task 2).
- Produces: `npm run seed:load`: idempotent upsert of the whole dataset with the service role.

- [ ] **Step 1: Write the loader**

```ts
import { createClient } from '@supabase/supabase-js'
import { deriveParticipantStats, unionSeconds } from '@/lib/stats'
import type { SummaryContent, TranscriptFile } from '@/lib/schema'
import { runAll } from './check'
import { fileOf, readJson } from './io'
import { castOf, MEETINGS, startedAt } from './meetings'
import { TEAM } from './team'
import { seedId } from './uuid'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !key) throw new Error('set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function upsert(table: string, rows: object[], batch = 500) {
  for (let i = 0; i < rows.length; i += batch) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + batch), { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}
async function clearSeeded(table: string, meetingId: string, seededOnly = false) {
  let q = db.from(table).delete().eq('meeting_id', meetingId)
  if (seededOnly) q = q.is('user_id', null)
  const { error } = await q
  if (error) throw new Error(`clear ${table}: ${error.message}`)
}

const EVENTS = [
  { title: 'Weekly Product Sync // Kestrel', platform: 'zoom', day_offset: 1, time_of_day: '10:00' },
  { title: 'Discovery Call // Brightline Couriers', platform: 'meet', day_offset: 1, time_of_day: '15:30' },
  { title: 'Engineering Standup', platform: 'zoom', day_offset: 2, time_of_day: '09:30' },
  { title: 'Customer Interview // Northgate Transport', platform: 'zoom', day_offset: 3, time_of_day: '17:00' },
  { title: 'Q4 Planning Checkpoint', platform: 'teams', day_offset: 5, time_of_day: '14:00' },
]

async function main() {
  const { errors } = runAll()
  if (errors.length) {
    errors.forEach((e) => console.error(`ERROR ${e}`))
    throw new Error('seed:check failed; fix the data before loading')
  }

  await upsert('team_members', TEAM.map((m) => ({
    id: seedId('member', m.slug), name: m.name, role: m.role, is_demo_user: !!m.demo,
  })))

  const lineCounts = new Map<string, TranscriptFile['lines']>()
  for (const def of MEETINGS) {
    const t = readJson<TranscriptFile>(fileOf(def.slug, 'transcript'))
    const summaries = readJson<Record<string, SummaryContent>>(fileOf(def.slug, 'summaries'))
    const actions = readJson<{ owner: string; task: string; due: string | null; start_ms: number }[]>(fileOf(def.slug, 'actions'))
    const highlights = readJson<{ type: string; title: string; start_ms: number; end_ms: number }[]>(fileOf(def.slug, 'highlights'))
    lineCounts.set(def.slug, t.lines)

    const meetingId = seedId('meeting', def.slug)
    const cast = castOf(def)
    const pid = (name: string) => seedId('participant', `${def.slug}:${name}`)
    const stats = deriveParticipantStats(
      t.lines.map((l) => ({ participant_id: pid(l.speaker), start_ms: l.start_ms, end_ms: l.end_ms, text: l.text })),
    )

    await clearSeeded('chapters', meetingId)
    await clearSeeded('action_items', meetingId)
    await clearSeeded('segments', meetingId)
    await clearSeeded('summaries', meetingId, true)
    await clearSeeded('highlights', meetingId, true)

    await upsert('meetings', [{
      id: meetingId, slug: def.slug, title: def.title, kind: def.kind, platform: def.platform,
      started_at: startedAt(def).toISOString(), duration_sec: Math.round(t.duration_ms / 1000),
      highlight_sec: unionSeconds(highlights), host_id: seedId('member', def.host),
    }])
    await upsert('participants', cast.map((c) => ({
      id: pid(c.name), meeting_id: meetingId, member_id: c.member ? seedId('member', c.member) : null,
      name: c.name, role: c.role, is_internal: c.is_internal,
      talk_time_sec: stats.get(pid(c.name))?.talk_time_sec ?? 0,
      questions: stats.get(pid(c.name))?.questions ?? 0,
      longest_monologue_sec: stats.get(pid(c.name))?.longest_monologue_sec ?? 0,
    })))
    await upsert('segments', t.lines.map((l) => ({
      id: seedId('segment', `${def.slug}:${l.idx}`), meeting_id: meetingId, participant_id: pid(l.speaker),
      idx: l.idx, start_ms: l.start_ms, end_ms: l.end_ms, text: l.text,
    })))
    await upsert('chapters', t.chapters.map((c) => ({
      id: seedId('chapter', `${def.slug}:${c.start_idx}`), meeting_id: meetingId,
      start_ms: t.lines[c.start_idx].start_ms, title: c.title,
    })))
    await upsert('summaries', Object.entries(summaries).map(([template, content]) => ({
      id: seedId('summary', `${def.slug}:${template}`), meeting_id: meetingId, template, content,
      user_id: null, source: 'seed', model: process.env.SEED_MODEL ?? 'sonnet',
    })))
    await upsert('action_items', actions.map((a, i) => ({
      id: seedId('action', `${def.slug}:${i}`), meeting_id: meetingId, owner: a.owner, task: a.task,
      due: a.due, start_ms: a.start_ms,
    })))
    await upsert('highlights', highlights.map((h, i) => ({
      id: seedId('highlight', `${def.slug}:${i}`), meeting_id: meetingId, user_id: null,
      type: h.type, title: h.title, start_ms: h.start_ms, end_ms: h.end_ms,
    })))
    console.log(`loaded ${def.slug}: ${t.lines.length} segments`)
  }

  const ask = readJson<{ prompt: string; scope: string; text: string; citations: { meeting_slug: string; segment_idx: number; label: string }[] }[]>(
    `${process.cwd()}/seed/generated/ask.json`,
  )
  await upsert('ask_answers', ask.map((a) => ({
    id: seedId('ask', a.prompt), prompt: a.prompt, scope: a.scope,
    answer: {
      text: a.text,
      citations: a.citations.map((c) => ({
        meeting_slug: c.meeting_slug, label: c.label, segment_idx: c.segment_idx,
        start_ms: lineCounts.get(c.meeting_slug)![c.segment_idx].start_ms,
      })),
    },
  })))
  await upsert('calendar_events', EVENTS.map((e) => ({ id: seedId('event', e.title), ...e })))

  for (const table of ['team_members', 'meetings', 'participants', 'segments', 'chapters', 'summaries', 'action_items', 'highlights', 'ask_answers', 'calendar_events']) {
    const { count } = await db.from(table).select('*', { count: 'exact', head: true })
    console.log(`${table}: ${count}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Load**

Run: `npm run seed:load`
Expected: eight `loaded <slug>` lines then counts: `team_members: 8`, `meetings: 8`, `segments` equal to the sum of the printed segment counts, `summaries: 32`, `ask_answers: 3`, `calendar_events: 5`, `chapters` and `action_items` and `highlights` greater than 0.

- [ ] **Step 3: Verify idempotence**

Run: `npm run seed:load` again.
Expected: identical counts (no duplicates).

- [ ] **Step 4: Re-run the RLS script against real data**

Run: `npm run rls:test`
Expected: all PASS. Then confirm anon can search the real data:
```bash
node --env-file=.env.local -e "const {createClient}=require('@supabase/supabase-js');const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);c.rpc('search_segments',{q:'rollback'}).then(r=>console.log(r.error||r.data.slice(0,3)))"
```
Expected: rows (or an empty array if no transcript mentions the word; then try `deadline` or `budget`). No error either way.

- [ ] **Step 5: Commit**

```bash
git add seed/load.ts
git commit -m "feat(seed): idempotent loader" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
## Phase 3: Design system (gated)

### Task 14: Design system

**Gate:** do not start this task until the user says to begin the design phase. Everything before this task is backend and data and needs no UI.

**Files:**
- Create: `components/ui/Button.tsx`, `components/ui/Chip.tsx`, `components/ui/Card.tsx`, `app/design/page.tsx`, `docs/design/design-system.md`, `tests/contrast.test.ts`
- Modify: `app/globals.css` (token values and motion), `.gitignore` (already ignores `docs/design/refs/`)

**Interfaces:**
- Produces: the token names fixed in Task 1 (this task changes values and may add `--font-display`, `--ease-out`, `--dur-fast`, `--dur-base`); `Button({ variant?: 'primary'|'secondary'|'ghost', size?: 'sm'|'md', ...buttonProps })`, `Chip({ color?: string, children, className? })`, `Card(divProps)`; utility classes `animate-fade-up` and `animate-shimmer`. Later tasks use only these primitives and token utilities. Their props do not change in this task; only class strings and token values do.

- [ ] **Step 1: Ask the user to start the design phase**

Use AskUserQuestion: "Start the design phase now? It will screenshot the fathom.video marketing site for inspiration (public pages only, saved locally and gitignored), run /tastemaker, and set tokens and motion." Wait for a yes.

- [ ] **Step 2: Write the contrast guard test (passes on the defaults, protects the redesign)**

`tests/contrast.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('app/globals.css', 'utf8')
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --color-${name} not found as a 6-digit hex`)
  return m[1]
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('palette meets WCAG AA (4.5:1 for text)', () => {
  const pairs: [string, string][] = [
    ['fg', 'bg'], ['fg', 'surface'], ['muted', 'bg'], ['muted', 'surface'],
    ['accent-fg', 'accent'], ['danger', 'bg'],
  ]
  for (const [fg, bg] of pairs) {
    it(`${fg} on ${bg}`, () => expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5))
  }
  for (const t of ['action', 'insight', 'positive', 'feedback', 'objection', 'tech']) {
    it(`highlight color ${t} is distinguishable on bg (3:1)`, () =>
      expect(ratio(token(`hl-${t}`), token('bg'))).toBeGreaterThanOrEqual(3))
  }
})
```
Run: `npx vitest run tests/contrast.test.ts`. Expected: PASS on the Task 1 defaults. If any default fails, fix the token (the test is right).

- [ ] **Step 3: Write the primitives (baseline styling with token utilities)**

`components/ui/Button.tsx`:
```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110',
  secondary: 'border border-border bg-surface-2 text-fg hover:bg-surface',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
}
const SIZE: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm' }

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = 'secondary', size = 'md', className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    />
  )
})
```

`components/ui/Chip.tsx`:
```tsx
export function Chip({ color, children, className = '' }: { color?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-fg ${className}`}>
      {color && <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  )
}
```

`components/ui/Card.tsx`:
```tsx
export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-card border border-border bg-surface ${className}`} {...props} />
}
```

- [ ] **Step 4: Write the style guide page**

`app/design/page.tsx`:
```tsx
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { HIGHLIGHT_TYPES, HIGHLIGHT_META, hlColor } from '@/lib/schema'

const TOKENS = ['bg', 'surface', 'surface-2', 'fg', 'muted', 'border', 'accent', 'danger']

export default function DesignPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      <h1 className="text-3xl font-semibold">Design system</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Color tokens</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOKENS.map((t) => (
            <div key={t} className="space-y-1">
              <div className="h-12 rounded-lg border border-border" style={{ background: `var(--color-${t})` }} />
              <p className="text-xs text-muted">{t}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Highlight types</h2>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHT_TYPES.map((t) => (
            <Chip key={t} color={hlColor(t)}>{HIGHLIGHT_META[t].label}</Chip>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-muted">Card and motion</h2>
        <Card className="animate-fade-up p-5">
          <p className="font-medium">Q4 Product Planning</p>
          <p className="text-sm text-muted">Zoom · Priya Raman · Oct 3</p>
        </Card>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Add the motion utilities (needed by the page above)**

Append to `app/globals.css`:
```css
@theme static {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms;
  --dur-base: 240ms;
}
@keyframes fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
.animate-fade-up { animation: fade-up var(--dur-base) var(--ease-out) both; }
.animate-shimmer {
  background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-surface-2) 50%, var(--color-surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
```

- [ ] **Step 6: Collect inspiration (public marketing pages only)**

Use the Playwright MCP tools. For each of `https://fathom.video`, `https://fathom.video/pricing`, and one feature page linked from the home page: `browser_navigate`, then `browser_take_screenshot` with `fullPage: true` and `filename: docs/design/refs/<name>.png`, at widths 1440 and 390 (`browser_resize`). These stay local (gitignored). Do not screenshot the signed-in dashboard.

- [ ] **Step 7: Run `/tastemaker` on the references and write the brief**

Invoke the `tastemaker` skill on the saved screenshots. Write `docs/design/design-system.md` with: the chosen point of view in two sentences, the type scale (sizes and weights), the spacing scale, the color token values with their roles, radii, shadows, and motion principles (durations, easing, where motion is used and where it must not be). Keep it under one page.

- [ ] **Step 8: Apply the system**

Update the token values in `app/globals.css` (names unchanged), add a display font if the brief calls for one (load via `next/font/google` in `app/layout.tsx`, expose as `--font-sans`/`--font-display`), and adjust the class strings in `components/ui/*.tsx` to match. Keep every prop API unchanged.

- [ ] **Step 9: Verify visually and with the contrast test**

Run: `npx vitest run tests/contrast.test.ts && npm run typecheck`
Then `npm run dev`, open `/design` with Playwright at 1280 and 390 widths and take screenshots. Run `/tastemaker` on those screenshots; make at most two refinement passes, then stop. Confirm `prefers-reduced-motion` disables the animations (emulate with `browser_emulate_media`).

- [ ] **Step 10: Commit**

```bash
git add components/ui app/design app/globals.css app/layout.tsx docs/design/design-system.md tests/contrast.test.ts
git commit -m "feat(design): tokens, motion, primitives and style guide" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Phase 4: Application

### Task 15: Supabase clients, middleware, Google sign-in

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/anon.ts`, `lib/supabase/admin.ts`, `lib/safe-next.ts`, `lib/auth.ts`, `middleware.ts`, `app/auth/callback/route.ts`, `components/AuthButton.tsx`, `tests/safe-next.test.ts`

**Interfaces:**
- Produces: `createClient()` (browser, `lib/supabase/client.ts`) and `signInWithGoogle(next: string): Promise<void>`; `createClient(): Promise<SupabaseClient>` (server, cookie-aware, `lib/supabase/server.ts`); `createAnonClient(): SupabaseClient` (no cookies, for public pages and OG images); `createAdminClient(): SupabaseClient` (service role, server only); `safeNext(next, fallback = '/meetings'): string`; `type AppUser = { id: string; email: string | null; avatar: string | null }` and `getUser(db): Promise<AppUser | null>`; `<AuthButton user={AppUser | null} />`.

- [ ] **Step 1: Write the failing test**

`tests/safe-next.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/safe-next'

describe('safeNext (open-redirect guard)', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(safeNext('/meetings/q4-planning?t=5000')).toBe('/meetings/q4-planning?t=5000')
    expect(safeNext('/team#x')).toBe('/team#x')
  })
  it('falls back for null, empty and non-paths', () => {
    expect(safeNext(null)).toBe('/meetings')
    expect(safeNext('')).toBe('/meetings')
    expect(safeNext('meetings')).toBe('/meetings')
  })
  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/meetings')
    expect(safeNext('//evil.com')).toBe('/meetings')
    expect(safeNext('/\\evil.com')).toBe('/meetings')
    expect(safeNext('/\t/evil.com')).toBe('/meetings')
    expect(safeNext('javascript:alert(1)')).toBe('/meetings')
  })
  it('uses a custom fallback', () => expect(safeNext('//x', '/team')).toBe('/team'))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/safe-next.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/safe-next.ts`**

```ts
// Only same-site paths survive. Parsing against a dummy origin also catches tab/newline tricks
// that browsers strip ("/\t/evil.com" parses as "//evil.com").
export function safeNext(next: string | null | undefined, fallback = '/meetings'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  try {
    const u = new URL(next, 'http://localhost')
    if (u.origin !== 'http://localhost') return fallback
    return u.pathname + u.search + u.hash
  } catch {
    return fallback
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/safe-next.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the Supabase clients**

`lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function signInWithGoogle(next: string): Promise<void> {
  const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
}
```

`lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // called from a Server Component: the middleware refreshes the session instead
        }
      },
    },
  })
}
```

`lib/supabase/anon.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

// No cookies: for public data (clip pages, OG images) that must not depend on a session.
export const createAnonClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
```

`lib/supabase/admin.ts`:
```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export const createAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
```
Run `npm install server-only` (tiny Next-recommended guard that fails the build if a client component imports this file) and add it to the allowed dependency list.

`lib/auth.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type AppUser = { id: string; email: string | null; avatar: string | null }

export async function getUser(db: SupabaseClient): Promise<AppUser | null> {
  const { data } = await db.auth.getUser()
  const u = data.user
  if (!u) return null
  return { id: u.id, email: u.email ?? null, avatar: (u.user_metadata?.avatar_url as string | undefined) ?? null }
}
```

- [ ] **Step 6: Middleware, callback route, AuthButton**

`middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  await supabase.auth.getUser() // refreshes the session cookie when needed
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

`app/auth/callback/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-next'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/meetings?auth_error=1`)
}
```

`components/AuthButton.tsx`:
```tsx
'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Button } from '@/components/ui/Button'
import type { AppUser } from '@/lib/auth'
import { createClient, signInWithGoogle } from '@/lib/supabase/client'

function Inner({ user }: { user: AppUser | null }) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const router = useRouter()
  if (!user) {
    return (
      <Button size="sm" variant="primary" onClick={() => signInWithGoogle(pathname + (search ? `?${search}` : ''))}>
        Sign in with Google
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      {user.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs">{(user.email ?? '?')[0].toUpperCase()}</span>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await createClient().auth.signOut()
          router.refresh()
        }}
      >
        Sign out
      </Button>
    </div>
  )
}

export function AuthButton({ user }: { user: AppUser | null }) {
  return (
    <Suspense fallback={null}>
      <Inner user={user} />
    </Suspense>
  )
}
```

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npx vitest run tests/safe-next.test.ts`
Expected: clean, PASS.

- [ ] **Step 8: USER STEP: configure Google OAuth, then verify sign-in**

Ask the user to do this (it needs their Google account); do not attempt it yourself:
1. Google Cloud Console, APIs and Services, Credentials, Create OAuth client ID (Web application). Authorized redirect URI: `https://<REF>.supabase.co/auth/v1/callback`.
2. Supabase dashboard, Authentication, Sign In / Providers, Google: enable it and paste the client ID and secret.
3. Authentication, URL Configuration: Site URL `http://localhost:3000`; add redirect URL `http://localhost:3000/**`.
4. Leave the Email provider enabled for now: `npm run rls:test` signs its test users in with a password. Task 29 disables it at the end.

Then, once Task 17 gives the header a sign-in button, verify: `npm run dev`, click Sign in with Google, return to the app signed in, header shows the avatar, Sign out works. If the user has not configured OAuth yet, continue with later tasks (everything signed-out works) and verify before Task 23.

- [ ] **Step 9: Commit**

```bash
git add lib/supabase lib/safe-next.ts lib/auth.ts middleware.ts app/auth components/AuthButton.tsx tests/safe-next.test.ts package.json package-lock.json
git commit -m "feat(auth): Supabase clients, middleware, Google sign-in, safe redirect" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Data layer

**Files:**
- Create: `lib/types.ts`, `lib/queries.ts`, `lib/group.ts`, `tests/queries.test.ts`, `tests/group.test.ts`

**Interfaces:**
- Consumes: `Template`, `SummaryContent`, `HighlightType` (Task 5).
- Produces (all in `lib/queries.ts` unless noted; `db` is a `SupabaseClient`):
  - `selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size?: number): Promise<T[]>`
  - `pickSummaries(rows: SummaryRow[], userId: string | null): Partial<Record<Template, { content: SummaryContent; source: 'seed' | 'live' }>>`
  - `getDemoPersona(db): Promise<{ id: string; name: string } | null>`
  - `listMeetings(db, opts?: { hostId?: string }): Promise<MeetingListItem[]>`
  - `getMeetingBundle(db, slug: string, userId: string | null): Promise<MeetingBundle | null>`
  - `listUpcoming(db): Promise<UpcomingEvent[]>`, `getTeamStats(db): Promise<TeamStatRow[]>`, `listAskAnswers(db): Promise<AskAnswerRow[]>`, `searchSegments(db, q, scope?: { hostId?: string; meetingId?: string }, max?: number): Promise<SearchHit[]>`
  - `lib/group.ts`: `groupByMonth<T extends { started_at: string }>(items: T[]): { label: string; items: T[] }[]` (newest month first, newest item first).
  - `lib/types.ts`: `MeetingRow`, `MeetingListItem`, `ParticipantRow`, `SegmentRow`, `ChapterRow`, `ActionItemRow`, `HighlightRow`, `SummaryRow`, `MeetingBundle`, `UpcomingEvent`, `TeamStatRow`, `AskAnswerRow`, `SearchHit`.

- [ ] **Step 1: Write the types**

`lib/types.ts`:
```ts
import type { HighlightType, SummaryContent, Template } from './schema'

export type Platform = 'zoom' | 'meet' | 'teams'

export type MeetingRow = {
  id: string; slug: string; title: string; kind: string; platform: Platform
  started_at: string; duration_sec: number; highlight_sec: number; host_id: string
}
export type MeetingListItem = MeetingRow & {
  host: { name: string; role: string } | null
  participants: { name: string; is_internal: boolean }[]
}
export type ParticipantRow = {
  id: string; name: string; role: string; is_internal: boolean
  talk_time_sec: number; questions: number; longest_monologue_sec: number
}
export type SegmentRow = { idx: number; participant_id: string; start_ms: number; end_ms: number; text: string }
export type ChapterRow = { start_ms: number; title: string }
export type ActionItemRow = { id: string; owner: string; task: string; due: string | null; start_ms: number }
export type HighlightRow = {
  id: string; user_id: string | null; type: HighlightType; title: string
  note: string | null; start_ms: number; end_ms: number
}
export type SummaryRow = { template: Template; content: SummaryContent; user_id: string | null; source: 'seed' | 'live' }

export type MeetingBundle = {
  meeting: MeetingRow & { host: { name: string; role: string } | null }
  participants: ParticipantRow[]
  segments: SegmentRow[]
  chapters: ChapterRow[]
  actionItems: ActionItemRow[]
  highlights: HighlightRow[]
  summaries: Partial<Record<Template, { content: SummaryContent; source: 'seed' | 'live' }>>
}

export type UpcomingEvent = { id: string; title: string; platform: Platform; starts_at: string }
export type TeamStatRow = {
  member_id: string; name: string; role: string; calls: number
  talk_sec: number; talk_pct: number; questions: number; longest_monologue_sec: number
}
export type AskCitation = { meeting_slug: string; segment_idx: number; start_ms: number; label: string }
export type AskAnswerRow = { id: string; prompt: string; scope: string; answer: { text: string; citations: AskCitation[] } }
export type SearchHit = {
  meeting_id: string; meeting_slug: string; meeting_title: string; segment_idx: number
  start_ms: number; speaker: string; snippet: string; rank: number
}
```

- [ ] **Step 2: Write the failing tests**

`tests/queries.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { pickSummaries, selectAll } from '@/lib/queries'
import type { SummaryRow } from '@/lib/types'

const content = (h: string) => ({ sections: [{ heading: h, bullets: ['b'] }] })
const row = (template: SummaryRow['template'], user_id: string | null, h: string): SummaryRow => ({
  template, content: content(h), user_id, source: user_id ? 'live' : 'seed',
})

describe('pickSummaries', () => {
  const rows = [row('general', null, 'seed-general'), row('general', 'u1', 'mine'), row('sales', null, 'seed-sales')]
  it('prefers the signed-in user own row over the seeded one', () => {
    const s = pickSummaries(rows, 'u1')
    expect(s.general?.content.sections[0].heading).toBe('mine')
    expect(s.general?.source).toBe('live')
    expect(s.sales?.source).toBe('seed')
  })
  it('uses only seeded rows for other users and signed-out visitors', () => {
    expect(pickSummaries(rows, 'u2').general?.source).toBe('seed')
    expect(pickSummaries(rows, null).general?.source).toBe('seed')
  })
  it('omits templates with no row', () => expect(pickSummaries(rows, null).standup).toBeUndefined())
})

describe('selectAll', () => {
  it('pages until a short page, so more than 1000 rows are never silently cut', async () => {
    const all = Array.from({ length: 7 }, (_, i) => i)
    const calls: [number, number][] = []
    const out = await selectAll<number>(async (from, to) => {
      calls.push([from, to])
      return { data: all.slice(from, to + 1), error: null }
    }, 3)
    expect(out).toEqual(all)
    expect(calls).toEqual([[0, 2], [3, 5], [6, 8]])
  })
  it('stops after an exact multiple when the next page is empty', async () => {
    const out = await selectAll<number>(async (from, to) => ({ data: [1, 2, 3, 4, 5, 6].slice(from, to + 1), error: null }), 3)
    expect(out).toHaveLength(6)
  })
  it('throws on a database error', async () => {
    await expect(selectAll(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom')
  })
})
```

`tests/group.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { groupByMonth } from '@/lib/group'

describe('groupByMonth', () => {
  it('groups newest month first and newest item first', () => {
    const items = [
      { id: 'a', started_at: '2026-09-20T10:00:00Z' },
      { id: 'b', started_at: '2026-10-03T10:00:00Z' },
      { id: 'c', started_at: '2026-10-01T10:00:00Z' },
    ]
    const g = groupByMonth(items)
    expect(g.map((x) => x.label)).toEqual(['October 2026', 'September 2026'])
    expect(g[0].items.map((i) => i.id)).toEqual(['b', 'c'])
  })
  it('returns [] for no items', () => expect(groupByMonth([])).toEqual([]))
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/queries.test.ts tests/group.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement**

`lib/group.ts`:
```ts
const fmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function groupByMonth<T extends { started_at: string }>(items: T[]): { label: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => b.started_at.localeCompare(a.started_at))
  const groups: { label: string; items: T[] }[] = []
  for (const item of sorted) {
    const label = fmt.format(new Date(item.started_at))
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}
```

`lib/queries.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { TEMPLATES, type Template } from './schema'
import type {
  AskAnswerRow, MeetingBundle, MeetingListItem, SearchHit, SummaryRow, TeamStatRow, UpcomingEvent,
} from './types'

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

// PostgREST caps responses at 1000 rows; the showcase transcript can exceed that.
export async function selectAll<T>(page: (from: number, to: number) => Page<T>, size = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < size) return out
  }
}

function unwrap<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export function pickSummaries(rows: SummaryRow[], userId: string | null): MeetingBundle['summaries'] {
  const out: MeetingBundle['summaries'] = {}
  for (const t of TEMPLATES as readonly Template[]) {
    const own = userId ? rows.find((r) => r.template === t && r.user_id === userId) : undefined
    const seed = rows.find((r) => r.template === t && r.user_id === null)
    const pick = own ?? seed
    if (pick) out[t] = { content: pick.content, source: pick.source }
  }
  return out
}

export async function getDemoPersona(db: SupabaseClient): Promise<{ id: string; name: string } | null> {
  const r = await db.from('team_members').select('id,name').eq('is_demo_user', true).maybeSingle()
  return unwrap(r)
}

export async function listMeetings(db: SupabaseClient, opts: { hostId?: string } = {}): Promise<MeetingListItem[]> {
  let q = db
    .from('meetings')
    .select('*, host:team_members(name, role), participants(name, is_internal)')
    .order('started_at', { ascending: false })
  if (opts.hostId) q = q.eq('host_id', opts.hostId)
  return unwrap(await q) as unknown as MeetingListItem[]
}

export async function getMeetingBundle(
  db: SupabaseClient,
  slug: string,
  userId: string | null,
): Promise<MeetingBundle | null> {
  const m = await db.from('meetings').select('*, host:team_members(name, role)').eq('slug', slug).maybeSingle()
  const meeting = unwrap(m) as MeetingBundle['meeting'] | null
  if (!meeting) return null
  const id = meeting.id
  const [participants, segments, chapters, actionItems, highlights, summaries] = await Promise.all([
    db.from('participants')
      .select('id,name,role,is_internal,talk_time_sec,questions,longest_monologue_sec')
      .eq('meeting_id', id).order('talk_time_sec', { ascending: false }),
    selectAll<MeetingBundle['segments'][number]>((from, to) =>
      db.from('segments').select('idx,participant_id,start_ms,end_ms,text')
        .eq('meeting_id', id).order('idx').range(from, to)),
    db.from('chapters').select('start_ms,title').eq('meeting_id', id).order('start_ms'),
    db.from('action_items').select('id,owner,task,due,start_ms').eq('meeting_id', id).order('start_ms'),
    db.from('highlights').select('id,user_id,type,title,note,start_ms,end_ms').eq('meeting_id', id).order('start_ms'),
    db.from('summaries').select('template,content,user_id,source').eq('meeting_id', id),
  ])
  return {
    meeting,
    participants: unwrap(participants) as MeetingBundle['participants'],
    segments,
    chapters: unwrap(chapters) as MeetingBundle['chapters'],
    actionItems: unwrap(actionItems) as MeetingBundle['actionItems'],
    highlights: unwrap(highlights) as MeetingBundle['highlights'],
    summaries: pickSummaries(unwrap(summaries) as SummaryRow[], userId),
  }
}

export async function listUpcoming(db: SupabaseClient): Promise<UpcomingEvent[]> {
  return unwrap(await db.from('calendar_upcoming').select('*').order('starts_at')) as UpcomingEvent[]
}

export async function getTeamStats(db: SupabaseClient): Promise<TeamStatRow[]> {
  return unwrap(await db.from('team_stats').select('*').order('calls', { ascending: false })) as TeamStatRow[]
}

export async function listAskAnswers(db: SupabaseClient): Promise<AskAnswerRow[]> {
  return unwrap(await db.from('ask_answers').select('*').order('prompt')) as AskAnswerRow[]
}

export async function searchSegments(
  db: SupabaseClient,
  q: string,
  scope: { hostId?: string; meetingId?: string } = {},
  max = 30,
): Promise<SearchHit[]> {
  const r = await db.rpc('search_segments', {
    q, scope_host: scope.hostId ?? null, scope_meeting: scope.meetingId ?? null, max_rows: max,
  })
  return unwrap(r) as SearchHit[]
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/queries.test.ts tests/group.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/queries.ts lib/group.ts tests/queries.test.ts tests/group.test.ts
git commit -m "feat: typed data layer with pagination and summary resolution" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 17: App shell: header, global search, tabs, toasts, 404

**Files:**
- Create: `lib/toast.ts`, `components/Header.tsx`, `components/SearchBar.tsx`, `components/NavTabs.tsx`, `components/Toaster.tsx`, `app/not-found.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `createClient`, `getUser`, `AuthButton` (Task 15), `Button` (Task 14).
- Produces: `toast(message: string): void` (browser only); `<Header />` (server component); the layout renders `<Header />`, `{children}`, `<Toaster />`.

- [ ] **Step 1: Implement**

`lib/toast.ts`:
```ts
export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('toast', { detail: message }))
}
```

`components/Toaster.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setMsg(null), 3500)
    }
    window.addEventListener('toast', on)
    return () => {
      window.removeEventListener('toast', on)
      clearTimeout(timer)
    }
  }, [])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {msg && <div className="animate-fade-up rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm shadow-lg">{msg}</div>}
    </div>
  )
}
```

`components/SearchBar.tsx`:
```tsx
export function SearchBar() {
  return (
    <form action="/search" role="search" className="w-full max-w-md">
      <input
        name="q"
        type="search"
        maxLength={200}
        placeholder="Search call recordings"
        aria-label="Search call recordings"
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
    </form>
  )
}
```

`components/NavTabs.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/meetings', label: 'My Calls' },
  { href: '/team', label: 'Team Calls' },
  { href: '/calendar', label: 'Calendar' },
]

export function NavTabs() {
  const path = usePathname()
  return (
    <nav aria-label="Primary" className="flex gap-1">
      {TABS.map((t) => {
        const active = path === t.href || path.startsWith(`${t.href}/`)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition ${active ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'}`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

`components/Header.tsx`:
```tsx
import Link from 'next/link'
import { AuthButton } from '@/components/AuthButton'
import { NavTabs } from '@/components/NavTabs'
import { SearchBar } from '@/components/SearchBar'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function Header() {
  const user = await getUser(await createClient())
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/meetings" className="text-lg font-semibold tracking-tight">Fathom Rebuild</Link>
        <SearchBar />
        <div className="ml-auto flex items-center gap-4">
          <NavTabs />
          <AuthButton user={user} />
        </div>
      </div>
    </header>
  )
}
```

`app/not-found.tsx`:
```tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-2 text-muted">The call or clip may have been removed, or the link is mistyped.</p>
      <Link href="/meetings" className="mt-6 inline-block text-accent underline">Back to My Calls</Link>
    </div>
  )
}
```

Modify `app/layout.tsx` body:
```tsx
import { Header } from '@/components/Header'
import { Toaster } from '@/components/Toaster'
// ...
<body className="min-h-screen bg-bg text-fg antialiased">
  <Header />
  <main>{children}</main>
  <Toaster />
</body>
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: clean. `npm run dev`, open `/meetings` (404 until Task 18) and confirm the header renders with search, tabs and the sign-in button; confirm an unknown path shows the friendly 404.

- [ ] **Step 3: Commit**

```bash
git add lib/toast.ts components app/layout.tsx app/not-found.tsx
git commit -m "feat: app shell with global search, tabs, toaster and 404" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 18: My Calls list

**Files:**
- Create: `lib/lanes.ts`, `components/MeetingCard.tsx`, `components/UpcomingEvents.tsx`, `app/meetings/page.tsx`
- Modify: `lib/format.ts` (add `initials`), `tests/format.test.ts`, `app/globals.css` (lane tokens)

**Interfaces:**
- Consumes: `listMeetings`, `getDemoPersona`, `listUpcoming` (Task 16), `groupByMonth`, `formatMinutes`, primitives.
- Produces: `initials(name: string): string`; `laneColor(i: number): string` (a `var(--color-lane-N)` reference, cycling through 8 tokens); `<MeetingCard m={MeetingListItem} />`; `<UpcomingEvents events={UpcomingEvent[]} />`.

- [ ] **Step 1: Write the failing test**

Append to `tests/format.test.ts`:
```ts
import { initials } from '@/lib/format'

describe('initials', () => {
  it('takes the first letters of the first and last word', () => {
    expect(initials('Priya Raman')).toBe('PR')
    expect(initials('Elena Voss')).toBe('EV')
    expect(initials('Cher')).toBe('C')
    expect(initials('  ')).toBe('?')
  })
})
```
(Add `initials` to the existing import line instead of a second import if you prefer.) Run: `npx vitest run tests/format.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement**

Append to `lib/format.ts`:
```ts
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}
```
Run the test again. Expected: PASS.

Append to `@theme static` in `app/globals.css`:
```css
  --color-lane-1: #3b9eff;
  --color-lane-2: #34d399;
  --color-lane-3: #fbbf24;
  --color-lane-4: #f87171;
  --color-lane-5: #a78bfa;
  --color-lane-6: #22d3ee;
  --color-lane-7: #fb923c;
  --color-lane-8: #f472b6;
```
(If Task 14 has already restyled the file, add these inside the existing `@theme static` block and give them values that fit the palette; the contrast test does not cover lanes.)

`lib/lanes.ts`:
```ts
export const laneColor = (i: number) => `var(--color-lane-${(i % 8) + 1})`
```

`components/MeetingCard.tsx`:
```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { formatMinutes, initials } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { MeetingListItem } from '@/lib/types'

const PLATFORM = { zoom: 'Zoom', meet: 'Google Meet', teams: 'Teams' } as const
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function MeetingCard({ m }: { m: MeetingListItem }) {
  const tiles = m.participants.slice(0, 4)
  return (
    <Link href={`/meetings/${m.slug}`} className="group block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <Card className="animate-fade-up overflow-hidden transition group-hover:border-accent">
        <div className="relative grid aspect-video grid-cols-2 gap-px bg-border">
          {tiles.map((p, i) => (
            <div
              key={p.name}
              className={`grid place-items-center bg-surface-2 text-xl font-semibold ${tiles.length === 1 ? 'col-span-2' : ''}`}
              style={{ color: laneColor(i) }}
            >
              {initials(p.name)}
            </div>
          ))}
          <span className="absolute bottom-2 right-2 rounded bg-bg/85 px-2 py-0.5 text-xs">{formatMinutes(m.duration_sec)}</span>
        </div>
        <div className="space-y-1.5 p-3">
          <h3 className="truncate font-medium">{m.title}</h3>
          <p className="truncate text-sm text-muted">
            {PLATFORM[m.platform]} · {m.host?.name ?? 'Unknown host'} · {dateFmt.format(new Date(m.started_at))}
          </p>
          {m.highlight_sec > 0 && <Chip>{formatMinutes(m.highlight_sec)} of highlights</Chip>}
        </div>
      </Card>
    </Link>
  )
}
```

`components/UpcomingEvents.tsx`:
```tsx
import { Card } from '@/components/ui/Card'
import type { UpcomingEvent } from '@/lib/types'

const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) return null
  return (
    <section aria-label="Upcoming meetings" className="mb-8">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Upcoming</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {events.map((e) => (
          <Card key={e.id} className="min-w-56 shrink-0 p-3">
            <p className="truncate text-sm font-medium">{e.title}</p>
            <p className="text-xs text-muted">{fmt.format(new Date(e.starts_at))} UTC · Notetaker will join</p>
          </Card>
        ))}
      </div>
    </section>
  )
}
```

`app/meetings/page.tsx`:
```tsx
import { MeetingCard } from '@/components/MeetingCard'
import { UpcomingEvents } from '@/components/UpcomingEvents'
import { groupByMonth } from '@/lib/group'
import { getDemoPersona, listMeetings, listUpcoming } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function MeetingsPage() {
  const db = await createClient()
  const persona = await getDemoPersona(db)
  const [meetings, events] = await Promise.all([
    listMeetings(db, { hostId: persona?.id }),
    listUpcoming(db),
  ])
  const groups = groupByMonth(meetings)
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <UpcomingEvents events={events} />
      {groups.map((g) => (
        <section key={g.label} className="mb-10">
          <h2 className="mb-4 text-xl font-semibold">{g.label}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((m) => <MeetingCard key={m.id} m={m} />)}
          </div>
        </section>
      ))}
      {meetings.length === 0 && <p className="text-muted">No calls yet. Run `npm run seed:load`.</p>}
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx vitest run && npm run dev`, open `/meetings`.
Expected: four cards (the demo persona hosts four meetings) grouped under `October 2026`, each with duration badge, host, date, and "N mins of highlights"; upcoming events row above. Check at 390px width: one column, no horizontal page scroll.

- [ ] **Step 4: Commit**

```bash
git add lib components app/meetings app/globals.css tests/format.test.ts
git commit -m "feat: My Calls list with meeting cards and upcoming events" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Team Calls

**Files:**
- Create: `components/TeamTable.tsx`, `app/team/page.tsx`

**Interfaces:**
- Consumes: `listMeetings`, `getTeamStats` (Task 16), `MeetingCard` (Task 18), `formatMs`.
- Produces: `/team?host=<member_id>&role=<role>` page; `<TeamTable rows={TeamStatRow[]} />`.

- [ ] **Step 1: Implement**

`components/TeamTable.tsx`:
```tsx
import { formatMs } from '@/lib/format'
import type { TeamStatRow } from '@/lib/types'

export function TeamTable({ rows }: { rows: TeamStatRow[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="bg-surface text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Member</th>
            <th scope="col" className="px-4 py-2 font-medium">Calls</th>
            <th scope="col" className="px-4 py-2 font-medium">Talk time</th>
            <th scope="col" className="px-4 py-2 font-medium">Questions</th>
            <th scope="col" className="px-4 py-2 font-medium">Longest monologue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.member_id} className="border-t border-border">
              <td className="px-4 py-2">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted">{r.role}</p>
              </td>
              <td className="px-4 py-2">{r.calls}</td>
              <td className="px-4 py-2">{r.talk_pct}%</td>
              <td className="px-4 py-2">{r.questions}</td>
              <td className="px-4 py-2">{formatMs(r.longest_monologue_sec * 1000)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`app/team/page.tsx`:
```tsx
import { MeetingCard } from '@/components/MeetingCard'
import { TeamTable } from '@/components/TeamTable'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { groupByMonth } from '@/lib/group'
import { getTeamStats, listMeetings } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ host?: string; role?: string }> }) {
  const { host = '', role = '' } = await searchParams
  const db = await createClient()
  const [all, stats] = await Promise.all([listMeetings(db), getTeamStats(db)])
  const meetings = all.filter((m) => (!host || m.host_id === host) && (!role || m.host?.role === role))
  const withCalls = stats.filter((s) => s.calls > 0)
  const avgTalk = withCalls.length ? Math.round(withCalls.reduce((a, s) => a + s.talk_pct, 0) / withCalls.length) : 0
  const roles = [...new Set(stats.map((s) => s.role))].sort()
  const select = 'h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg'

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-muted">Calls</p><p className="text-3xl font-semibold">{meetings.length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Avg talk time</p><p className="text-3xl font-semibold">{avgTalk}%</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Team members</p><p className="text-3xl font-semibold">{stats.length}</p></Card>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Team members</h2>
        <TeamTable rows={stats} />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">Team calls</h2>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <select name="host" defaultValue={host} aria-label="Host" className={select}>
              <option value="">All hosts</option>
              {stats.map((s) => <option key={s.member_id} value={s.member_id}>{s.name}</option>)}
            </select>
            <select name="role" defaultValue={role} aria-label="Role" className={select}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Button type="submit" size="sm">Filter</Button>
          </form>
        </div>
        {groupByMonth(meetings).map((g) => (
          <div key={g.label} className="mb-8">
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">{g.label}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((m) => <MeetingCard key={m.id} m={m} />)}
            </div>
          </div>
        ))}
        {meetings.length === 0 && <p className="text-muted">No calls match these filters.</p>}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run dev`, open `/team`.
Expected: eight calls, a members table with talk-time percentages that make sense (members who spoke more have higher %), and filters work: choosing a host narrows the list; an unknown `?host=zzz` shows "No calls match these filters." without an error.

- [ ] **Step 3: Commit**

```bash
git add components/TeamTable.tsx app/team
git commit -m "feat: Team Calls with stats strip, members table and filters" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Playback store and player

**Files:**
- Create: `lib/playback.ts`, `components/meeting/playback-hooks.ts`, `components/meeting/Scrubber.tsx`, `components/meeting/Player.tsx`, `tests/playback.test.ts`

**Interfaces:**
- Consumes: `findActiveIdx` (Task 6), `formatMs`, `laneColor`, `hlColor`, primitives.
- Produces: `class PlaybackStore { ms: number; playing: boolean; speed: number; readonly durationMs: number; constructor(durationMs, initialMs = 0); subscribe(l): () => void; tick(deltaMs); play(); pause(); toggle(); seek(ms); skip(deltaMs); setSpeed(s) }`; hooks `useActiveIdx(store, segs): number`, `useMs(store, intervalMs = 100): number`, `usePlaying(store): boolean`, `useSpeed(store): number`, `useClock(store): void`; `<Scrubber store participants segments chapters highlights />`; `<Player store participants segments chapters highlights extra? />` where `extra` is a `ReactNode` rendered in the controls row (used by Task 24).

- [ ] **Step 1: Write the failing test**

`tests/playback.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PlaybackStore } from '@/lib/playback'

describe('PlaybackStore', () => {
  it('does not advance while paused', () => {
    const s = new PlaybackStore(10_000)
    s.tick(500)
    expect(s.ms).toBe(0)
  })
  it('advances by delta times speed while playing', () => {
    const s = new PlaybackStore(10_000)
    s.play()
    s.tick(1000)
    s.setSpeed(2)
    s.tick(1000)
    expect(s.ms).toBe(3000)
  })
  it('stops at the end', () => {
    const s = new PlaybackStore(1000)
    s.play()
    s.tick(5000)
    expect(s.ms).toBe(1000)
    expect(s.playing).toBe(false)
  })
  it('play at the end restarts from zero', () => {
    const s = new PlaybackStore(1000, 1000)
    s.play()
    expect(s.ms).toBe(0)
    expect(s.playing).toBe(true)
  })
  it('seek and skip clamp to the duration', () => {
    const s = new PlaybackStore(10_000, 5000)
    s.seek(-50)
    expect(s.ms).toBe(0)
    s.seek(999_999)
    expect(s.ms).toBe(10_000)
    s.seek(5000)
    s.skip(-10_000)
    expect(s.ms).toBe(0)
  })
  it('clamps a bad initial time and notifies subscribers', () => {
    const s = new PlaybackStore(1000, 99_999)
    expect(s.ms).toBe(1000)
    let n = 0
    const off = s.subscribe(() => n++)
    s.seek(10)
    s.toggle()
    off()
    s.seek(20)
    expect(n).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/playback.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the store**

`lib/playback.ts`:
```ts
type Listener = () => void

export class PlaybackStore {
  ms: number
  playing = false
  speed = 1
  private listeners = new Set<Listener>()

  constructor(readonly durationMs: number, initialMs = 0) {
    this.ms = this.clamp(initialMs)
  }

  private clamp = (v: number) => Math.min(this.durationMs, Math.max(0, v))
  private emit() {
    this.listeners.forEach((l) => l())
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  tick(deltaMs: number) {
    if (!this.playing) return
    this.ms = this.clamp(this.ms + deltaMs * this.speed)
    if (this.ms >= this.durationMs) this.playing = false
    this.emit()
  }
  play() {
    if (this.ms >= this.durationMs) this.ms = 0
    this.playing = true
    this.emit()
  }
  pause() {
    this.playing = false
    this.emit()
  }
  toggle() {
    this.playing ? this.pause() : this.play()
  }
  seek(ms: number) {
    this.ms = this.clamp(ms)
    this.emit()
  }
  skip(deltaMs: number) {
    this.seek(this.ms + deltaMs)
  }
  setSpeed(s: number) {
    this.speed = s
    this.emit()
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/playback.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement hooks**

`components/meeting/playback-hooks.ts`:
```ts
'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PlaybackStore } from '@/lib/playback'
import { findActiveIdx, type Seg } from '@/lib/speaker-runs'

// Returns a primitive, so a component only re-renders when the active line changes.
export function useActiveIdx(store: PlaybackStore, segs: readonly Seg[]): number {
  const snap = () => findActiveIdx(segs, store.ms)
  return useSyncExternalStore(store.subscribe, snap, snap)
}

export function usePlaying(store: PlaybackStore): boolean {
  return useSyncExternalStore(store.subscribe, () => store.playing, () => store.playing)
}

export function useSpeed(store: PlaybackStore): number {
  return useSyncExternalStore(store.subscribe, () => store.speed, () => store.speed)
}

// Throttled time for the scrubber and clock display; immediate when paused or seeking.
export function useMs(store: PlaybackStore, intervalMs = 100): number {
  const [ms, setMs] = useState(store.ms)
  useEffect(() => {
    let last = 0
    setMs(store.ms)
    return store.subscribe(() => {
      const now = performance.now()
      if (!store.playing || now - last >= intervalMs) {
        last = now
        setMs(store.ms)
      }
    })
  }, [store, intervalMs])
  return ms
}

// requestAnimationFrame loop that runs only while playing.
export function useClock(store: PlaybackStore): void {
  useEffect(() => {
    let raf = 0
    let last = 0
    const frame = (t: number) => {
      store.tick(t - last)
      last = t
      raf = store.playing ? requestAnimationFrame(frame) : 0
    }
    const start = () => {
      if (!raf && store.playing) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    const unsub = store.subscribe(start)
    start()
    return () => {
      unsub()
      cancelAnimationFrame(raf)
    }
  }, [store])
}
```

- [ ] **Step 6: Implement the scrubber and player**

`components/meeting/Scrubber.tsx`:
```tsx
'use client'
import { useMemo, useRef } from 'react'
import { formatMs } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { PlaybackStore } from '@/lib/playback'
import { hlColor } from '@/lib/schema'
import type { ChapterRow, HighlightRow, ParticipantRow, SegmentRow } from '@/lib/types'
import { useMs } from './playback-hooks'

type Props = {
  store: PlaybackStore
  participants: ParticipantRow[]
  segments: SegmentRow[]
  chapters: ChapterRow[]
  highlights: HighlightRow[]
}

export function Scrubber({ store, participants, segments, chapters, highlights }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const ms = useMs(store)
  const dur = store.durationMs
  const pct = (v: number) => `${Math.min(100, (v / dur) * 100)}%`
  const lanes = useMemo(
    () => participants.map((p) => segments.filter((s) => s.participant_id === p.id)),
    [participants, segments],
  )
  const seekFrom = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    store.seek(((clientX - r.left) / r.width) * dur)
  }

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={Math.round(dur / 1000)}
      aria-valuenow={Math.round(ms / 1000)}
      aria-valuetext={`${formatMs(ms)} of ${formatMs(dur)}`}
      className="relative cursor-pointer touch-none select-none rounded-lg border border-border bg-surface p-2 focus-visible:outline-2 focus-visible:outline-accent"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFrom(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekFrom(e.clientX)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') store.skip(5000)
        else if (e.key === 'ArrowLeft') store.skip(-5000)
        else return
        e.preventDefault()
      }}
    >
      <div className="relative h-3">
        {highlights.map((h) => (
          <span
            key={h.id}
            title={h.title}
            className="absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-sm"
            style={{ left: pct(h.start_ms), background: hlColor(h.type) }}
          />
        ))}
      </div>
      <div className="relative mt-1 space-y-0.5">
        {lanes.map((lane, i) => (
          <div key={participants[i].id} className="relative h-2 rounded-sm bg-surface-2">
            {lane.map((s) => (
              <span
                key={s.idx}
                className="absolute top-0 h-2 rounded-sm"
                style={{ left: pct(s.start_ms), width: `max(2px, ${((s.end_ms - s.start_ms) / dur) * 100}%)`, background: laneColor(i) }}
              />
            ))}
          </div>
        ))}
        {chapters.map((c) => (
          <span
            key={c.start_ms}
            title={c.title}
            className="absolute inset-y-0 w-px bg-fg/30"
            style={{ left: pct(c.start_ms) }}
          />
        ))}
        <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-fg" style={{ left: pct(ms) }} />
      </div>
    </div>
  )
}
```

`components/meeting/Player.tsx`:
```tsx
'use client'
import { Button } from '@/components/ui/Button'
import { formatMs, initials } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { PlaybackStore } from '@/lib/playback'
import type { ChapterRow, HighlightRow, ParticipantRow, SegmentRow } from '@/lib/types'
import { useActiveIdx, useClock, useMs, usePlaying, useSpeed } from './playback-hooks'
import { Scrubber } from './Scrubber'

const SPEEDS = [1, 1.5, 2]

type Props = {
  store: PlaybackStore
  participants: ParticipantRow[]
  segments: SegmentRow[]
  chapters: ChapterRow[]
  highlights: HighlightRow[]
  extra?: React.ReactNode
}

export function Player({ store, participants, segments, chapters, highlights, extra }: Props) {
  useClock(store)
  const ms = useMs(store)
  const playing = usePlaying(store)
  const speed = useSpeed(store)
  const active = useActiveIdx(store, segments)
  const seg = active >= 0 ? segments[active] : null
  const pIdx = seg ? participants.findIndex((p) => p.id === seg.participant_id) : -1
  const person = pIdx >= 0 ? participants[pIdx] : null
  const chapter = [...chapters].reverse().find((c) => c.start_ms <= ms)

  return (
    <div className="space-y-3">
      <div className="relative grid min-h-44 place-items-center rounded-card border border-border bg-surface p-5 text-center">
        {chapter && <p className="absolute left-4 top-3 text-xs text-muted">{chapter.title}</p>}
        {person ? (
          <div className="max-w-xl space-y-2">
            <div
              className="mx-auto grid size-14 place-items-center rounded-full border-2 bg-surface-2 text-lg font-semibold"
              style={{ borderColor: laneColor(pIdx) }}
            >
              {initials(person.name)}
            </div>
            <p className="text-sm font-medium">{person.name} <span className="text-muted">· {person.role}</span></p>
            <p className="text-balance text-muted" aria-live="off">{seg!.text}</p>
          </div>
        ) : (
          <p className="text-muted">Press play to start the recording.</p>
        )}
      </div>

      <Scrubber store={store} participants={participants} segments={segments} chapters={chapters} highlights={highlights} />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Back 10 seconds" onClick={() => store.skip(-10_000)}>-10s</Button>
        <Button size="sm" variant="primary" aria-label={playing ? 'Pause' : 'Play'} onClick={() => store.toggle()} className="w-20">
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button size="sm" variant="ghost" aria-label="Forward 10 seconds" onClick={() => store.skip(10_000)}>+10s</Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Playback speed ${speed}x`}
          onClick={() => store.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
        >
          {speed}x
        </Button>
        <span className="ml-1 text-sm tabular-nums text-muted">{formatMs(ms)} / {formatMs(store.durationMs)}</span>
        <div className="ml-auto flex items-center gap-2">{extra}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npx vitest run`
Expected: clean, all tests pass. (Visual verification happens in Task 21 when the player is mounted on the meeting page.)

- [ ] **Step 8: Commit**

```bash
git add lib/playback.ts lib/lanes.ts components/meeting tests/playback.test.ts
git commit -m "feat: playback store, hooks, scrubber and simulated player" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Transcript and the meeting page

**Files:**
- Create: `components/meeting/Transcript.tsx`, `components/meeting/SpeakerStrip.tsx`, `components/meeting/Tabs.tsx`, `components/meeting/ChaptersTab.tsx`, `components/meeting/MeetingView.tsx`, `app/meetings/[id]/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `PlaybackStore`, hooks, `Player` (Task 20), `getMeetingBundle`, `getUser` (Tasks 15 and 16), `parseTimeParam` (Task 4), `MeetingBundle`.
- Produces: `<MeetingView bundle={MeetingBundle} userId={string | null} liveAiEnabled={boolean} initialMs={number} />` (client). `MeetingView` assembles a `tabs` array; later tasks add entries to it. `<Tabs tabs={{id, label, content}[]} />`. The route `/meetings/[id]` where `id` is the meeting slug and `?t=<ms>` seeks.

- [ ] **Step 1: Add the row style**

Append to `app/globals.css`:
```css
.tr-row { content-visibility: auto; contain-intrinsic-size: auto 64px; }
```

- [ ] **Step 2: Implement the small components**

`components/meeting/Tabs.tsx`:
```tsx
'use client'
import { useState } from 'react'

export type TabDef = { id: string; label: string; content: React.ReactNode }

export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const [id, setId] = useState(tabs[0].id)
  const current = tabs.find((t) => t.id === id) ?? tabs[0]
  return (
    <div>
      <div role="tablist" aria-label="Meeting details" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === current.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setId(t.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm transition ${t.id === current.id ? 'border-b-2 border-accent text-fg' : 'text-muted hover:text-fg'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="pt-4">
        {current.content}
      </div>
    </div>
  )
}
```

`components/meeting/ChaptersTab.tsx`:
```tsx
'use client'
import { formatMs } from '@/lib/format'
import type { PlaybackStore } from '@/lib/playback'
import type { ChapterRow } from '@/lib/types'

export function ChaptersTab({ store, chapters }: { store: PlaybackStore; chapters: ChapterRow[] }) {
  if (chapters.length === 0) return <p className="text-muted">No chapters for this call.</p>
  return (
    <ol className="space-y-1">
      {chapters.map((c) => (
        <li key={c.start_ms}>
          <button onClick={() => store.seek(c.start_ms)} className="flex w-full gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
            <span className="w-14 shrink-0 tabular-nums text-muted">{formatMs(c.start_ms)}</span>
            <span>{c.title}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
```

`components/meeting/SpeakerStrip.tsx`:
```tsx
import { Card } from '@/components/ui/Card'
import { formatMs } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { ParticipantRow } from '@/lib/types'

export function SpeakerStrip({ participants }: { participants: ParticipantRow[] }) {
  const total = participants.reduce((a, p) => a + p.talk_time_sec, 0) || 1
  return (
    <section aria-label="Speakers" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {participants.map((p, i) => {
        const share = Math.round((p.talk_time_sec / total) * 100)
        return (
          <Card key={p.id} className="p-3">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted">{p.role}</p>
            <div className="mt-2 h-1.5 rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${share}%`, background: laneColor(i) }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {share}% talk · {p.questions} questions · longest {formatMs(p.longest_monologue_sec * 1000)}
            </p>
          </Card>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 3: Implement the transcript**

`components/meeting/Transcript.tsx`:
```tsx
'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatMs } from '@/lib/format'
import { laneColor } from '@/lib/lanes'
import type { PlaybackStore } from '@/lib/playback'
import { hlColor } from '@/lib/schema'
import type { HighlightRow, ParticipantRow, SegmentRow } from '@/lib/types'
import { useActiveIdx } from './playback-hooks'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${esc(query)})`, 'ig'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase() ? <mark key={i} className="rounded bg-accent/30 text-fg">{p}</mark> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  )
}

type Props = {
  store: PlaybackStore
  segments: SegmentRow[]
  participants: ParticipantRow[]
  highlights: HighlightRow[]
  toolbar?: React.ReactNode
}

export function Transcript({ store, segments, participants, highlights, toolbar }: Props) {
  const active = useActiveIdx(store, segments)
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const [speaker, setSpeaker] = useState('all')
  const box = useRef<HTMLDivElement>(null)
  const who = useMemo(() => new Map(participants.map((p, i) => [p.id, { p, i }])), [participants])
  const filtering = query !== '' || speaker !== 'all'

  const rows = useMemo(() => {
    const q = query.toLowerCase()
    return segments.filter((s) => (speaker === 'all' || s.participant_id === speaker) && (!q || s.text.toLowerCase().includes(q)))
  }, [segments, query, speaker])

  // which highlight (if any) covers each segment, for the colored left border
  const hlOf = useMemo(() => {
    const m = new Map<number, HighlightRow>()
    for (const h of highlights) for (const s of segments) if (s.start_ms < h.end_ms && s.end_ms > h.start_ms) m.set(s.idx, h)
    return m
  }, [highlights, segments])

  const scrollToActive = () => {
    const el = box.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    if (el && box.current) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 3, behavior: 'smooth' })
  }
  useEffect(() => {
    if (follow && !filtering && active >= 0) scrollToActive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, follow, filtering])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this transcript"
          aria-label="Search this transcript"
          className="h-9 min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-muted"
        />
        <select value={speaker} onChange={(e) => setSpeaker(e.target.value)} aria-label="Filter by speaker" className="h-9 rounded-lg border border-border bg-surface px-2 text-sm">
          <option value="all">All speakers</option>
          {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {toolbar}
      </div>
      <div className="relative">
        <div
          ref={box}
          onWheel={() => setFollow(false)}
          onTouchMove={() => setFollow(false)}
          className="relative max-h-[60vh] overflow-y-auto rounded-card border border-border bg-surface"
        >
          {rows.length === 0 && <p className="p-4 text-sm text-muted">No lines match.</p>}
          {rows.map((s) => {
            const w = who.get(s.participant_id)
            const h = hlOf.get(s.idx)
            return (
              <div
                key={s.idx}
                data-idx={s.idx}
                onClick={() => store.seek(s.start_ms)}
                className={`tr-row flex cursor-pointer gap-3 border-l-4 px-3 py-2 text-sm transition hover:bg-surface-2 ${active === s.idx ? 'bg-surface-2' : ''}`}
                style={{ borderLeftColor: h ? hlColor(h.type) : 'transparent' }}
              >
                <span className="w-12 shrink-0 tabular-nums text-muted">{formatMs(s.start_ms)}</span>
                <div className="min-w-0">
                  <p className="font-medium" style={{ color: laneColor(w?.i ?? 0) }}>{w?.p.name ?? 'Unknown'}</p>
                  <p><Marked text={s.text} query={query} /></p>
                </div>
              </div>
            )
          })}
        </div>
        {!follow && !filtering && (
          <Button size="sm" variant="primary" className="absolute bottom-3 right-3 shadow-lg" onClick={() => { setFollow(true); scrollToActive() }}>
            Jump to live
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement the meeting view and the page**

`components/meeting/MeetingView.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PlaybackStore } from '@/lib/playback'
import type { MeetingBundle } from '@/lib/types'
import { ChaptersTab } from './ChaptersTab'
import { Player } from './Player'
import { SpeakerStrip } from './SpeakerStrip'
import { Tabs, type TabDef } from './Tabs'
import { Transcript } from './Transcript'

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

export type MeetingViewProps = {
  bundle: MeetingBundle
  userId: string | null
  liveAiEnabled: boolean
  initialMs: number
}

export function MeetingView({ bundle, initialMs }: MeetingViewProps) {
  const { meeting, participants, segments, chapters, highlights } = bundle
  const [store] = useState(() => new PlaybackStore(meeting.duration_sec * 1000, initialMs))
  useEffect(() => {
    store.seek(initialMs)
  }, [store, initialMs])

  const tabs: TabDef[] = [
    { id: 'chapters', label: 'Chapters', content: <ChaptersTab store={store} chapters={chapters} /> },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <Link href="/meetings" className="text-sm text-muted hover:text-fg">← My Calls</Link>
        <h1 className="mt-1 text-2xl font-semibold">{meeting.title}</h1>
        <p className="text-sm text-muted">
          {dateFmt.format(new Date(meeting.started_at))} UTC · {meeting.host?.name ?? 'Unknown host'} · {participants.length} participants
        </p>
      </header>
      <SpeakerStrip participants={participants} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Player store={store} participants={participants} segments={segments} chapters={chapters} highlights={highlights} />
          <Transcript store={store} segments={segments} participants={participants} highlights={highlights} />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Tabs tabs={tabs} />
        </aside>
      </div>
    </div>
  )
}
```

`app/meetings/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { MeetingView } from '@/components/meeting/MeetingView'
import { getUser } from '@/lib/auth'
import { parseTimeParam } from '@/lib/format'
import { getMeetingBundle } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string | string[] }>
}) {
  const { id } = await params
  const { t } = await searchParams
  const db = await createClient()
  const user = await getUser(db)
  const bundle = await getMeetingBundle(db, id, user?.id ?? null)
  if (!bundle) notFound()
  return (
    <MeetingView
      bundle={bundle}
      userId={user?.id ?? null}
      liveAiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
      initialMs={parseTimeParam(t, bundle.meeting.duration_sec * 1000)}
    />
  )
}
```

- [ ] **Step 5: Verify against the showcase**

Run: `npm run typecheck && npm run build && npm run dev`, open `/meetings/q4-planning`.
Expected, checking each by eye or with Playwright:
- All ~1000 transcript lines render; page stays responsive; the speaker strip shows 8 people with plausible talk-time shares.
- Press Play: the stage shows the active speaker and caption, the transcript auto-follows, the scrubber playhead moves; at 2x it stays smooth.
- Scroll the transcript by hand: "Jump to live" appears; clicking it returns to the active line.
- Click a transcript line: playback seeks there. Type in "Search this transcript": rows filter and matches are marked; choosing a speaker filters.
- `/meetings/q4-planning?t=600000` starts at 10:00; `?t=abc`, `?t=-5` and `?t=999999999` start at 0:00 or the end without error.
- `/meetings/does-not-exist` shows the friendly 404.
- At 390px width: player, then transcript, then tabs stack; no horizontal page scroll.

- [ ] **Step 6: Commit**

```bash
git add components/meeting app/meetings app/globals.css
git commit -m "feat: meeting page with synced transcript, speaker stats and deep links" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 22: Summary (templates) and action items

**Files:**
- Create: `lib/markdown.ts`, `components/meeting/SummaryTab.tsx`, `components/meeting/ActionItemsTab.tsx`, `tests/markdown.test.ts`
- Modify: `components/meeting/MeetingView.tsx`

**Interfaces:**
- Consumes: `SummaryContent`, `Template`, `TEMPLATES`, `TEMPLATE_LABELS` (Task 5), `ActionItemRow`, `HighlightRow` (Task 16), `toast` (Task 17).
- Produces: `summaryToMarkdown(title, templateLabel, content): string`, `actionItemsToMarkdown(items: { owner: string; task: string; due: string | null }[]): string`; `<SummaryTab title summaries regen? />` where `regen?: { enabled: boolean; signedIn: boolean; onNeedSignIn: () => void; run: (t: Template) => Promise<SummaryContent> }` (wired in Task 27); `<ActionItemsTab store items ownHighlights />`.

- [ ] **Step 1: Write the failing test**

`tests/markdown.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { actionItemsToMarkdown, summaryToMarkdown } from '@/lib/markdown'

describe('summaryToMarkdown', () => {
  it('renders title, template label, sections and bullets', () => {
    const md = summaryToMarkdown('Q4 Planning', 'General', {
      sections: [{ heading: 'Overview', bullets: ['A', 'B'] }, { heading: 'Decisions', bullets: ['C'] }],
    })
    expect(md).toBe('# Q4 Planning\n_General summary_\n\n## Overview\n- A\n- B\n\n## Decisions\n- C\n')
  })
})

describe('actionItemsToMarkdown', () => {
  it('renders a checklist with optional due dates', () => {
    expect(actionItemsToMarkdown([
      { owner: 'Ann', task: 'Ship it', due: '2026-10-09' },
      { owner: 'Bob', task: 'Fix login', due: null },
    ])).toBe('- [ ] Ann: Ship it (due 2026-10-09)\n- [ ] Bob: Fix login\n')
  })
  it('is empty for no items', () => expect(actionItemsToMarkdown([])).toBe(''))
})
```
Run: `npx vitest run tests/markdown.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/markdown.ts`**

```ts
import type { SummaryContent } from './schema'

export function summaryToMarkdown(title: string, templateLabel: string, c: SummaryContent): string {
  const lines = [
    `# ${title}`,
    `_${templateLabel} summary_`,
    '',
    ...c.sections.flatMap((s) => [`## ${s.heading}`, ...s.bullets.map((b) => `- ${b}`), '']),
  ]
  return lines.join('\n').trimEnd() + '\n'
}

export function actionItemsToMarkdown(items: { owner: string; task: string; due: string | null }[]): string {
  if (items.length === 0) return ''
  return items.map((i) => `- [ ] ${i.owner}: ${i.task}${i.due ? ` (due ${i.due})` : ''}`).join('\n') + '\n'
}
```
Run the test again. Expected: PASS.

- [ ] **Step 2b: Implement the tabs**

`components/meeting/SummaryTab.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { summaryToMarkdown } from '@/lib/markdown'
import { TEMPLATE_LABELS, TEMPLATES, type SummaryContent, type Template } from '@/lib/schema'
import { toast } from '@/lib/toast'

type Entry = { content: SummaryContent; source: 'seed' | 'live' }
export type Regen = {
  enabled: boolean
  signedIn: boolean
  onNeedSignIn: () => void
  run: (t: Template) => Promise<SummaryContent>
}

export function SummaryTab({
  title, summaries, regen,
}: { title: string; summaries: Partial<Record<Template, Entry>>; regen?: Regen }) {
  const available = TEMPLATES.filter((t) => summaries[t])
  const [template, setTemplate] = useState<Template>(available[0] ?? 'general')
  const [local, setLocal] = useState<Partial<Record<Template, Entry>>>({})
  const [busy, setBusy] = useState(false)
  const entry = local[template] ?? summaries[template]

  if (!entry) return <p className="text-muted">No summary is available for this call yet.</p>

  async function regenerate() {
    if (!regen) return
    if (!regen.signedIn) return regen.onNeedSignIn()
    setBusy(true)
    try {
      const content = await regen.run(template)
      setLocal((l) => ({ ...l, [template]: { content, source: 'live' } }))
      toast('Summary regenerated')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not regenerate')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Summary template" className="flex flex-wrap gap-1">
        {available.map((t) => (
          <button
            key={t}
            aria-pressed={t === template}
            onClick={() => setTemplate(t)}
            className={`rounded-full border px-3 py-1 text-sm transition ${t === template ? 'border-accent bg-surface-2 text-fg' : 'border-border text-muted hover:text-fg'}`}
          >
            {TEMPLATE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>{entry.source === 'live' ? 'Generated live' : 'Pre-generated'}</Chip>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(summaryToMarkdown(title, TEMPLATE_LABELS[template], entry.content))
            toast('Summary copied')
          }}
        >
          Copy
        </Button>
        {regen && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!regen.enabled || busy}
            title={regen.enabled ? undefined : 'Live regeneration needs ANTHROPIC_API_KEY on the server'}
            onClick={regenerate}
          >
            {busy ? 'Regenerating…' : 'Regenerate with AI'}
          </Button>
        )}
      </div>
      {regen && !regen.enabled && (
        <p className="text-xs text-muted">Live regeneration is off: no API key is configured, so the pre-generated summaries are shown.</p>
      )}
      {entry.content.sections.map((s) => (
        <section key={s.heading}>
          <h3 className="mb-1 text-sm font-semibold">{s.heading}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

`components/meeting/ActionItemsTab.tsx`:
```tsx
'use client'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { formatMs } from '@/lib/format'
import { actionItemsToMarkdown } from '@/lib/markdown'
import type { PlaybackStore } from '@/lib/playback'
import { toast } from '@/lib/toast'
import type { ActionItemRow, HighlightRow } from '@/lib/types'

export function ActionItemsTab({
  store, items, ownHighlights,
}: { store: PlaybackStore; items: ActionItemRow[]; ownHighlights: HighlightRow[] }) {
  if (items.length === 0 && ownHighlights.length === 0) return <p className="text-muted">No action items.</p>
  return (
    <div className="space-y-4">
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(actionItemsToMarkdown(items))
          toast('Action items copied')
        }}
      >
        Copy
      </Button>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p>{a.task}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-medium text-fg">{a.owner}</span>
              {a.due && <Chip>Due {a.due}</Chip>}
              <button className="underline hover:text-fg" onClick={() => store.seek(a.start_ms)}>
                Jump to {formatMs(a.start_ms)}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {ownHighlights.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Your action-item highlights</h3>
          <ul className="space-y-2">
            {ownHighlights.map((h) => (
              <li key={h.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <button className="text-left hover:underline" onClick={() => store.seek(h.start_ms)}>
                  {h.title} <span className="text-muted">({formatMs(h.start_ms)})</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire into `MeetingView`**

In `components/meeting/MeetingView.tsx` add imports `import { ActionItemsTab } from './ActionItemsTab'` and `import { SummaryTab } from './SummaryTab'`; change the signature to `export function MeetingView({ bundle, userId, initialMs }: MeetingViewProps)`; replace the `tabs` array with:
```tsx
  const tabs: TabDef[] = [
    { id: 'summary', label: 'Summary', content: <SummaryTab title={meeting.title} summaries={bundle.summaries} /> },
    {
      id: 'actions',
      label: 'Action items',
      content: (
        <ActionItemsTab
          store={store}
          items={bundle.actionItems}
          ownHighlights={highlights.filter((h) => h.type === 'action_item' && h.user_id === userId)}
        />
      ),
    },
    { id: 'chapters', label: 'Chapters', content: <ChaptersTab store={store} chapters={chapters} /> },
  ]
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run && npm run dev`, open `/meetings/q4-planning`.
Expected: Summary tab shows General by default with four template pills (General, Sales, Standup, Project review); switching is instant (no network request in the browser devtools); Copy puts markdown on the clipboard and shows a toast; the "Regenerate" button is absent (not wired yet). Action items tab lists items with owners, due dates as real ISO dates, and "Jump to m:ss" seeks the player.

- [ ] **Step 5: Commit**

```bash
git add lib/markdown.ts components/meeting tests/markdown.test.ts
git commit -m "feat: summary templates, copy, and action items tabs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Highlights

**Files:**
- Create: `lib/highlight.ts`, `app/meetings/[id]/actions.ts`, `components/SignInDialog.tsx`, `components/meeting/HighlightPanel.tsx`, `components/meeting/HighlightsTab.tsx`, `tests/highlight.test.ts`
- Modify: `components/meeting/MeetingView.tsx` (full replacement below)

**Interfaces:**
- Consumes: `expandToRun`, `findActiveIdx` (Task 6), `HIGHLIGHT_TYPES`, `HIGHLIGHT_META`, `hlColor` (Task 5), `selectAll` (Task 16), `createClient`, `getUser` (Task 15), `signInWithGoogle` (Task 15).
- Produces: `type HighlightDraft = { type; title; note: string | null; start_ms; end_ms }`, `buildHighlight(segs: HlSeg[], idx: number, type: HighlightType, note?: string | null): HighlightDraft | null` where `HlSeg = { participant_id: string; start_ms: number; end_ms: number; text: string }`; server actions `createHighlight(raw: unknown): Promise<{ ok: true; highlight: HighlightRow } | { ok: false; error: 'auth' | 'invalid' | 'not_found' | 'failed' }>` and `deleteHighlight(id: string): Promise<{ ok: boolean }>`; `<SignInDialog open onClose message next />`; `<HighlightPanel highlights signedIn onAdd />`; `<HighlightsTab ... />` (props in code below).

- [ ] **Step 1: Write the failing test**

`tests/highlight.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildHighlight, type HlSeg } from '@/lib/highlight'
import { findActiveIdx } from '@/lib/speaker-runs'

const seg = (p: string, s: number, e: number, text: string): HlSeg => ({ participant_id: p, start_ms: s, end_ms: e, text })
const segs = [
  seg('a', 5000, 9000, 'Thanks everyone for joining today and welcome to the call'),
  seg('a', 9500, 14_000, 'Let me start with the numbers'),
  seg('b', 14_500, 18_000, 'Sounds good'),
]

describe('buildHighlight', () => {
  it('captures the whole speaker run containing the playhead (retroactive monologue)', () => {
    const h = buildHighlight(segs, 1, 'insight')!
    expect(h.start_ms).toBe(5000)
    expect(h.end_ms).toBe(14_000)
    expect(h.type).toBe('insight')
  })
  it('titles by the note when given, else the first eight words', () => {
    expect(buildHighlight(segs, 0, 'feedback', '  Great opener  ')!.title).toBe('Great opener')
    expect(buildHighlight(segs, 0, 'feedback')!.title).toBe('Thanks everyone for joining today and welcome to…')
    expect(buildHighlight(segs, 0, 'feedback', '  ')!.note).toBeNull()
  })
  it('returns null when nothing is playing yet: before the first line, or no lines at all', () => {
    expect(buildHighlight(segs, findActiveIdx(segs, 1000), 'insight')).toBeNull()
    expect(buildHighlight([], 0, 'insight')).toBeNull()
  })
})
```
Run: `npx vitest run tests/highlight.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/highlight.ts`**

```ts
import type { HighlightType } from './schema'
import { expandToRun } from './speaker-runs'

export type HlSeg = { participant_id: string; start_ms: number; end_ms: number; text: string }
export type HighlightDraft = {
  type: HighlightType
  title: string
  note: string | null
  start_ms: number
  end_ms: number
}

// Mirrors Fathom: capture the whole monologue the playhead is in, not a fixed window.
export function buildHighlight(
  segs: readonly HlSeg[],
  idx: number,
  type: HighlightType,
  note?: string | null,
): HighlightDraft | null {
  const run = expandToRun(segs, idx)
  if (!run) return null
  const cleaned = note?.trim() || null
  const words = segs.slice(run.startIdx, run.endIdx + 1).map((s) => s.text).join(' ').split(/\s+/)
  const auto = words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : '')
  return { type, note: cleaned, title: (cleaned ?? auto).slice(0, 80), start_ms: run.start_ms, end_ms: run.end_ms }
}
```
Run the test again. Expected: PASS.

- [ ] **Step 3: Server actions**

`app/meetings/[id]/actions.ts`:
```ts
'use server'
import { z } from 'zod'
import { getUser } from '@/lib/auth'
import { buildHighlight } from '@/lib/highlight'
import { selectAll } from '@/lib/queries'
import { HIGHLIGHT_TYPES } from '@/lib/schema'
import { createClient } from '@/lib/supabase/server'
import type { HighlightRow } from '@/lib/types'

const createInput = z.object({
  meetingSlug: z.string().min(1).max(100),
  segmentIdx: z.number().int().min(0),
  type: z.enum(HIGHLIGHT_TYPES),
  note: z.string().max(280).nullable().optional(),
})

export type CreateHighlightResult =
  | { ok: true; highlight: HighlightRow }
  | { ok: false; error: 'auth' | 'invalid' | 'not_found' | 'failed' }

export async function createHighlight(raw: unknown): Promise<CreateHighlightResult> {
  const parsed = createInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const db = await createClient()
  const user = await getUser(db)
  if (!user) return { ok: false, error: 'auth' }

  const { data: meeting } = await db.from('meetings').select('id').eq('slug', parsed.data.meetingSlug).maybeSingle()
  if (!meeting) return { ok: false, error: 'not_found' }
  const segs = await selectAll<{ participant_id: string; start_ms: number; end_ms: number; text: string }>(
    (from, to) =>
      db.from('segments').select('participant_id,start_ms,end_ms,text')
        .eq('meeting_id', meeting.id).order('idx').range(from, to),
  )
  const draft = buildHighlight(segs, parsed.data.segmentIdx, parsed.data.type, parsed.data.note)
  if (!draft) return { ok: false, error: 'invalid' }

  const { data, error } = await db
    .from('highlights')
    .insert({ meeting_id: meeting.id, user_id: user.id, ...draft })
    .select('id,user_id,type,title,note,start_ms,end_ms')
    .single()
  if (error || !data) return { ok: false, error: 'failed' }
  return { ok: true, highlight: data as HighlightRow }
}

export async function deleteHighlight(id: string): Promise<{ ok: boolean }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false }
  const db = await createClient()
  if (!(await getUser(db))) return { ok: false }
  const { error } = await db.from('highlights').delete().eq('id', id) // RLS: own rows only
  return { ok: !error }
}
```

- [ ] **Step 4: Sign-in dialog, panel and tab**

`components/SignInDialog.tsx`:
```tsx
'use client'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { signInWithGoogle } from '@/lib/supabase/client'

export function SignInDialog({
  open, onClose, message, next,
}: { open: boolean; onClose: () => void; message: string; next: () => string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(92vw,26rem)] rounded-card border border-border bg-surface p-6 text-fg backdrop:bg-black/60"
    >
      <h2 className="text-lg font-semibold">Sign in to continue</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Not now</Button>
        <Button variant="primary" onClick={() => signInWithGoogle(next())}>Sign in with Google</Button>
      </div>
    </dialog>
  )
}
```

`components/meeting/HighlightPanel.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { HIGHLIGHT_META, HIGHLIGHT_TYPES, hlColor, type HighlightType } from '@/lib/schema'
import type { HighlightRow } from '@/lib/types'

export function HighlightPanel({
  highlights, signedIn, onAdd,
}: { highlights: HighlightRow[]; signedIn: boolean; onAdd: (type: HighlightType, note: string | null) => void }) {
  const [note, setNote] = useState('')
  const count = (t: HighlightType) => highlights.filter((h) => h.type === t).length
  return (
    <section aria-label="Highlight this moment" className="rounded-card border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Highlight this moment</h2>
        <span className="text-xs text-muted">{signedIn ? 'Press H for Insight' : 'Sign in to save highlights'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {HIGHLIGHT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              onAdd(t, note.trim() || null)
              setNote('')
            }}
            className="flex items-center justify-between rounded-lg border-2 bg-surface-2 px-3 py-2 text-sm font-medium transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-accent"
            style={{ borderColor: hlColor(t) }}
          >
            <span>{HIGHLIGHT_META[t].label}</span>
            <span className="rounded bg-bg px-1.5 text-xs tabular-nums">{count(t)}</span>
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        placeholder="Add note (optional)"
        aria-label="Note for the next highlight"
        className="mt-2 h-9 w-full rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-muted"
      />
    </section>
  )
}
```

`components/meeting/HighlightsTab.tsx`:
```tsx
'use client'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { formatMs } from '@/lib/format'
import type { PlaybackStore } from '@/lib/playback'
import { HIGHLIGHT_META, hlColor } from '@/lib/schema'
import type { HighlightRow, SegmentRow } from '@/lib/types'

const excerpt = (segs: SegmentRow[], h: HighlightRow) =>
  segs.filter((s) => s.start_ms < h.end_ms && s.end_ms > h.start_ms).map((s) => s.text).join(' ').slice(0, 220)

export function HighlightsTab({
  store, segments, highlights, userId, onDelete, onShare,
}: {
  store: PlaybackStore
  segments: SegmentRow[]
  highlights: HighlightRow[]
  userId: string | null
  onDelete: (id: string) => void
  onShare?: (h: HighlightRow) => void
}) {
  if (highlights.length === 0) return <p className="text-muted">No highlights yet. Press a type button while the call plays.</p>
  return (
    <ul className="space-y-3">
      {highlights.map((h) => {
        const own = userId !== null && h.user_id === userId
        return (
          <li key={h.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Chip color={hlColor(h.type)}>{HIGHLIGHT_META[h.type].label}</Chip>
              <span className="tabular-nums text-xs text-muted">{formatMs(h.start_ms)}–{formatMs(h.end_ms)}</span>
              {!own && <span className="text-xs text-muted">Demo</span>}
            </div>
            <p className="mt-2 font-medium">{h.title}</p>
            <p className="mt-1 text-muted">{excerpt(segments, h)}</p>
            <div className="mt-2 flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => store.seek(h.start_ms)}>Jump</Button>
              {onShare && <Button size="sm" variant="ghost" onClick={() => onShare(h)}>Share clip</Button>}
              {own && <Button size="sm" variant="ghost" onClick={() => onDelete(h.id)}>Delete</Button>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 5: Replace `MeetingView.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { createHighlight, deleteHighlight } from '@/app/meetings/[id]/actions'
import { SignInDialog } from '@/components/SignInDialog'
import { buildHighlight } from '@/lib/highlight'
import { PlaybackStore } from '@/lib/playback'
import type { HighlightType } from '@/lib/schema'
import { findActiveIdx } from '@/lib/speaker-runs'
import { toast } from '@/lib/toast'
import type { HighlightRow, MeetingBundle } from '@/lib/types'
import { ActionItemsTab } from './ActionItemsTab'
import { ChaptersTab } from './ChaptersTab'
import { HighlightPanel } from './HighlightPanel'
import { HighlightsTab } from './HighlightsTab'
import { Player } from './Player'
import { SpeakerStrip } from './SpeakerStrip'
import { SummaryTab } from './SummaryTab'
import { Tabs, type TabDef } from './Tabs'
import { Transcript } from './Transcript'

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
const byStart = (a: HighlightRow, b: HighlightRow) => a.start_ms - b.start_ms

export type MeetingViewProps = {
  bundle: MeetingBundle
  userId: string | null
  liveAiEnabled: boolean
  initialMs: number
}

export function MeetingView({ bundle, userId, initialMs }: MeetingViewProps) {
  const { meeting, participants, segments, chapters } = bundle
  const [store] = useState(() => new PlaybackStore(meeting.duration_sec * 1000, initialMs))
  const [highlights, setHighlights] = useState<HighlightRow[]>(bundle.highlights)
  const [signIn, setSignIn] = useState<string | null>(null)

  useEffect(() => {
    store.seek(initialMs)
  }, [store, initialMs])

  const addHighlight = useCallback(
    async (type: HighlightType, note: string | null) => {
      if (!userId) return setSignIn('Sign in with Google to save highlights. You will come back to this moment.')
      const idx = findActiveIdx(segments, store.ms)
      const draft = buildHighlight(segments, idx, type, note)
      if (!draft) return // nothing is playing yet
      const tmp: HighlightRow = { id: `tmp-${Date.now()}`, user_id: userId, ...draft }
      setHighlights((h) => [...h, tmp].sort(byStart))
      const res = await createHighlight({ meetingSlug: meeting.slug, segmentIdx: idx, type, note })
      if (res.ok) setHighlights((h) => h.map((x) => (x.id === tmp.id ? res.highlight : x)).sort(byStart))
      else {
        setHighlights((h) => h.filter((x) => x.id !== tmp.id))
        toast('Could not save the highlight')
      }
    },
    [userId, segments, store, meeting.slug],
  )

  const removeHighlight = useCallback(async (id: string) => {
    let removed: HighlightRow | undefined
    setHighlights((h) => {
      removed = h.find((x) => x.id === id)
      return h.filter((x) => x.id !== id)
    })
    const res = await deleteHighlight(id)
    if (!res.ok && removed) {
      setHighlights((h) => [...h, removed!].sort(byStart))
      toast('Could not delete the highlight')
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'h') return
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      addHighlight('insight', null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addHighlight])

  const tabs: TabDef[] = [
    { id: 'summary', label: 'Summary', content: <SummaryTab title={meeting.title} summaries={bundle.summaries} /> },
    {
      id: 'actions',
      label: 'Action items',
      content: (
        <ActionItemsTab
          store={store}
          items={bundle.actionItems}
          ownHighlights={highlights.filter((h) => h.type === 'action_item' && h.user_id === userId)}
        />
      ),
    },
    { id: 'chapters', label: 'Chapters', content: <ChaptersTab store={store} chapters={chapters} /> },
    {
      id: 'highlights',
      label: `Highlights (${highlights.length})`,
      content: (
        <HighlightsTab
          store={store}
          segments={segments}
          highlights={highlights}
          userId={userId}
          onDelete={removeHighlight}
        />
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <Link href="/meetings" className="text-sm text-muted hover:text-fg">← My Calls</Link>
        <h1 className="mt-1 text-2xl font-semibold">{meeting.title}</h1>
        <p className="text-sm text-muted">
          {dateFmt.format(new Date(meeting.started_at))} UTC · {meeting.host?.name ?? 'Unknown host'} · {participants.length} participants
        </p>
      </header>
      <SpeakerStrip participants={participants} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Player store={store} participants={participants} segments={segments} chapters={chapters} highlights={highlights} />
          <HighlightPanel highlights={highlights} signedIn={userId !== null} onAdd={addHighlight} />
          <Transcript store={store} segments={segments} participants={participants} highlights={highlights} />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Tabs tabs={tabs} />
        </aside>
      </div>
      <SignInDialog
        open={signIn !== null}
        onClose={() => setSignIn(null)}
        message={signIn ?? ''}
        next={() => `/meetings/${meeting.slug}?t=${Math.round(store.ms)}`}
      />
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npx vitest run && npm run dev`, open `/meetings/q4-planning`.
Signed out: the Highlights tab shows the seeded demo highlights (labelled Demo) with colored markers on the scrubber and colored left borders on their transcript rows; pressing Insight or `H` opens the sign-in dialog; pressing a type button before pressing play does nothing and does not error.
Signed in (Google OAuth configured, Task 15 step 8): press Play, wait a few seconds, press `H`: a marker appears at once, the tab count increments, and the highlight spans the whole current speaker run (compare its start with the transcript line where that speaker began). Reload: it persists. In another browser profile or after sign-out: it is not visible. Add a note, press Objection: the title is the note. Delete removes it. Typing in the transcript search box and pressing `h` does not create a highlight.

- [ ] **Step 7: Commit**

```bash
git add lib/highlight.ts app/meetings components tests/highlight.test.ts
git commit -m "feat: typed speaker-run highlights with sign-in gate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Share clips and the public clip page

**Files:**
- Create: `lib/share.ts`, `lib/slug.ts`, `lib/clip.ts`, `components/meeting/ClipView.tsx`, `app/clip/[slug]/page.tsx`, `app/clip/[slug]/opengraph-image.tsx`, `scripts/seed-clips.ts`, `tests/share.test.ts`
- Modify: `app/meetings/[id]/actions.ts`, `lib/queries.ts`, `lib/types.ts`, `app/meetings/[id]/page.tsx`, `components/meeting/MeetingView.tsx`, `components/meeting/Transcript.tsx`, `package.json` (script `seed:clips`)

**Interfaces:**
- Consumes: `MAX_CLIP_MS` (Task 5), `expandToRun` (Task 6), `Player`, `Transcript` (Tasks 20 and 21), `createAnonClient` (Task 15).
- Produces: `clampWindow(start: number, end: number, durationMs: number): { start_ms: number; end_ms: number } | null`; `newSlug(len = 10): string` (`lib/slug.ts`, server only); `type Clip = { slug; meeting_slug; title; start_ms; end_ms; segments: { idx; start_ms; end_ms; speaker; text }[] }` and `getClip(db, slug): Promise<Clip | null>` (`lib/clip.ts`, wrapped in `React.cache`); server actions `createShare(raw): Promise<{ ok: true; path: string } | { ok: false; error: 'auth' | 'invalid' | 'not_found' | 'limit' | 'failed' }>` and `deleteShare(slug): Promise<{ ok: boolean }>`; `getMyShares(db, meetingId): Promise<ShareRow[]>`; `type ShareRow = { slug: string; start_ms: number; end_ms: number }`.

- [ ] **Step 1: Write the failing test**

`tests/share.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clampWindow } from '@/lib/share'
import { newSlug } from '@/lib/slug'

const DUR = 3_600_000

describe('clampWindow', () => {
  it('keeps a valid window', () => expect(clampWindow(1000, 20_000, DUR)).toEqual({ start_ms: 1000, end_ms: 20_000 }))
  it('trims a window longer than 5 minutes', () =>
    expect(clampWindow(0, 900_000, DUR)).toEqual({ start_ms: 0, end_ms: 300_000 }))
  it('clamps negatives and the meeting end', () => {
    expect(clampWindow(-50, 10_000, DUR)).toEqual({ start_ms: 0, end_ms: 10_000 })
    expect(clampWindow(3_590_000, 4_000_000, DUR)).toEqual({ start_ms: 3_590_000, end_ms: DUR })
  })
  it('rejects empty, inverted, outside-the-meeting and non-finite windows', () => {
    expect(clampWindow(5000, 5000, DUR)).toBeNull()
    expect(clampWindow(9000, 1000, DUR)).toBeNull()
    expect(clampWindow(DUR + 1, DUR + 9000, DUR)).toBeNull()
    expect(clampWindow(Number.NaN, 1000, DUR)).toBeNull()
    expect(clampWindow(0, Number.POSITIVE_INFINITY, DUR)).toBeNull()
  })
})

describe('newSlug', () => {
  it('is 10 unambiguous characters and unique', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const s = newSlug()
      expect(s).toMatch(/^[a-km-z2-9]{10}$/)
      seen.add(s)
    }
    expect(seen.size).toBe(2000)
  })
})
```
Run: `npx vitest run tests/share.test.ts`. Expected: FAIL (modules not found).

- [ ] **Step 2: Implement**

`lib/share.ts`:
```ts
import { MAX_CLIP_MS } from './schema'

export function clampWindow(
  start: number,
  end: number,
  durationMs: number,
): { start_ms: number; end_ms: number } | null {
  if (![start, end, durationMs].every(Number.isFinite)) return null
  const s = Math.max(0, Math.round(start))
  const e = Math.min(Math.round(end), durationMs, s + MAX_CLIP_MS)
  return e > s ? { start_ms: s, end_ms: e } : null
}
```

`lib/slug.ts`:
```ts
import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789' // 32 symbols: no bias with & 31, no l/o/0/1

export function newSlug(len = 10): string {
  return Array.from(randomBytes(len), (b) => ALPHABET[b & 31]).join('')
}
```
Run: `npx vitest run tests/share.test.ts`. Expected: PASS.

`lib/types.ts` (append):
```ts
export type ShareRow = { slug: string; start_ms: number; end_ms: number }
```

`lib/clip.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { cache } from 'react'

export type Clip = {
  slug: string
  meeting_slug: string
  title: string
  start_ms: number
  end_ms: number
  segments: { idx: number; start_ms: number; end_ms: number; speaker: string; text: string }[]
}

export const getClip = cache(async (db: SupabaseClient, slug: string): Promise<Clip | null> => {
  const { data, error } = await db.rpc('get_clip', { p_slug: slug })
  if (error) throw new Error(error.message)
  return (data as Clip | null) ?? null
})
```
(`cache` keys on argument identity; the page and `generateMetadata` must pass the same client instance, so create one `createAnonClient()` per request in a small module-level helper inside each file's function and reuse it. If dedupe is not needed, plain calls are fine: one extra RPC.)

`lib/queries.ts` (append):
```ts
import type { ShareRow } from './types'

export async function getMyShares(db: SupabaseClient, meetingId: string): Promise<ShareRow[]> {
  const r = await db.from('shares').select('slug,start_ms,end_ms').eq('meeting_id', meetingId).order('created_at', { ascending: false })
  return unwrap(r) as ShareRow[] // RLS returns only the signed-in user's rows
}
```

- [ ] **Step 3: Share server actions**

Append to `app/meetings/[id]/actions.ts`:
```ts
import { clampWindow } from '@/lib/share'
import { newSlug } from '@/lib/slug'

const shareInput = z.object({
  meetingSlug: z.string().min(1).max(100),
  start_ms: z.number(),
  end_ms: z.number(),
})
const DAILY_SHARE_LIMIT = 20

export type CreateShareResult =
  | { ok: true; path: string; share: { slug: string; start_ms: number; end_ms: number } }
  | { ok: false; error: 'auth' | 'invalid' | 'not_found' | 'limit' | 'failed' }

export async function createShare(raw: unknown): Promise<CreateShareResult> {
  const parsed = shareInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const db = await createClient()
  const user = await getUser(db)
  if (!user) return { ok: false, error: 'auth' }

  const { data: meeting } = await db.from('meetings').select('id,duration_sec').eq('slug', parsed.data.meetingSlug).maybeSingle()
  if (!meeting) return { ok: false, error: 'not_found' }
  const win = clampWindow(parsed.data.start_ms, parsed.data.end_ms, meeting.duration_sec * 1000)
  if (!win) return { ok: false, error: 'invalid' }

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await db.from('shares').select('slug', { count: 'exact', head: true }).gte('created_at', since)
  if ((count ?? 0) >= DAILY_SHARE_LIMIT) return { ok: false, error: 'limit' }

  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = newSlug()
    const { error } = await db.from('shares').insert({ slug, meeting_id: meeting.id, created_by: user.id, ...win })
    if (!error) return { ok: true, path: `/clip/${slug}`, share: { slug, ...win } }
    if (error.code !== '23505') break // only a slug collision is worth retrying
  }
  return { ok: false, error: 'failed' }
}

export async function deleteShare(slug: string): Promise<{ ok: boolean }> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { ok: false }
  const db = await createClient()
  if (!(await getUser(db))) return { ok: false }
  const { error } = await db.from('shares').delete().eq('slug', slug) // RLS: creator only
  return { ok: !error }
}
```

- [ ] **Step 4: Clip page, OG image and view**

`components/meeting/ClipView.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PlaybackStore } from '@/lib/playback'
import type { Clip } from '@/lib/clip'
import type { ParticipantRow, SegmentRow } from '@/lib/types'
import { Player } from './Player'
import { Transcript } from './Transcript'

export function ClipView({ clip }: { clip: Clip }) {
  const duration = clip.end_ms - clip.start_ms
  const { participants, segments } = useMemo(() => {
    const names = [...new Set(clip.segments.map((s) => s.speaker))]
    const participants: ParticipantRow[] = names.map((n) => ({
      id: n, name: n, role: '', is_internal: true, talk_time_sec: 0, questions: 0, longest_monologue_sec: 0,
    }))
    const segments: SegmentRow[] = clip.segments.map((s, i) => ({
      idx: i,
      participant_id: s.speaker,
      start_ms: Math.max(0, s.start_ms - clip.start_ms),
      end_ms: Math.min(duration, s.end_ms - clip.start_ms),
      text: s.text,
    }))
    return { participants, segments }
  }, [clip, duration])
  const [store] = useState(() => new PlaybackStore(duration))

  useEffect(
    () =>
      store.subscribe(() => {
        if (!store.playing && store.ms >= store.durationMs) {
          store.seek(0)
          store.play() // loop the clip
        }
      }),
    [store],
  )

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header>
        <p className="text-sm text-muted">Shared clip</p>
        <h1 className="text-2xl font-semibold">{clip.title}</h1>
      </header>
      <Player store={store} participants={participants} segments={segments} chapters={[]} highlights={[]} />
      <Transcript store={store} segments={segments} participants={participants} highlights={[]} />
      <Link
        href={`/meetings/${clip.meeting_slug}?t=${clip.start_ms}`}
        className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        View the full meeting
      </Link>
    </div>
  )
}
```

`app/clip/[slug]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ClipView } from '@/components/meeting/ClipView'
import { getClip } from '@/lib/clip'
import { createAnonClient } from '@/lib/supabase/anon'

const db = createAnonClient()

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const clip = await getClip(db, (await params).slug)
  if (!clip) return { title: 'Clip not found' }
  const quote = clip.segments[0]?.text.slice(0, 160) ?? 'A shared moment from a meeting'
  return { title: `${clip.title}: clip`, description: quote, openGraph: { title: clip.title, description: quote } }
}

export default async function ClipPage({ params }: { params: Promise<{ slug: string }> }) {
  const clip = await getClip(db, (await params).slug)
  if (!clip) notFound()
  return <ClipView clip={clip} />
}
```

`app/clip/[slug]/opengraph-image.tsx`:
```tsx
import { ImageResponse } from 'next/og'
import { getClip } from '@/lib/clip'
import { createAnonClient } from '@/lib/supabase/anon'

export const alt = 'Meeting clip'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// ImageResponse cannot read CSS variables: keep these hex values in sync with the design tokens.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const clip = await getClip(createAnonClient(), (await params).slug)
  const quote = clip?.segments[0] ? `“${clip.segments[0].text.slice(0, 180)}”` : 'This clip is no longer available'
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: 64, background: '#0e1013', color: '#eef1f5' }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#98a2b3' }}>Fathom Rebuild · Shared clip</div>
        <div style={{ display: 'flex', fontSize: 52, lineHeight: 1.25 }}>{quote}</div>
        <div style={{ display: 'flex', fontSize: 34, color: '#3b9eff' }}>{clip?.title ?? ''}</div>
      </div>
    ),
    size,
  )
}
```

- [ ] **Step 5: Wire sharing into the meeting page**

`app/meetings/[id]/page.tsx`: after `bundle` is loaded add
```tsx
  const shares = user ? await getMyShares(db, bundle.meeting.id) : []
```
(import `getMyShares` from `@/lib/queries`) and pass `shares={shares}` to `<MeetingView ... />`.

`components/meeting/MeetingView.tsx`:
1. Add to `MeetingViewProps`: `shares: ShareRow[]` (import `ShareRow` from `@/lib/types`) and destructure `shares: initialShares` in the function signature.
2. Add imports: `import { createShare, deleteShare } from '@/app/meetings/[id]/actions'` (extend the existing actions import), `import { Button } from '@/components/ui/Button'`, `import { expandToRun } from '@/lib/speaker-runs'` (extend the existing `findActiveIdx` import).
3. Add state `const [shares, setShares] = useState<ShareRow[]>(initialShares)`.
4. Add these functions after `removeHighlight`:
```tsx
  const shareWindow = useCallback(
    async (start_ms: number, end_ms: number) => {
      if (!userId) return setSignIn('Sign in with Google to share clips.')
      const res = await createShare({ meetingSlug: meeting.slug, start_ms, end_ms })
      if (!res.ok) {
        toast(res.error === 'limit' ? 'Daily clip limit reached (20)' : 'Could not create the clip link')
        return
      }
      setShares((s) => [res.share, ...s])
      try {
        await navigator.clipboard.writeText(`${location.origin}${res.path}`)
        toast('Clip link copied')
      } catch {
        toast(`Clip link: ${location.origin}${res.path}`)
      }
    },
    [userId, meeting.slug],
  )

  const shareMoment = () => {
    const run = expandToRun(segments, findActiveIdx(segments, store.ms))
    if (run) shareWindow(run.start_ms, run.end_ms)
  }

  const removeShare = async (slug: string) => {
    setShares((s) => s.filter((x) => x.slug !== slug))
    if (!(await deleteShare(slug)).ok) toast('Could not delete the link')
  }
```
5. Pass the share button to the player: `<Player ... extra={<Button size="sm" variant="secondary" onClick={shareMoment}>Share moment</Button>} />`.
6. Pass `onShare={(h) => shareWindow(h.start_ms, h.end_ms)}` to `<HighlightsTab ...>` and, below the tab's list inside the same tab `content`, render the user's links. Replace the highlights tab entry's `content` with:
```tsx
      content: (
        <div className="space-y-6">
          <HighlightsTab
            store={store}
            segments={segments}
            highlights={highlights}
            userId={userId}
            onDelete={removeHighlight}
            onShare={(h) => shareWindow(h.start_ms, h.end_ms)}
          />
          {shares.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Your shared clips</h3>
              <ul className="space-y-1 text-sm">
                {shares.map((s) => (
                  <li key={s.slug} className="flex items-center justify-between gap-2">
                    <a className="truncate text-accent underline" href={`/clip/${s.slug}`}>/clip/{s.slug}</a>
                    <Button size="sm" variant="ghost" onClick={() => removeShare(s.slug)}>Delete</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ),
```
7. Pass `onShare` to the transcript: `<Transcript ... onShare={shareWindow} />`.

`components/meeting/Transcript.tsx`: add prop `onShare?: (start_ms: number, end_ms: number) => void`; add state `const [sel, setSel] = useState<{ a: number; b: number } | null>(null)`; add on the scrolling `div` the handler
```tsx
          onMouseUp={() => {
            const s = window.getSelection()
            if (!s || s.isCollapsed) return setSel(null)
            const idxOf = (n: Node | null) => {
              const el = (n instanceof Element ? n : n?.parentElement)?.closest('[data-idx]')
              return el ? Number(el.getAttribute('data-idx')) : null
            }
            const a = idxOf(s.anchorNode)
            const b = idxOf(s.focusNode)
            setSel(a === null || b === null ? null : { a: Math.min(a, b), b: Math.max(a, b) })
          }}
```
change the row click handler to `onClick={() => { if (window.getSelection()?.isCollapsed === false) return; store.seek(s.start_ms) }}`, and render next to the filters (inside the toolbar row):
```tsx
        {onShare && sel && (
          <Button size="sm" variant="secondary" onClick={() => { onShare(segments[sel.a].start_ms, segments[sel.b].end_ms); setSel(null) }}>
            Share selection
          </Button>
        )}
```
(segments are ordered with `idx === position`, so `segments[sel.a]` is the right row.)

- [ ] **Step 6: Seed demo clips for the walkthrough and the smoke test**

`scripts/seed-clips.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const EMAIL = 'demo-clips@example.test'

async function ownerId(): Promise<string> {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const found = data.users.find((u) => u.email === EMAIL)
  if (found) return found.id
  const { data: created, error } = await db.auth.admin.createUser({
    email: EMAIL, password: crypto.randomUUID(), email_confirm: true,
  })
  if (error) throw error
  return created.user.id
}

async function main() {
  const owner = await ownerId()
  const { data: m } = await db.from('meetings').select('id').eq('slug', 'q4-planning').single()
  const { data: hs } = await db.from('highlights').select('start_ms,end_ms,title')
    .eq('meeting_id', m!.id).is('user_id', null).order('start_ms').limit(2)
  const slugs = ['demo-q4-clip', 'demo-q4-clip-2']
  for (const [i, h] of (hs ?? []).entries()) {
    const { error } = await db.from('shares').upsert(
      { slug: slugs[i], meeting_id: m!.id, start_ms: h.start_ms, end_ms: h.end_ms, created_by: owner },
      { onConflict: 'slug' },
    )
    if (error) throw error
    console.log(`clip /clip/${slugs[i]}: ${h.title}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
```
Add to `package.json` scripts: `"seed:clips": "tsx --env-file=.env.local scripts/seed-clips.ts"`. Run `npm run seed:clips`. Expected: two `clip /clip/demo-q4-clip...` lines.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npx vitest run && npm run build && npm run dev`.
- Signed out, open `/clip/demo-q4-clip` in a fresh private window: the clip loads with player, only the window's transcript, and a "View the full meeting" link; press Play: it loops at the end; the page source contains `og:title`; `/clip/does-not-exist` shows the friendly 404; open `/clip/demo-q4-clip/opengraph-image` and confirm a PNG renders with the quote.
- Signed in: "Share moment" and a highlight's "Share clip" copy a link and add it under "Your shared clips"; opening that link in a private window works with no sign-in; deleting the link makes it 404; selecting a few transcript lines shows "Share selection". Signed out, "Share moment" opens the sign-in dialog.
- Confirm the clip page leaks nothing beyond the window: in the page's data (view source or network), the transcript contains only lines from the clip window and no `created_by`.

- [ ] **Step 8: Commit**

```bash
git add lib app components scripts package.json tests/share.test.ts
git commit -m "feat: shareable clips, public clip page with OG image, demo clips" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 25: Global search results

**Files:**
- Create: `lib/snippet.ts`, `app/search/page.tsx`, `tests/snippet.test.ts`

**Interfaces:**
- Consumes: `searchSegments` (Task 16), `formatMs`.
- Produces: `splitMarks(snippet): { text: string; mark: boolean }[]`, `stripMarks(snippet): string`, `normalizeQuery(raw: string | string[] | undefined): string` (trims, collapses whitespace, caps at 200 characters), `toOrQuery(question: string): string` (used by Ask in Task 26); the `/search?q=` page.

- [ ] **Step 1: Write the failing test**

`tests/snippet.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeQuery, splitMarks, stripMarks, toOrQuery } from '@/lib/snippet'

describe('splitMarks', () => {
  it('splits highlighted terms from plain text', () => {
    expect(splitMarks('we <mark>budget</mark> review')).toEqual([
      { text: 'we ', mark: false }, { text: 'budget', mark: true }, { text: ' review', mark: false },
    ])
  })
  it('keeps other angle brackets as plain text (never interpreted as HTML)', () => {
    expect(splitMarks('use <script>x</script> and <mark>y</mark>')).toEqual([
      { text: 'use <script>x</script> and ', mark: false }, { text: 'y', mark: true },
    ])
  })
  it('handles no marks and empty input', () => {
    expect(splitMarks('plain')).toEqual([{ text: 'plain', mark: false }])
    expect(splitMarks('')).toEqual([])
  })
})

describe('stripMarks', () => {
  it('removes only mark tags', () => expect(stripMarks('a <mark>b</mark> c')).toBe('a b c'))
})

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => expect(normalizeQuery('  a   b \n c ')).toBe('a b c'))
  it('caps at 200 characters', () => expect(normalizeQuery('x'.repeat(500))).toHaveLength(200))
  it('handles missing, empty and array input', () => {
    expect(normalizeQuery(undefined)).toBe('')
    expect(normalizeQuery('   ')).toBe('')
    expect(normalizeQuery(['first', 'second'])).toBe('first')
  })
})

describe('toOrQuery', () => {
  it('turns a question into an OR query of its content words', () => {
    expect(toOrQuery('What did we decide about pricing?')).toBe('what or did or decide or about or pricing')
  })
  it('dedupes, drops short words and falls back to the raw text', () => {
    expect(toOrQuery('pricing pricing is ok')).toBe('pricing')
    expect(toOrQuery('a an')).toBe('a an')
  })
})
```
Run: `npx vitest run tests/snippet.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/snippet.ts`**

```ts
export type SnippetPart = { text: string; mark: boolean }

// ts_headline wraps hits in <mark>; anything else is plain text, so transcript text is never trusted as HTML.
export function splitMarks(snippet: string): SnippetPart[] {
  const out: SnippetPart[] = []
  let last = 0
  for (const m of snippet.matchAll(/<mark>([\s\S]*?)<\/mark>/g)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: snippet.slice(last, at), mark: false })
    out.push({ text: m[1], mark: true })
    last = at + m[0].length
  }
  if (last < snippet.length) out.push({ text: snippet.slice(last), mark: false })
  return out
}

export const stripMarks = (snippet: string) => snippet.replace(/<\/?mark>/g, '')

export function normalizeQuery(raw: string | string[] | undefined): string {
  const s = Array.isArray(raw) ? raw[0] : raw
  return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
}

// Natural-language questions rarely match every word; retrieve on any content word instead.
export function toOrQuery(question: string): string {
  const words = [...new Set((question.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => w.length > 2))].slice(0, 8)
  return words.length ? words.join(' or ') : question
}
```
Run the test again. Expected: PASS.

- [ ] **Step 3: The search page**

`app/search/page.tsx`:
```tsx
import Link from 'next/link'
import { formatMs } from '@/lib/format'
import { searchSegments } from '@/lib/queries'
import { normalizeQuery, splitMarks } from '@/lib/snippet'
import { createClient } from '@/lib/supabase/server'
import type { SearchHit } from '@/lib/types'

const SUGGESTIONS = ['budget', 'deadline', 'customer', 'rollback', 'onboarding']

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const q = normalizeQuery((await searchParams).q)
  const hits = q ? await searchSegments(await createClient(), q, {}, 40) : []
  const groups = new Map<string, { title: string; hits: SearchHit[] }>()
  for (const h of hits) {
    const g = groups.get(h.meeting_slug) ?? { title: h.meeting_title, hits: [] }
    g.hits.push(h)
    groups.set(h.meeting_slug, g)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{q ? <>Results for “{q}”</> : 'Search call recordings'}</h1>
      {!q && (
        <div className="space-y-2">
          <p className="text-muted">Search every transcript. Try:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-border px-3 py-1 text-sm hover:bg-surface-2">
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
      {q && hits.length === 0 && (
        <p className="text-muted">No matches. Try fewer or different words, or one of: {SUGGESTIONS.join(', ')}.</p>
      )}
      {[...groups.entries()].map(([slug, g]) => (
        <section key={slug}>
          <h2 className="mb-2 font-medium">{g.title}</h2>
          <ul className="space-y-2">
            {g.hits.map((h) => (
              <li key={`${slug}-${h.segment_idx}`}>
                <Link
                  href={`/meetings/${slug}?t=${h.start_ms}`}
                  className="block rounded-lg border border-border bg-surface p-3 text-sm transition hover:border-accent"
                >
                  <span className="text-xs text-muted">{h.speaker} · {formatMs(h.start_ms)}</span>
                  <p>
                    {splitMarks(h.snippet).map((p, i) =>
                      p.mark ? <mark key={i} className="rounded bg-accent/30 text-fg">{p.text}</mark> : <span key={i}>{p.text}</span>,
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run && npm run dev`.
Expected: typing a word from the header bar (for example `budget`) lists matches grouped by meeting, each with speaker, `m:ss` and highlighted terms; clicking a result opens the meeting at that moment (`?t=` set, transcript scrolled to the line once played or sought). `/search?q=!!!`, `/search?q="` and a 500-character query show "No matches" with no error; `/search` shows suggestions.

- [ ] **Step 5: Commit**

```bash
git add lib/snippet.ts app/search tests/snippet.test.ts
git commit -m "feat: global search with highlighted snippets and deep links" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 26: Ask Fathom

**Files:**
- Create: `lib/ask.ts`, `lib/ask-db.ts`, `app/api/ask/route.ts`, `components/AskPanel.tsx`, `tests/ask.test.ts`
- Modify: `app/meetings/page.tsx`, `app/team/page.tsx`, `components/meeting/MeetingView.tsx`

**Interfaces:**
- Consumes: `LlmClient`, `completeJson`, `anthropicClient` (Task 7), `liveAskPrompt`, `SYSTEM_ANALYST` (Task 10), `liveAskSchema` (Task 5), `toOrQuery`, `stripMarks` (Task 25), `listAskAnswers`, `searchSegments`, `getDemoPersona` (Task 16), `createAdminClient` (Task 15).
- Produces: `type AskScope = { kind: 'my_calls' } | { kind: 'team_calls' } | { kind: 'meeting'; slug: string }`; `type AskCite = { meeting_slug: string; start_ms: number; label: string }`; `type AskResult = { mode: 'suggested' | 'live' | 'extractive'; text: string; citations: AskCite[]; notice?: string }`; `interface AskDb { suggested(prompt): Promise<AskAnswerRow | null>; search(query, scope, max): Promise<SearchHit[]>; notes(scope): Promise<string>; usageCount(userId, sinceIso): Promise<number>; recordUsage(userId): Promise<void> }`; `ask(deps: { llm: LlmClient | null; userId: string | null; db: AskDb; now?: () => Date }, input: { question: string; scope: AskScope }): Promise<AskResult>`; `ASK_LIMIT_PER_HOUR = 10`; `POST /api/ask`; `<AskPanel scopes defaultScope prompts embedded? />`.

- [ ] **Step 1: Write the failing test**

`tests/ask.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ask, ASK_LIMIT_PER_HOUR, type AskDb, type AskScope } from '@/lib/ask'
import type { LlmClient } from '@/lib/llm'
import type { SearchHit } from '@/lib/types'

const hit = (idx: number): SearchHit => ({
  meeting_id: 'm1', meeting_slug: 'q4', meeting_title: 'Q4 Planning', segment_idx: idx,
  start_ms: idx * 1000, speaker: 'Priya', snippet: `we should <mark>ship</mark> ${idx}`, rank: 1,
})

function makeDb(over: Partial<AskDb> & { hits?: SearchHit[] } = {}) {
  const calls = { search: [] as { q: string; scope: AskScope }[], usage: 0 }
  const db: AskDb = {
    suggested: async (p) =>
      p === 'Summarize my recent meetings'
        ? { id: '1', prompt: p, scope: 'my_calls', answer: { text: 'Canned summary', citations: [{ meeting_slug: 'q4', segment_idx: 1, start_ms: 1000, label: 'Kickoff' }] } }
        : null,
    search: async (q, scope) => { calls.search.push({ q, scope }); return over.hits ?? [hit(3), hit(5)] },
    notes: async () => 'notes',
    usageCount: async () => 0,
    recordUsage: async () => { calls.usage++ },
    ...over,
  }
  return { db, calls }
}
const llm = (reply: string): LlmClient & { n: number } => ({ n: 0, async complete() { this.n++; return reply } })
const throwing: LlmClient = { async complete() { throw new Error('boom') } }
const scope: AskScope = { kind: 'my_calls' }

describe('ask', () => {
  it('answers a suggested prompt from the seed with no model call, even with a failing model', async () => {
    const { db } = makeDb()
    const r = await ask({ llm: throwing, userId: 'u', db }, { question: 'Summarize my recent meetings', scope })
    expect(r).toMatchObject({ mode: 'suggested', text: 'Canned summary' })
    expect(r.citations[0]).toEqual({ meeting_slug: 'q4', start_ms: 1000, label: 'Kickoff' })
  })
  it('falls back to extractive matches when no key is configured', async () => {
    const { db } = makeDb()
    const r = await ask({ llm: null, userId: 'u', db }, { question: 'what about shipping', scope })
    expect(r.mode).toBe('extractive')
    expect(r.notice).toContain('ANTHROPIC_API_KEY')
    expect(r.citations.map((c) => c.start_ms)).toEqual([3000, 5000])
    expect(r.citations[0].label).not.toContain('<mark>')
  })
  it('asks signed-out visitors to sign in and still returns matches', async () => {
    const { db } = makeDb()
    const r = await ask({ llm: llm('{}'), userId: null, db }, { question: 'ship it', scope })
    expect(r.mode).toBe('extractive')
    expect(r.notice).toContain('Sign in')
  })
  it('stops at the hourly limit without calling the model', async () => {
    const m = llm('{"text":"x","refs":[]}')
    const { db } = makeDb({ usageCount: async () => ASK_LIMIT_PER_HOUR })
    const r = await ask({ llm: m, userId: 'u', db }, { question: 'ship it', scope })
    expect(r.mode).toBe('extractive')
    expect(r.notice).toContain('limit')
    expect(m.n).toBe(0)
  })
  it('returns a live answer, maps refs to moments, drops unknown refs and records usage', async () => {
    const m = llm('```json\n{"text":"You decided to ship.","refs":["q4#3","q4#999"]}\n```')
    const { db, calls } = makeDb()
    const r = await ask({ llm: m, userId: 'u', db }, { question: 'what did we decide about shipping?', scope })
    expect(r.mode).toBe('live')
    expect(r.text).toBe('You decided to ship.')
    expect(r.citations).toHaveLength(1)
    expect(r.citations[0]).toMatchObject({ meeting_slug: 'q4', start_ms: 3000 })
    expect(calls.usage).toBe(1)
  })
  it('records usage and falls back when the model fails', async () => {
    const { db, calls } = makeDb()
    const r = await ask({ llm: throwing, userId: 'u', db }, { question: 'ship it', scope })
    expect(r.mode).toBe('extractive')
    expect(r.notice).toContain('failed')
    expect(calls.usage).toBe(1)
  })
  it('passes the scope through and searches with an OR query', async () => {
    const { db, calls } = makeDb()
    await ask({ llm: null, userId: null, db }, { question: 'What did we decide about pricing?', scope: { kind: 'meeting', slug: 'q4' } })
    expect(calls.search[0].scope).toEqual({ kind: 'meeting', slug: 'q4' })
    expect(calls.search[0].q).toContain(' or ')
  })
  it('says so when nothing matches', async () => {
    const { db } = makeDb({ hits: [] })
    const r = await ask({ llm: null, userId: null, db }, { question: 'zzzz qqqq', scope })
    expect(r.text).toContain('No matching moments')
    expect(r.citations).toEqual([])
  })
})
```
Run: `npx vitest run tests/ask.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/ask.ts`**

```ts
import { formatMs } from './format'
import { completeJson, type LlmClient } from './llm'
import { liveAskPrompt, SYSTEM_ANALYST } from './prompts'
import { liveAskSchema } from './schema'
import { stripMarks, toOrQuery } from './snippet'
import type { AskAnswerRow, SearchHit } from './types'

export type AskScope = { kind: 'my_calls' } | { kind: 'team_calls' } | { kind: 'meeting'; slug: string }
export type AskCite = { meeting_slug: string; start_ms: number; label: string }
export type AskResult = { mode: 'suggested' | 'live' | 'extractive'; text: string; citations: AskCite[]; notice?: string }

export interface AskDb {
  suggested(prompt: string): Promise<AskAnswerRow | null>
  search(query: string, scope: AskScope, max: number): Promise<SearchHit[]>
  notes(scope: AskScope): Promise<string>
  usageCount(userId: string, sinceIso: string): Promise<number>
  recordUsage(userId: string): Promise<void>
}
export type AskDeps = { llm: LlmClient | null; userId: string | null; db: AskDb; now?: () => Date }
export const ASK_LIMIT_PER_HOUR = 10

function extractive(question: string, hits: SearchHit[], notice: string): AskResult {
  if (hits.length === 0) return { mode: 'extractive', text: 'No matching moments found in these calls.', citations: [], notice }
  return {
    mode: 'extractive',
    text: `Closest moments for “${question}”:`,
    citations: hits.slice(0, 5).map((h) => ({
      meeting_slug: h.meeting_slug,
      start_ms: h.start_ms,
      label: `${h.meeting_title}: ${h.speaker}, ${stripMarks(h.snippet)}`,
    })),
    notice,
  }
}

export async function ask(deps: AskDeps, input: { question: string; scope: AskScope }): Promise<AskResult> {
  const question = input.question.trim()

  const canned = await deps.db.suggested(question)
  if (canned) {
    return {
      mode: 'suggested',
      text: canned.answer.text,
      citations: canned.answer.citations.map((c) => ({ meeting_slug: c.meeting_slug, start_ms: c.start_ms, label: c.label })),
    }
  }

  const hits = await deps.db.search(toOrQuery(question), input.scope, 8)
  if (!deps.llm) return extractive(question, hits, 'Live answers need an ANTHROPIC_API_KEY on the server. Showing the closest moments instead.')
  if (!deps.userId) return extractive(question, hits, 'Sign in with Google to get live answers. Showing the closest moments instead.')

  const since = new Date((deps.now?.() ?? new Date()).getTime() - 3_600_000).toISOString()
  if ((await deps.db.usageCount(deps.userId, since)) >= ASK_LIMIT_PER_HOUR) {
    return extractive(question, hits, 'Hourly live-answer limit reached. Showing the closest moments instead.')
  }
  await deps.db.recordUsage(deps.userId) // count the attempt before spending tokens

  try {
    const byRef = new Map(hits.map((h) => [`${h.meeting_slug}#${h.segment_idx}`, h]))
    const excerpts = hits
      .map((h) => `[${h.meeting_slug}#${h.segment_idx} @ ${formatMs(h.start_ms)}] ${h.speaker}: ${stripMarks(h.snippet)}`)
      .join('\n')
    const notes = await deps.db.notes(input.scope)
    const out = await completeJson(
      deps.llm,
      { system: SYSTEM_ANALYST, prompt: liveAskPrompt(question, `${notes}\n\n${excerpts}`), maxTokens: 1500 },
      liveAskSchema,
    )
    const citations = out.refs.flatMap((r) => {
      const h = byRef.get(r)
      return h ? [{ meeting_slug: h.meeting_slug, start_ms: h.start_ms, label: `${h.speaker} at ${formatMs(h.start_ms)}` }] : []
    })
    return { mode: 'live', text: out.text, citations }
  } catch {
    return extractive(question, hits, 'The live answer failed. Showing the closest moments instead.')
  }
}
```
Run: `npx vitest run tests/ask.test.ts`. Expected: PASS (8 tests).

- [ ] **Step 3: The Supabase-backed `AskDb` and the route**

`lib/ask-db.ts`:
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AskDb, AskScope } from './ask'
import { getDemoPersona, listAskAnswers, searchSegments } from './queries'
import { createAdminClient } from './supabase/admin'

async function scopeFilter(db: SupabaseClient, scope: AskScope): Promise<{ hostId?: string; meetingId?: string }> {
  if (scope.kind === 'team_calls') return {}
  if (scope.kind === 'my_calls') return { hostId: (await getDemoPersona(db))?.id }
  const { data } = await db.from('meetings').select('id').eq('slug', scope.slug).maybeSingle()
  return { meetingId: data?.id ?? '00000000-0000-0000-0000-000000000000' }
}

export function makeAskDb(db: SupabaseClient): AskDb {
  const admin = createAdminClient()
  return {
    async suggested(prompt) {
      const all = await listAskAnswers(db)
      const norm = (s: string) => s.trim().toLowerCase()
      return all.find((a) => norm(a.prompt) === norm(prompt)) ?? null
    },
    async search(query, scope, max) {
      return searchSegments(db, query, await scopeFilter(db, scope), max)
    },
    async notes(scope) {
      const f = await scopeFilter(db, scope)
      let q = db.from('meetings').select('id,title')
      if (f.hostId) q = q.eq('host_id', f.hostId)
      if (f.meetingId) q = q.eq('id', f.meetingId)
      const { data: meetings } = await q
      const ids = (meetings ?? []).map((m) => m.id)
      if (ids.length === 0) return ''
      const { data: sums } = await db.from('summaries').select('meeting_id,content').in('meeting_id', ids).eq('template', 'general').is('user_id', null)
      const title = new Map((meetings ?? []).map((m) => [m.id, m.title]))
      return (sums ?? [])
        .map((s) => `## ${title.get(s.meeting_id)}\n${(s.content as { sections: { heading: string; bullets: string[] }[] }).sections.flatMap((x) => x.bullets).join('\n')}`)
        .join('\n\n')
        .slice(0, 6000)
    },
    async usageCount(userId, sinceIso) {
      const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('kind', 'ask').gte('created_at', sinceIso)
      return count ?? 0
    },
    async recordUsage(userId) {
      await admin.from('ai_usage').insert({ user_id: userId, kind: 'ask' })
    },
  }
}
```

`app/api/ask/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ask } from '@/lib/ask'
import { makeAskDb } from '@/lib/ask-db'
import { getUser } from '@/lib/auth'
import { anthropicClient } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'

const body = z.object({
  question: z.string().trim().min(1).max(500),
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('my_calls') }),
    z.object({ kind: z.literal('team_calls') }),
    z.object({ kind: z.literal('meeting'), slug: z.string().min(1).max(100) }),
  ]),
})

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const db = await createClient()
  const user = await getUser(db)
  const key = process.env.ANTHROPIC_API_KEY
  const result = await ask(
    { llm: key ? anthropicClient(key) : null, userId: user?.id ?? null, db: makeAskDb(db) },
    parsed.data,
  )
  return NextResponse.json(result)
}
```

- [ ] **Step 4: The panel**

`components/AskPanel.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { AskResult } from '@/lib/ask'
import { formatMs } from '@/lib/format'

type Msg = { role: 'user'; text: string } | { role: 'ai'; result: AskResult }
type Props = {
  scopes: { value: string; label: string }[]
  defaultScope: string
  prompts: string[]
  embedded?: boolean
}

const parseScope = (v: string) => (v.startsWith('meeting:') ? { kind: 'meeting', slug: v.slice(8) } : { kind: v })

export function AskPanel({ scopes, defaultScope, prompts, embedded = false }: Props) {
  const [open, setOpen] = useState(true)
  const [scope, setScope] = useState(defaultScope)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  async function send(question: string) {
    const text = question.trim()
    if (!text || busy) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setQ('')
    setBusy(true)
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text, scope: parseScope(scope) }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setMsgs((m) => [...m, { role: 'ai', result: (await r.json()) as AskResult }])
    } catch {
      setMsgs((m) => [...m, { role: 'ai', result: { mode: 'extractive', text: 'Something went wrong. Try again.', citations: [] } }])
    } finally {
      setBusy(false)
    }
  }

  if (!embedded && !open) {
    return <Button size="sm" variant="secondary" className="self-start" onClick={() => setOpen(true)}>Ask Fathom</Button>
  }

  return (
    <aside aria-label="Ask Fathom" className={`flex flex-col gap-3 rounded-card border border-border bg-surface p-4 ${embedded ? '' : 'w-full lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:w-[360px] lg:self-start'}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Ask Fathom</h2>
        {!embedded && <Button size="sm" variant="ghost" aria-label="Collapse Ask Fathom" onClick={() => setOpen(false)}>Hide</Button>}
      </div>
      <div className="min-h-24 space-y-3 overflow-y-auto text-sm">
        {msgs.length === 0 && <p className="text-muted">Ask anything about {scopes.find((s) => s.value === scope)?.label.toLowerCase() ?? 'your calls'}.</p>}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <p key={i} className="ml-6 rounded-lg bg-surface-2 p-2">{m.text}</p>
          ) : (
            <div key={i} className="space-y-1">
              <p className="whitespace-pre-wrap">{m.result.text}</p>
              {m.result.notice && <p className="text-xs italic text-muted">{m.result.notice}</p>}
              <ul className="space-y-1">
                {m.result.citations.map((c, j) => (
                  <li key={j}>
                    <Link href={`/meetings/${c.meeting_slug}?t=${c.start_ms}`} className="text-xs text-accent underline">
                      {formatMs(c.start_ms)} · {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
        {busy && <p className="text-muted">Thinking…</p>}
      </div>
      {prompts.length > 0 && !scope.startsWith('meeting:') && (
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button key={p} onClick={() => send(p)} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-2">{p}</button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(q) }} className="flex flex-col gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={500}
          placeholder="Ask anything…"
          aria-label="Ask a question"
          className="h-10 rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-muted"
        />
        <div className="flex items-center justify-between gap-2">
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope" className="h-8 rounded-lg border border-border bg-bg px-2 text-xs">
            {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Button type="submit" size="sm" variant="primary" disabled={busy || !q.trim()}>Ask</Button>
        </div>
      </form>
    </aside>
  )
}
```

- [ ] **Step 5: Mount the panel**

Replace `app/meetings/page.tsx`:
```tsx
import { AskPanel } from '@/components/AskPanel'
import { MeetingCard } from '@/components/MeetingCard'
import { UpcomingEvents } from '@/components/UpcomingEvents'
import { groupByMonth } from '@/lib/group'
import { getDemoPersona, listAskAnswers, listMeetings, listUpcoming } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function MeetingsPage() {
  const db = await createClient()
  const persona = await getDemoPersona(db)
  const [meetings, events, answers] = await Promise.all([
    listMeetings(db, { hostId: persona?.id }),
    listUpcoming(db),
    listAskAnswers(db),
  ])
  const groups = groupByMonth(meetings)
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <UpcomingEvents events={events} />
        {groups.map((g) => (
          <section key={g.label} className="mb-10">
            <h2 className="mb-4 text-xl font-semibold">{g.label}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((m) => <MeetingCard key={m.id} m={m} />)}
            </div>
          </section>
        ))}
        {meetings.length === 0 && <p className="text-muted">No calls yet. Run `npm run seed:load`.</p>}
      </div>
      <AskPanel
        scopes={[{ value: 'my_calls', label: 'My Calls' }, { value: 'team_calls', label: 'Team Calls' }]}
        defaultScope="my_calls"
        prompts={answers.map((a) => a.prompt)}
      />
    </div>
  )
}
```

`app/team/page.tsx`: import `AskPanel` and `listAskAnswers`; load `const answers = await listAskAnswers(db)` in the existing `Promise.all`; replace the outermost opening tag `<div className="mx-auto max-w-7xl space-y-8 px-4 py-6">` with
```tsx
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-8">
```
and, immediately before the final closing `</div>` of the component, close the inner div and mount the panel:
```tsx
      </div>
      <AskPanel
        scopes={[{ value: 'team_calls', label: 'Team Calls' }, { value: 'my_calls', label: 'My Calls' }]}
        defaultScope="team_calls"
        prompts={answers.map((a) => a.prompt)}
      />
```

`components/meeting/MeetingView.tsx`: import `AskPanel` and add this tab entry at the end of the `tabs` array:
```tsx
    {
      id: 'ask',
      label: 'Ask',
      content: (
        <AskPanel embedded scopes={[{ value: `meeting:${meeting.slug}`, label: 'This meeting' }]} defaultScope={`meeting:${meeting.slug}`} prompts={[]} />
      ),
    },
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npx vitest run && npm run build && npm run dev`.
- `/meetings`: the Ask Fathom panel shows three suggested chips. Click "Summarize my recent meetings": an answer appears instantly with citation links; clicking a citation opens the meeting at that moment. "Hide" collapses it to a button.
- Type a free-text question such as `what did we decide about pricing?` with no `ANTHROPIC_API_KEY` set: the panel shows "Closest moments for …" with citations and the italic notice that live answers need a key; the input is never dead. Signed-out: same, with the sign-in notice if a key is set.
- On a meeting page, the Ask tab (scope "This meeting") returns only moments from that meeting.
- If an `ANTHROPIC_API_KEY` is available, set it in `.env.local`, sign in, and confirm a live answer with citations appears; without a key this path is verified only by the stubbed unit tests, and the README says so.

- [ ] **Step 7: Commit**

```bash
git add lib/ask.ts lib/ask-db.ts app components tests/ask.test.ts
git commit -m "feat: Ask Fathom with seeded answers, live mode and extractive fallback" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 27: Live summary regeneration

**Files:**
- Create: `lib/regenerate.ts`, `lib/regenerate-db.ts`, `app/api/regenerate/route.ts`, `tests/regenerate.test.ts`
- Modify: `components/meeting/MeetingView.tsx`

**Interfaces:**
- Consumes: `LlmClient`, `completeJson` (Task 7), `summaryPrompt`, `formatTranscript`, `SYSTEM_ANALYST`, `TLine` (Task 10), `summaryContentSchema`, `Template`, `TEMPLATES` (Task 5), `Regen` type (Task 22), `createAdminClient`, `selectAll`.
- Produces: `class RegenError extends Error { code: 'no_key' | 'no_session' | 'rate_limited' | 'not_found' | 'llm_failed' }`; `interface RegenDb { transcript(slug): Promise<{ meetingId: string; title: string; startedAt: string; lines: TLine[] } | null>; usageCount(userId, sinceIso): Promise<number>; recordUsage(userId): Promise<void>; saveSummary(row: { meetingId: string; template: Template; userId: string; content: SummaryContent; model: string }): Promise<void> }`; `regenerate(deps: { llm: LlmClient | null; userId: string | null; db: RegenDb; model?: string; now?: () => Date }, input: { meetingSlug: string; template: Template }): Promise<SummaryContent>`; `REGEN_LIMIT_PER_HOUR = 5`; `POST /api/regenerate` returning `{ content }` or an error status (503 no key, 401 no session, 429 rate limited, 404 not found, 502 model failed).

- [ ] **Step 1: Write the failing test**

`tests/regenerate.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { LlmClient } from '@/lib/llm'
import { regenerate, REGEN_LIMIT_PER_HOUR, RegenError, type RegenDb } from '@/lib/regenerate'

const good = JSON.stringify({ sections: [{ heading: 'Overview', bullets: ['They met.'] }] })
const seq = (...replies: string[]): LlmClient & { n: number } => {
  let i = 0
  return { n: 0, async complete() { this.n++; return replies[Math.min(i++, replies.length - 1)] } }
}

function makeDb(over: Partial<RegenDb> = {}) {
  const log = { saved: [] as unknown[], usage: 0 }
  const db: RegenDb = {
    transcript: async () => ({ meetingId: 'm1', title: 'T', startedAt: '2026-10-03T10:00:00Z', lines: [{ idx: 0, speaker: 'A', text: 'hello there' }] }),
    usageCount: async () => 0,
    recordUsage: async () => { log.usage++ },
    saveSummary: async (row) => { log.saved.push(row) },
    ...over,
  }
  return { db, log }
}
const input = { meetingSlug: 'q4', template: 'sales' as const }
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof RegenError ? e.code : 'other'))

describe('regenerate', () => {
  it('saves a user-scoped summary and records usage', async () => {
    const { db, log } = makeDb()
    const out = await regenerate({ llm: seq(good), userId: 'u1', db }, input)
    expect(out.sections[0].heading).toBe('Overview')
    expect(log.saved).toEqual([{ meetingId: 'm1', template: 'sales', userId: 'u1', content: out, model: expect.any(String) }])
    expect(log.usage).toBe(1)
  })
  it('retries once on invalid JSON', async () => {
    const m = seq('not json', good)
    const { db } = makeDb()
    await regenerate({ llm: m, userId: 'u1', db }, input)
    expect(m.n).toBe(2)
  })
  it('throws llm_failed after two bad replies, saves nothing, still counts the attempt', async () => {
    const { db, log } = makeDb()
    expect(await code(regenerate({ llm: seq('bad', 'worse'), userId: 'u1', db }, input))).toBe('llm_failed')
    expect(log.saved).toHaveLength(0)
    expect(log.usage).toBe(1)
  })
  it('requires a key and a session', async () => {
    const { db } = makeDb()
    expect(await code(regenerate({ llm: null, userId: 'u1', db }, input))).toBe('no_key')
    expect(await code(regenerate({ llm: seq(good), userId: null, db }, input))).toBe('no_session')
  })
  it('enforces the hourly limit without calling the model', async () => {
    const m = seq(good)
    const { db } = makeDb({ usageCount: async () => REGEN_LIMIT_PER_HOUR })
    expect(await code(regenerate({ llm: m, userId: 'u1', db }, input))).toBe('rate_limited')
    expect(m.n).toBe(0)
  })
  it('reports an unknown meeting', async () => {
    const { db } = makeDb({ transcript: async () => null })
    expect(await code(regenerate({ llm: seq(good), userId: 'u1', db }, input))).toBe('not_found')
  })
})
```
Run: `npx vitest run tests/regenerate.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/regenerate.ts`**

```ts
import { completeJson, type LlmClient } from './llm'
import { formatTranscript, SYSTEM_ANALYST, summaryPrompt, type TLine } from './prompts'
import { summaryContentSchema, type SummaryContent, type Template } from './schema'

export type RegenErrorCode = 'no_key' | 'no_session' | 'rate_limited' | 'not_found' | 'llm_failed'
export class RegenError extends Error {
  constructor(readonly code: RegenErrorCode) {
    super(code)
  }
}

export interface RegenDb {
  transcript(slug: string): Promise<{ meetingId: string; title: string; startedAt: string; lines: TLine[] } | null>
  usageCount(userId: string, sinceIso: string): Promise<number>
  recordUsage(userId: string): Promise<void>
  saveSummary(row: { meetingId: string; template: Template; userId: string; content: SummaryContent; model: string }): Promise<void>
}
export const REGEN_LIMIT_PER_HOUR = 5

export async function regenerate(
  deps: { llm: LlmClient | null; userId: string | null; db: RegenDb; model?: string; now?: () => Date },
  input: { meetingSlug: string; template: Template },
): Promise<SummaryContent> {
  if (!deps.llm) throw new RegenError('no_key')
  if (!deps.userId) throw new RegenError('no_session')
  const since = new Date((deps.now?.() ?? new Date()).getTime() - 3_600_000).toISOString()
  if ((await deps.db.usageCount(deps.userId, since)) >= REGEN_LIMIT_PER_HOUR) throw new RegenError('rate_limited')
  const t = await deps.db.transcript(input.meetingSlug)
  if (!t) throw new RegenError('not_found')
  await deps.db.recordUsage(deps.userId) // count the attempt before spending tokens

  let content: SummaryContent
  try {
    content = await completeJson(
      deps.llm,
      {
        system: SYSTEM_ANALYST,
        prompt: summaryPrompt(input.template, { title: t.title, date: t.startedAt.slice(0, 10), transcript: formatTranscript(t.lines) }),
        maxTokens: 3000,
      },
      summaryContentSchema,
    )
  } catch {
    throw new RegenError('llm_failed')
  }
  await deps.db.saveSummary({
    meetingId: t.meetingId, template: input.template, userId: deps.userId, content,
    model: deps.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
  })
  return content
}
```
Run the test again. Expected: PASS (6 tests).

- [ ] **Step 3: DB adapter and route**

`lib/regenerate-db.ts`:
```ts
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAll } from './queries'
import type { RegenDb } from './regenerate'
import { createAdminClient } from './supabase/admin'

export function makeRegenDb(db: SupabaseClient): RegenDb {
  const admin = createAdminClient()
  return {
    async transcript(slug) {
      const { data: m } = await db.from('meetings').select('id,title,started_at').eq('slug', slug).maybeSingle()
      if (!m) return null
      const { data: ps } = await db.from('participants').select('id,name').eq('meeting_id', m.id)
      const name = new Map((ps ?? []).map((p) => [p.id, p.name as string]))
      const segs = await selectAll<{ idx: number; participant_id: string; text: string }>((from, to) =>
        db.from('segments').select('idx,participant_id,text').eq('meeting_id', m.id).order('idx').range(from, to))
      return {
        meetingId: m.id,
        title: m.title,
        startedAt: m.started_at,
        lines: segs.map((s) => ({ idx: s.idx, speaker: name.get(s.participant_id) ?? 'Unknown', text: s.text })),
      }
    },
    async usageCount(userId, sinceIso) {
      const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('kind', 'regenerate').gte('created_at', sinceIso)
      return count ?? 0
    },
    async recordUsage(userId) {
      await admin.from('ai_usage').insert({ user_id: userId, kind: 'regenerate' })
    },
    async saveSummary(row) {
      await admin.from('summaries').delete().eq('meeting_id', row.meetingId).eq('template', row.template).eq('user_id', row.userId)
      const { error } = await admin.from('summaries').insert({
        id: randomUUID(), meeting_id: row.meetingId, template: row.template, content: row.content,
        user_id: row.userId, source: 'live', model: row.model,
      })
      if (error) throw new Error(error.message)
    },
  }
}
```

`app/api/regenerate/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth'
import { anthropicClient } from '@/lib/llm'
import { regenerate, RegenError, type RegenErrorCode } from '@/lib/regenerate'
import { makeRegenDb } from '@/lib/regenerate-db'
import { TEMPLATES } from '@/lib/schema'
import { createClient } from '@/lib/supabase/server'

const body = z.object({ meetingSlug: z.string().min(1).max(100), template: z.enum(TEMPLATES) })
const STATUS: Record<RegenErrorCode, number> = { no_key: 503, no_session: 401, rate_limited: 429, not_found: 404, llm_failed: 502 }
const MESSAGE: Record<RegenErrorCode, string> = {
  no_key: 'Live regeneration is not configured on this server',
  no_session: 'Sign in to regenerate summaries',
  rate_limited: 'Hourly regeneration limit reached',
  not_found: 'Meeting not found',
  llm_failed: 'The model returned an invalid summary. The saved one is unchanged.',
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const db = await createClient()
  const user = await getUser(db)
  const key = process.env.ANTHROPIC_API_KEY
  try {
    const content = await regenerate(
      { llm: key ? anthropicClient(key) : null, userId: user?.id ?? null, db: makeRegenDb(db) },
      parsed.data,
    )
    return NextResponse.json({ content })
  } catch (e) {
    if (e instanceof RegenError) return NextResponse.json({ error: MESSAGE[e.code] }, { status: STATUS[e.code] })
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Wire the button**

In `components/meeting/MeetingView.tsx`: destructure `liveAiEnabled` in the props (`{ bundle, userId, initialMs, liveAiEnabled, shares: initialShares }`), import `type Template` and `type SummaryContent` from `@/lib/schema`, and replace the summary tab entry with:
```tsx
    {
      id: 'summary',
      label: 'Summary',
      content: (
        <SummaryTab
          title={meeting.title}
          summaries={bundle.summaries}
          regen={{
            enabled: liveAiEnabled,
            signedIn: userId !== null,
            onNeedSignIn: () => setSignIn('Sign in with Google to regenerate summaries with AI.'),
            run: async (template: Template): Promise<SummaryContent> => {
              const r = await fetch('/api/regenerate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ meetingSlug: meeting.slug, template }),
              })
              const json = await r.json().catch(() => ({}))
              if (!r.ok) throw new Error(json.error ?? 'Could not regenerate')
              return json.content as SummaryContent
            },
          }}
        />
      ),
    },
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npx vitest run && npm run build && npm run dev`.
- Without `ANTHROPIC_API_KEY`: the Summary tab shows a disabled "Regenerate with AI" button with the explanatory note, and everything else works. Calling the API directly returns 503: `curl -s -X POST localhost:3000/api/regenerate -H 'content-type: application/json' -d '{"meetingSlug":"q4-planning","template":"sales"}'` prints `{"error":"Live regeneration is not configured on this server"}`.
- With a key in `.env.local` and a signed-in user: clicking Regenerate replaces the template's content, the chip reads "Generated live", a reload keeps the user's version while a private window still shows the seeded one, and a sixth attempt within the hour returns the rate-limit message. If no key is available, say plainly in the README and walkthrough that this path is verified only against the stubbed tests.

- [ ] **Step 6: Commit**

```bash
git add lib app/api/regenerate components tests/regenerate.test.ts
git commit -m "feat: key-gated live summary regeneration with per-user results" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 28: Calendar stub

**Files:**
- Create: `components/CalendarConnect.tsx`, `app/calendar/page.tsx`

**Interfaces:**
- Consumes: `listUpcoming` (Task 16), `Button`, `Card`.
- Produces: the `/calendar` page: a "Connect Google Calendar" demo card that reveals the seeded upcoming events with a per-event notetaker toggle (local state only).

- [ ] **Step 1: Implement**

`components/CalendarConnect.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { UpcomingEvent } from '@/lib/types'

const KEY = 'calendar-connected'
const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export function CalendarConnect({ events }: { events: UpcomingEvent[] }) {
  const [connected, setConnected] = useState(false)
  const [off, setOff] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      setConnected(localStorage.getItem(KEY) === '1')
    } catch {
      // storage blocked: stay disconnected
    }
  }, [])
  const set = (v: boolean) => {
    setConnected(v)
    try {
      localStorage.setItem(KEY, v ? '1' : '0')
    } catch {
      // not persisted; fine for a demo
    }
  }

  if (!connected) {
    return (
      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold">Connect your calendar</h2>
        <p className="text-sm text-muted">
          The notetaker joins the meetings on your calendar automatically. This is a demo: no real Google Calendar
          connection is made, and the events below are sample data.
        </p>
        <Button variant="primary" onClick={() => set(true)}>Connect Google Calendar (demo)</Button>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Connected (demo). The notetaker will join these meetings.</p>
        <Button size="sm" variant="ghost" onClick={() => set(false)}>Disconnect</Button>
      </div>
      {events.map((e) => {
        const on = !off.has(e.id)
        return (
          <Card key={e.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{e.title}</p>
              <p className="text-sm text-muted">{fmt.format(new Date(e.starts_at))} UTC</p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={on}
                onChange={() => setOff((s) => { const n = new Set(s); on ? n.add(e.id) : n.delete(e.id); return n })}
              />
              Notetaker joins
            </label>
          </Card>
        )
      })}
    </div>
  )
}
```

`app/calendar/page.tsx`:
```tsx
import { CalendarConnect } from '@/components/CalendarConnect'
import { listUpcoming } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export default async function CalendarPage() {
  const events = await listUpcoming(await createClient())
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <CalendarConnect events={events} />
    </div>
  )
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm run dev`, open `/calendar`: the connect card with the demo disclosure; clicking connect shows five upcoming events with working toggles; reload keeps the connected state; disconnect returns to the card.
```bash
git add components/CalendarConnect.tsx app/calendar
git commit -m "feat: calendar connect stub over seeded events" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Phase 5: Ship

### Task 29: Deploy, smoke test, README, repository

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`, `README.md` (replace), `docs/walkthrough.md`
- Modify: `.gitignore` if Playwright output is not ignored

**Interfaces:**
- Consumes: everything above. Produces: a public deployment, a passing smoke test against it, a public GitHub repository containing `.agent-logs/`, and a walkthrough script.

- [ ] **Step 1: Write the smoke test**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
})
```

`e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

// Runs signed out in a fresh browser context: exactly what a stranger gets.
test('meetings list shows seeded calls', async ({ page }) => {
  await page.goto('/meetings')
  await expect(page.getByRole('link', { name: /Q4 Product Planning/ })).toBeVisible()
  await expect(page.getByText(/of highlights/).first()).toBeVisible()
})

test('meeting page plays and the transcript follows', async ({ page }) => {
  await page.goto('/meetings/q4-planning')
  await expect(page.getByRole('heading', { name: 'Q4 Product Planning' })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByText(/^0:0[1-9] \/ /)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('tab', { name: 'Action items' }).click()
  await expect(page.getByText(/Jump to/).first()).toBeVisible()
})

test('summary templates switch without leaving the page', async ({ page }) => {
  await page.goto('/meetings/q4-planning')
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sales', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('search finds a moment and deep-links into the meeting', async ({ page }) => {
  await page.goto('/meetings')
  await page.getByRole('searchbox', { name: 'Search call recordings' }).fill('budget')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=budget/)
  const first = page.locator('a[href*="?t="]').first()
  await expect(first).toBeVisible()
  await first.click()
  await expect(page).toHaveURL(/\/meetings\/.+\?t=\d+/)
})

test('a suggested Ask answer appears with a citation', async ({ page }) => {
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'Summarize my recent meetings' }).click()
  await expect(page.locator('aside[aria-label="Ask Fathom"] a[href*="?t="]').first()).toBeVisible({ timeout: 15_000 })
})

test('Team Calls lists members and calls', async ({ page }) => {
  await page.goto('/team')
  await expect(page.getByRole('cell', { name: /Priya Raman/ })).toBeVisible()
})

test('a shared clip opens with no sign-in and has social metadata', async ({ page }) => {
  await page.goto('/clip/demo-q4-clip')
  await expect(page.getByText('Shared clip')).toBeVisible()
  await expect(page.getByRole('link', { name: 'View the full meeting' })).toBeVisible()
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
})

test('highlighting while signed out asks for sign-in and does not error', async ({ page }) => {
  await page.goto('/meetings/q4-planning')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: /^Insight/ }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()
})

test('unknown meeting and clip show the friendly 404', async ({ page }) => {
  await page.goto('/meetings/nope')
  await expect(page.getByText("We couldn't find that")).toBeVisible()
  await page.goto('/clip/nope-nope')
  await expect(page.getByText("We couldn't find that")).toBeVisible()
})
```

- [ ] **Step 2: Run the smoke test locally**

Run: `npx playwright install chromium && npm run build && npm start &` then `npm run e2e`
Expected: all tests pass against `http://localhost:3000`. Fix real failures in the app, not in the test. Stop the server afterwards.

- [ ] **Step 3: Ask before the first public deploy**

Deploying publishes the app. Use AskUserQuestion: "Deploy to Vercel now (project `fathom-rebuild`, production)?" Wait for a yes.

- [ ] **Step 4: Deploy**

```bash
vercel link --yes --project fathom-rebuild
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  grep "^$v=" .env.local | cut -d= -f2- | tr -d '\n' | vercel env add "$v" production
done
vercel deploy --prod --yes
```
Expected: a production URL. Record it as `$LIVE`. Do not add `ANTHROPIC_API_KEY` unless the user supplies one. If the user wants live AI, ask them to add it in the Vercel dashboard (never paste it into the chat).

- [ ] **Step 5: Point Supabase auth at the live URL (user step)**

Ask the user: Supabase dashboard, Authentication, URL Configuration: set Site URL to `$LIVE` and add `$LIVE/**` and `http://localhost:3000/**` to Redirect URLs. Then verify Google sign-in on the live site works end to end.

- [ ] **Step 6: Verify the live link works for a stranger**

Run: `BASE_URL=$LIVE npm run e2e`
Expected: all pass in a fresh context with no cookies. Also run `curl -s -o /dev/null -w "%{http_code}\n" $LIVE/meetings` and expect `200` (not a redirect to a Vercel login page). If the response is a 401 or a Vercel authentication page, ask the user to turn off Vercel Authentication under the project's Settings, Deployment Protection, then re-run. Finally ask the user to open `$LIVE` in a private window on a device not signed in to anything.

- [ ] **Step 7: Write the README**

Replace `README.md` with sections: what this is and the live link; a short "What is real and what is stubbed" table (real: Next.js app, Postgres schema and RLS, full-text search, Google OAuth, highlights, clip sharing, summaries and templates; stubbed or seeded: the recording bot and media (a clock-driven simulated player over the transcript), calendar connect (UI over seeded events), all meeting data (synthetic, generated with `claude -p`, committed under `seed/generated`), "My Calls" (a fixed demo persona's calls), and live AI (optional behind `ANTHROPIC_API_KEY`, otherwise pre-generated or extractive; verified only against stubbed clients unless a key is supplied)); run-locally steps (`npm install`, copy `.env.example`, `supabase db push`, `npm run seed:load`, `npm run seed:clips`, `npm run dev`); the seed pipeline (`seed:gen`, `seed:check`, `seed:load`); tests (`npm test`, `npm run rls:test`, `npm run e2e`); product decisions and what was left out and why (Alerts, Deals, CRM and Slack push, Playlists, real multi-tenant teams, semantic search); and a note that `.agent-logs/` contains the agent session logs. Include the Supabase note that the Email provider is left off after the final step below.

- [ ] **Step 8: Write the walkthrough script**

`docs/walkthrough.md`, a timed outline for a recording of five minutes at most with the camera on:
- 0:00 Intro: what this is, and say plainly that capture, media and calendar are stubbed, the data is synthetic, and live AI is optional.
- 0:30 My Calls: cards with duration, highlights time; the upcoming events; global search for a word; click a result straight into the moment.
- 1:15 The meeting page on the 8-person, 62-minute call (the case that matters): the speaker strip (talk time, questions, longest monologue), chapters, play and watch the transcript follow, scrub, search inside 1,000 lines, speaker filter.
- 2:15 Summary: switch the four templates, copy; action items with real due dates and jump-to-moment.
- 2:50 Highlights: sign in with Google, press a type button mid-playback, show it capture the whole speaker run, see it on the scrubber, the transcript border and the tab.
- 3:30 Share: share the moment, open the link in a private window without signing in, show the OG preview.
- 4:00 Ask Fathom: a suggested prompt with citations, a free-text question showing the extractive fallback and why; mention live mode with a key.
- 4:30 Team Calls and what was left out and why; close.

- [ ] **Step 9: Scan for secrets, then commit the logs**

Run:
```bash
grep -rniE "(sk-ant-|eyJ[A-Za-z0-9_-]{30,}|SUPABASE_DB_PASSWORD=|service_role[\"': =]+eyJ)" .agent-logs docs README.md seed lib app components scripts e2e supabase 2>/dev/null || echo "no secrets found"
```
Expected: `no secrets found`. If anything matches, remove it from the file (and from `.agent-logs/` entries) before committing. Then:
```bash
git add -A
git status --short | head -30
git commit -m "docs: README, walkthrough script, e2e smoke tests, agent logs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Create the public repository (ask first)**

Use AskUserQuestion: "Create the public GitHub repo `fathom-rebuild` and push?" On a yes:
```bash
gh repo create fathom-rebuild --public --source=. --remote=origin --push
gh repo view --json url,visibility
gh api repos/:owner/fathom-rebuild/contents/.agent-logs --jq 'length'
```
Expected: `PUBLIC`, and a number greater than 0 for `.agent-logs`. Add the repo URL and live link to the README and push again.

- [ ] **Step 11: Final hardening and checklist**

1. Supabase dashboard: disable the Email provider (Authentication, Sign In / Providers). Note that `npm run rls:test` needs it enabled, so run `rls:test` one last time before this step.
2. Re-run `BASE_URL=$LIVE npm run e2e` once more.
3. Walk the brief's checklist and report each as verified or not: the live link opens signed-out in a private window; the repository is public and contains `.agent-logs/`; the walkthrough is under five minutes with the camera on (user records it); the live link and repository URL are ready to paste, each labelled; the meetings list is seeded with real-looking data.

- [ ] **Step 12: Commit any final edits**

```bash
git add -A && git commit -m "docs: final links and notes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git push
```
