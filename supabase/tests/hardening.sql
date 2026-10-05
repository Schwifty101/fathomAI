-- Self-checking probes for 20261006000000_hardening.sql. Needs a scratch Postgres with the
-- Supabase roles (anon, authenticated, service_role), auth.users and auth.uid(); never run on a
-- hosted project. Everything rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261005000000_init.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261006000000_hardening.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/hardening.sql      (as a superuser; prints PASS lines)
begin;

create schema probe;
grant usage on schema probe to anon, authenticated, service_role;
-- denied(sql, sqlstate): statement must fail with exactly that SQLSTATE (runs as the caller).
create function probe.denied(q text, code text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute q;
  exception when others then
    if sqlstate = code then ok := true;
    else raise exception 'FAIL % -> got % (%)', q, sqlstate, sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL % -> expected % but it succeeded', q, code; end if;
  raise notice 'PASS % -> %', left(q, 90), code;
end $$;
-- rows(sql, n): DML/select (use RETURNING) must touch exactly n rows.
create function probe.rows(q text, n int) returns void language plpgsql as $$
declare c int;
begin
  execute 'with x as (' || q || ') select count(*) from x' into c;
  if c <> n then raise exception 'FAIL % -> % rows, expected %', q, c, n; end if;
  raise notice 'PASS % -> % rows', left(q, 90), n;
end $$;
create function probe.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL %', msg; end if;
  raise notice 'PASS %', msg;
end $$;
grant execute on all functions in schema probe to anon, authenticated, service_role;

-- fixtures (as the superuser)
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000000'), ('bbbbbbbb-0000-0000-0000-000000000000');
insert into team_members values ('11111111-0000-0000-0000-000000000000', 'M', 'r', true);
insert into meetings values
  ('c1000000-0000-0000-0000-000000000000', 'm1', 'Meeting one', 'standup', 'zoom', now(), 600, 0, '11111111-0000-0000-0000-000000000000'),
  ('c2000000-0000-0000-0000-000000000000', 'm2', 'Meeting two', 'standup', 'zoom', now(), 600, 0, '11111111-0000-0000-0000-000000000000');
insert into participants values
  ('d1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', 'M1', 'r', true, 60, 0, 0),
  ('d1100000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', 'M1 phone', 'r', true, 40, 0, 0),
  ('d1200000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', null, 'Other', 'x', false, 100, 0, 0),
  ('d2000000-0000-0000-0000-000000000000', 'c2000000-0000-0000-0000-000000000000', null, 'Two', 'x', false, 0, 0, 0);
insert into segments (id, meeting_id, participant_id, idx, start_ms, end_ms, text) values
  (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 0, 0, 10000, 'alpha rollout plan'),
  (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 1, 10000, 20000, 'beta budget review'),
  (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 2, 400000, 410000, 'gamma wrap up'),
  (gen_random_uuid(), 'c2000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000000', 0, 0, 10000, 'zulu secret other meeting');
insert into segments (id, meeting_id, participant_id, idx, start_ms, end_ms, text)
  select gen_random_uuid(), 'c2000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000000', i, i * 10, i * 10 + 5, 'capword filler ' || i
  from generate_series(1, 105) i;
insert into summaries (id, meeting_id, template, content, user_id, source) values
  (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'general', '{}', null, 'seed'),
  (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'general', '{}', 'aaaaaaaa-0000-0000-0000-000000000000', 'live');
insert into highlights (id, meeting_id, user_id, type, title, start_ms, end_ms) values
  ('e0000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', null, 'insight', 'seed', 0, 1000),
  ('ea000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'insight', 'mine', 0, 1000);
insert into shares (slug, meeting_id, start_ms, end_ms, created_by) values
  ('boundary-clip', 'c1000000-0000-0000-0000-000000000000', 10000, 20000, 'aaaaaaaa-0000-0000-0000-000000000000'),
  ('window-clip', 'c1000000-0000-0000-0000-000000000000', 0, 15000, 'aaaaaaaa-0000-0000-0000-000000000000'),
  ('a-delete-me', 'c1000000-0000-0000-0000-000000000000', 0, 1000, 'aaaaaaaa-0000-0000-0000-000000000000');
insert into ai_usage (user_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000000', 'ask');

-- privileges: nothing beyond SELECT/INSERT/UPDATE/DELETE as designed, no TRUNCATE/REFERENCES/TRIGGER
select probe.assert(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')), 'no TRUNCATE/REFERENCES/TRIGGER for anon/authenticated/public');
select probe.assert(not has_table_privilege('anon', 'shares', 'select') and not has_table_privilege('anon', 'ai_usage', 'select')
  and not has_table_privilege('authenticated', 'ai_usage', 'select') and not has_table_privilege('authenticated', 'shares', 'update'),
  'ai_usage closed, shares not updatable, anon cannot read shares');
select probe.assert(has_function_privilege('anon', 'get_clip(text)', 'execute')
  and has_function_privilege('authenticated', 'search_segments(text,uuid,uuid,int)', 'execute'), 'RPC execute granted');
-- default privileges: a later table is not exposed
create table public.later_table (id int);
select probe.assert(not has_table_privilege('anon', 'public.later_table', 'select')
  and not has_table_privilege('authenticated', 'public.later_table', 'select'), 'new tables not auto-exposed');
create function public.later_fn() returns int language sql as 'select 1';
select probe.assert(not has_function_privilege('anon', 'public.later_fn()', 'execute'), 'new functions not auto-exposed');

-- anon
set local role anon;
select probe.rows($$select 1 from meetings$$, 2);
select probe.rows($$select 1 from team_stats$$, 1);
select probe.rows($$select 1 from calendar_upcoming$$, 0);
select probe.rows($$select 1 from summaries$$, 1);
select probe.rows($$select 1 from highlights$$, 1);
select probe.denied($$select 1 from shares$$, '42501');
select probe.denied($$select 1 from ai_usage$$, '42501');
select probe.denied($$insert into meetings values (gen_random_uuid(), 'x', 'x', 'standup', 'zoom', now(), 1, 0, '11111111-0000-0000-0000-000000000000')$$, '42501');
select probe.denied($$insert into highlights (meeting_id, user_id, type, title, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', null, 'insight', 'x', 0, 1)$$, '42501');
select probe.denied($$insert into shares values ('anon-slug', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '42501');
select probe.denied($$insert into summaries (id, meeting_id, template, content, source) values (gen_random_uuid(), 'c2000000-0000-0000-0000-000000000000', 'general', '{}', 'seed')$$, '42501');
select probe.denied($$delete from highlights$$, '42501');
select probe.denied($$truncate meetings$$, '42501');
-- get_clip: window boundary (end == start of next segment, start == end of previous) and no cross-meeting leakage
select probe.assert((select jsonb_array_length(get_clip('boundary-clip')->'segments')) = 1
  and (get_clip('boundary-clip')->'segments'->0->>'idx') = '1', 'get_clip boundary: only the overlapping segment');
select probe.assert(not (get_clip('window-clip')::text like '%zulu%') and not (get_clip('window-clip')::text like '%gamma%')
  and jsonb_array_length(get_clip('window-clip')->'segments') = 2 and not (get_clip('window-clip') ? 'created_by'),
  'get_clip: no other-meeting or out-of-window text, no sharer identity');
select probe.assert(get_clip('nope-nope') is null, 'get_clip unknown slug is null');
-- search_path hijack: an anon-created temp table named shares must not shadow public.shares in get_clip
create temp table shares (slug text, meeting_id uuid, start_ms int, end_ms int, created_by uuid, created_at timestamptz);
insert into pg_temp.shares values ('window-clip', 'c2000000-0000-0000-0000-000000000000', 0, 999999, null, now());
select probe.assert(get_clip('window-clip')->>'meeting_slug' = 'm1' and get_clip('window-clip')->>'end_ms' = '15000',
  'get_clip ignores a temp table named shares');
drop table pg_temp.shares;
-- search_segments
select probe.assert((select count(*) from search_segments('alpha')) = 1, 'search default scope');
select probe.assert((select count(*) from search_segments('alpha', '11111111-0000-0000-0000-000000000000')) = 1
  and (select count(*) from search_segments('alpha', '99999999-0000-0000-0000-000000000000')) = 0, 'search scope_host');
select probe.assert((select count(*) from search_segments('alpha', null, 'c2000000-0000-0000-0000-000000000000')) = 0
  and (select count(*) from search_segments('zulu', null, 'c2000000-0000-0000-0000-000000000000')) = 1, 'search scope_meeting');
select probe.assert((select count(*) from search_segments('capword', null, null, 1000)) = 100
  and (select count(*) from search_segments('capword', null, null, 5)) = 5, 'search max_rows caps at 100');
select probe.denied($$select * from search_segments('capword', null, null, -1)$$, '2201W');
reset role;

-- authenticated user A
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000000', true);
select probe.rows($$select 1 from summaries$$, 2);
select probe.rows($$select 1 from highlights$$, 2);
select probe.denied($$select 1 from ai_usage$$, '42501');
select probe.denied($$insert into ai_usage (user_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000000', 'ask')$$, '42501');
select probe.denied($$insert into segments (id, meeting_id, participant_id, idx, start_ms, end_ms, text) values (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 99, 1, 2, 'x')$$, '42501');
select probe.denied($$truncate highlights$$, '42501');
-- summaries: read only
select probe.denied($$insert into summaries (id, meeting_id, template, content, user_id, source) values (gen_random_uuid(), 'c2000000-0000-0000-0000-000000000000', 'general', '{}', 'aaaaaaaa-0000-0000-0000-000000000000', 'live')$$, '42501');
select probe.denied($$update summaries set content = '{"x":1}'$$, '42501');
select probe.denied($$delete from summaries$$, '42501');
-- highlights: forged owner, seeded rows untouchable, checks
select probe.denied($$insert into highlights (meeting_id, user_id, type, title, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'insight', 'x', 0, 1)$$, '42501');
select probe.denied($$insert into highlights (meeting_id, user_id, type, title, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', null, 'insight', 'x', 0, 1)$$, '42501');
select probe.rows($$update highlights set title = 'hijack' where id = 'e0000000-0000-0000-0000-000000000000' returning 1$$, 0);
select probe.rows($$delete from highlights where id = 'e0000000-0000-0000-0000-000000000000' returning 1$$, 0);
select probe.denied($$insert into highlights (meeting_id, user_id, type, title, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'insight', 'x', -1, 1000)$$, '23514');
select probe.denied($$insert into highlights (meeting_id, user_id, type, title, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'insight', 'x', 0, 300001)$$, '23514');
select probe.denied($$insert into highlights (meeting_id, user_id, type, title, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'insight', repeat('t', 81), 0, 1000)$$, '23514');
select probe.denied($$insert into highlights (meeting_id, user_id, type, title, note, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'insight', 'x', repeat('n', 281), 0, 1000)$$, '23514');
select probe.rows($$insert into highlights (meeting_id, user_id, type, title, note, start_ms, end_ms) values ('c1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'insight', repeat('t', 80), repeat('n', 280), 0, 1000) returning 1$$, 1);
select probe.rows($$update highlights set title = 'edited' where id = 'ea000000-0000-0000-0000-000000000000' returning 1$$, 1);
-- shares
select probe.denied($$insert into shares values ('anon-slug', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'bbbbbbbb-0000-0000-0000-000000000000')$$, '42501');
select probe.denied($$insert into shares values ('window-clip', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '23505');
select probe.denied($$insert into shares values ('neg-start', 'c1000000-0000-0000-0000-000000000000', -5, 1, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '23514');
select probe.denied($$insert into shares values ('too-long', 'c1000000-0000-0000-0000-000000000000', 0, 300001, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '23514');
select probe.denied($$insert into shares values ('ghost-meeting', gen_random_uuid(), 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '23503');
select probe.denied($$insert into shares values ('ab', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '23514');
select probe.denied($$insert into shares values ('Has-Upper', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '23514');
select probe.denied($$insert into shares values ('-lead-dash', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000')$$, '23514');
select probe.rows($$insert into shares values ('demo-q4-clip', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000') returning 1$$, 1);
select probe.rows($$insert into shares values ('abcdefghjk', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000') returning 1$$, 1);
select probe.rows($$insert into shares values ('zz23456789', 'c1000000-0000-0000-0000-000000000000', 0, 1, 'aaaaaaaa-0000-0000-0000-000000000000') returning 1$$, 1);
select probe.denied($$update shares set end_ms = 2 where slug = 'window-clip'$$, '42501');
select probe.rows($$delete from shares where slug = 'a-delete-me' returning 1$$, 1);
reset role;

-- user B
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000000', true);
select probe.rows($$select 1 from summaries$$, 1);
select probe.rows($$select 1 from highlights where id = 'ea000000-0000-0000-0000-000000000000'$$, 0);
select probe.rows($$update highlights set title = 'hijack' where id = 'ea000000-0000-0000-0000-000000000000' returning 1$$, 0);
select probe.rows($$delete from highlights where id = 'ea000000-0000-0000-0000-000000000000' returning 1$$, 0);
select probe.rows($$delete from shares where slug = 'window-clip' returning 1$$, 0);
select probe.rows($$select 1 from shares$$, 0);
reset role;
select probe.assert((select title from highlights where id = 'ea000000-0000-0000-0000-000000000000') = 'edited'
  and exists (select 1 from shares where slug = 'window-clip')
  and (select title from highlights where id = 'e0000000-0000-0000-0000-000000000000') = 'seed'
  and (select count(*) from summaries) = 2, 'rows re-read as owner are unchanged by B and by A on seeded data');

-- service_role: privileges, summaries upsert target, ask uniqueness
set local role service_role;
select probe.rows($$select 1 from ai_usage$$, 1);
select probe.rows($$insert into ai_usage (user_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000000', 'regenerate') returning 1$$, 1);
select probe.denied($$insert into summaries (id, meeting_id, template, content, user_id, source) values (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'general', '{}', null, 'seed')$$, '23505');
select probe.denied($$insert into summaries (id, meeting_id, template, content, user_id, source) values (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'general', '{}', 'aaaaaaaa-0000-0000-0000-000000000000', 'live')$$, '23505');
-- exactly what supabase-js .upsert(row, { onConflict: 'meeting_id,template,user_id' }) sends
select probe.rows($$insert into summaries (id, meeting_id, template, content, user_id, source) values (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'general', '{"v":2}', 'aaaaaaaa-0000-0000-0000-000000000000', 'live')
  on conflict (meeting_id, template, user_id) do update set content = excluded.content returning 1$$, 1);
select probe.rows($$insert into summaries (id, meeting_id, template, content, user_id, source) values (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'general', '{"v":3}', null, 'seed')
  on conflict (meeting_id, template, user_id) do update set content = excluded.content returning 1$$, 1);
select probe.rows($$insert into summaries (id, meeting_id, template, content, user_id, source) values (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000000', 'sales', '{}', 'aaaaaaaa-0000-0000-0000-000000000000', 'live')
  on conflict (meeting_id, template, user_id) do update set content = excluded.content returning 1$$, 1);
select probe.rows($$select 1 from summaries where meeting_id = 'c1000000-0000-0000-0000-000000000000' and template = 'general'$$, 2);
select probe.rows($$insert into ask_answers values (gen_random_uuid(), 'same prompt', 'my_calls', '{}') returning 1$$, 1);
select probe.rows($$insert into ask_answers values (gen_random_uuid(), 'same prompt', 'team_calls', '{}') returning 1$$, 1);
select probe.denied($$insert into ask_answers values (gen_random_uuid(), 'same prompt', 'my_calls', '{}')$$, '23505');
reset role;

-- team_stats: one member with two participant rows in a meeting (60 + 40 of 200 total) => 50 %, 1 call
select probe.assert((select talk_pct from team_stats) = 50 and (select talk_sec from team_stats) = 100 and (select calls from team_stats) = 1,
  'team_stats talk_pct is not diluted by a member with two participant rows');

rollback;
select 'ALL PASS' as result;
