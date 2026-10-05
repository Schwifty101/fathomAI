-- Hardening on top of 20261005000000_init.sql (Postgres 17). Do not edit init.sql: it is already applied.

-- 1. Functions: pin search_path (pg_temp LAST, so an anon-created temp table can't shadow
--    public.shares etc. inside the security definer get_clip). Bodies unchanged.
create or replace function search_segments(
  q text,
  scope_host uuid default null,
  scope_meeting uuid default null,
  max_rows int default 30
) returns table (
  meeting_id uuid, meeting_slug text, meeting_title text, segment_idx int,
  start_ms int, speaker text, snippet text, rank real
) language sql stable security invoker set search_path = public, pg_temp as $$
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

create or replace function get_clip(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
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

-- 2. ask_answers: unique per (scope, prompt), not per prompt alone.
alter table ask_answers drop constraint ask_answers_prompt_key;
alter table ask_answers add constraint ask_answers_scope_prompt_key unique (scope, prompt);

-- 3. summaries: PostgREST onConflict cannot target an expression index. Use a real constraint
--    that treats NULL user_id (seeded rows) as equal, so a duplicate seeded summary is still rejected.
--    supabase-js: .upsert(row, { onConflict: 'meeting_id,template,user_id' })
drop index summaries_unique;
alter table summaries add constraint summaries_unique
  unique nulls not distinct (meeting_id, template, user_id);

-- 4. CHECKs (init already has end_ms > start_ms and the 5 minute cap on highlights/shares).
--    shares has no title/note columns; the 80/280 limits apply to highlights (lib/highlight.ts, actions.ts).
--    Slug: seeded 'demo-q4-clip' and lib/slug.ts (10 chars of [a-km-z2-9]) both match.
alter table highlights
  add constraint highlights_start_nonneg check (start_ms >= 0),
  add constraint highlights_title_len check (char_length(title) <= 80),
  add constraint highlights_note_len check (note is null or char_length(note) <= 280);
alter table shares
  add constraint shares_start_nonneg check (start_ms >= 0),
  add constraint shares_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$');

-- 5. Indexes on FK columns used by cascades and joins (others are covered by existing unique/btree indexes).
create index chapters_meeting_idx on chapters (meeting_id);
create index action_items_meeting_idx on action_items (meeting_id);
create index shares_meeting_idx on shares (meeting_id);
create index shares_created_by_idx on shares (created_by);
create index participants_member_idx on participants (member_id);
create index segments_participant_idx on segments (participant_id);
create index meetings_host_idx on meetings (host_id);

-- 6. team_stats: one member with two participant rows in a meeting inflated the denominator of
--    talk_pct (the meeting total was joined once per participant row). Collapse to member x meeting first.
create or replace view team_stats with (security_invoker = true) as
with totals as (
  select meeting_id, sum(talk_time_sec) as total_sec from participants group by meeting_id
), pm as (
  select member_id, meeting_id, sum(talk_time_sec) as talk_sec, sum(questions) as questions,
         max(longest_monologue_sec) as longest
  from participants where member_id is not null group by member_id, meeting_id
)
select tm.id as member_id, tm.name, tm.role,
       count(pm.meeting_id)::int as calls,
       coalesce(sum(pm.talk_sec), 0)::int as talk_sec,
       coalesce(round(100.0 * sum(pm.talk_sec) / nullif(sum(t.total_sec), 0)), 0)::int as talk_pct,
       coalesce(sum(pm.questions), 0)::int as questions,
       coalesce(max(pm.longest), 0)::int as longest_monologue_sec
from team_members tm
left join pm on pm.member_id = tm.id
left join totals t on t.meeting_id = pm.meeting_id
group by tm.id, tm.name, tm.role;

-- 7. Grants. Do not rely on Supabase default privileges (being removed for new projects).
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on team_members, meetings, participants, segments, chapters, action_items,
  calendar_events, ask_answers, summaries, highlights, calendar_upcoming, team_stats
  to anon, authenticated;
grant insert, update, delete on highlights to authenticated;
grant select, insert, delete on shares to authenticated;   -- no UPDATE: shares are immutable
-- ai_usage: no client grant (service role only)
grant execute on function get_clip(text) to anon, authenticated;
grant execute on function search_segments(text, uuid, uuid, int) to anon, authenticated;

-- service_role bypasses RLS but still needs privileges.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Future objects: not exposed to clients unless a migration grants them.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;
