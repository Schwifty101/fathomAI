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
