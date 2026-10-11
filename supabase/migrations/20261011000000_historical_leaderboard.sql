-- 歷史前十排行榜：成績表、受控 RPC、提交節流與最小權限。
-- 所有寫入都必須經過 public.leaderboard_submit；訪客角色沒有任何直接讀寫權限。

create schema if not exists leaderboard_private;
revoke all on schema leaderboard_private from public;

-- 成績表 -------------------------------------------------------------------

create table public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  display_name text not null,
  score integer not null,
  fruits integer not null,
  bombs integer not null,
  max_combo integer not null,
  accepted_at timestamptz not null,
  accepted_order bigint not null,
  constraint leaderboard_entries_submission_id_key unique (submission_id),
  constraint leaderboard_entries_accepted_order_key unique (accepted_order),
  constraint leaderboard_entries_name_check check (
    char_length(display_name) between 1 and 20
    and display_name !~ '[[:cntrl:]]'
    and display_name !~ '^[[:space:]]|[[:space:]]$'
  ),
  constraint leaderboard_entries_stats_check check (
    score >= 0 and fruits >= 0 and bombs >= 0
    and score % 5 = 0
    and score::bigint <= 15::bigint * fruits
    and (max_combo = 0 or (max_combo >= 3 and max_combo <= fruits))
  ),
  constraint leaderboard_entries_order_check check (accepted_order > 0)
);

comment on table public.leaderboard_entries is
  '所有曾成功入榜的成績。跌出前十仍保留，以便重試找回原接受結果。';

create index leaderboard_entries_rank_idx
  on public.leaderboard_entries (score desc, accepted_order asc);

alter table public.leaderboard_entries enable row level security;
revoke all on table public.leaderboard_entries from public, anon, authenticated;
grant select, insert on table public.leaderboard_entries to service_role;

-- 節流計數 -----------------------------------------------------------------

create table leaderboard_private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (bucket, window_start)
);

create index rate_limits_window_start_idx
  on leaderboard_private.rate_limits (window_start);

alter table leaderboard_private.rate_limits enable row level security;
revoke all on table leaderboard_private.rate_limits from public, anon, authenticated;
grant usage on schema leaderboard_private to service_role;
grant select, insert, update, delete on table leaderboard_private.rate_limits to service_role;

-- 內部工具 -----------------------------------------------------------------

-- JSON 非負整數（PostgreSQL integer 範圍）；其他型別或小數回傳 null。
create function leaderboard_private.count_value(p jsonb)
returns integer
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v numeric;
begin
  if jsonb_typeof(p) is distinct from 'number' then
    return null;
  end if;
  v := (p #>> '{}')::numeric;
  if v <> trunc(v) or v < 0 or v > 2147483647 then
    return null;
  end if;
  return v::integer;
end;
$$;

create function leaderboard_private.purge_rate_limits()
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with removed as (
    delete from leaderboard_private.rate_limits
    where window_start < clock_timestamp() - interval '24 hours'
    returning 1
  )
  select count(*)::integer from removed;
$$;

-- 公開前十 -----------------------------------------------------------------

-- 只輸出名次、公開 id、名字與分數；submission_id 與統計不公開。
create function public.leaderboard_top()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('rank', t.rank, 'id', t.id, 'name', t.display_name, 'score', t.score)
      order by t.rank
    ),
    '[]'::jsonb
  )
  from (
    select id, display_name, score,
      row_number() over (order by score desc, accepted_order asc) as rank
    from public.leaderboard_entries
    order by score desc, accepted_order asc
    limit 10
  ) t;
$$;

-- 提交 ---------------------------------------------------------------------

-- 輸入：{ submissionId, name, score, fruits, bombs, maxCombo }
-- 輸出 outcome：accepted（created 表示是否首次寫入）、not_qualified、
--   submission_conflict、invalid（附 code）。
create function public.leaderboard_submit(p_entry jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_submission uuid;
  v_name text;
  v_score integer;
  v_fruits integer;
  v_bombs integer;
  v_combo integer;
  v_existing public.leaderboard_entries%rowtype;
  v_count integer;
  v_cutoff integer;
  v_order bigint;
  v_id uuid;
begin
  -- 取得鎖之後的查詢必須看到最新已提交資料；REPEATABLE READ 以上會沿用鎖前快照。
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'leaderboard_submit requires READ COMMITTED isolation';
  end if;

  if jsonb_typeof(p_entry) is distinct from 'object'
    or jsonb_typeof(p_entry -> 'submissionId') is distinct from 'string'
    or (p_entry ->> 'submissionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return jsonb_build_object('outcome', 'invalid', 'code', 'invalid_request');
  end if;
  v_submission := (p_entry ->> 'submissionId')::uuid;

  if p_entry ? 'name' and jsonb_typeof(p_entry -> 'name') not in ('string', 'null') then
    return jsonb_build_object('outcome', 'invalid', 'code', 'invalid_name');
  end if;
  v_name := regexp_replace(coalesce(p_entry ->> 'name', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if v_name = '' then
    v_name := '不知名的勇者';
  end if;
  if char_length(v_name) > 20 or v_name ~ '[[:cntrl:]]' then
    return jsonb_build_object('outcome', 'invalid', 'code', 'invalid_name');
  end if;

  v_score := leaderboard_private.count_value(p_entry -> 'score');
  v_fruits := leaderboard_private.count_value(p_entry -> 'fruits');
  v_bombs := leaderboard_private.count_value(p_entry -> 'bombs');
  v_combo := leaderboard_private.count_value(p_entry -> 'maxCombo');
  if v_score is null or v_fruits is null or v_bombs is null or v_combo is null
    or v_score % 5 <> 0
    or v_score::bigint > 15::bigint * v_fruits
    or not (v_combo = 0 or (v_combo >= 3 and v_combo <= v_fruits))
  then
    return jsonb_build_object('outcome', 'invalid', 'code', 'invalid_stats');
  end if;

  -- 整個排行榜共用一把交易鎖，提交依序判斷資格與寫入。
  perform pg_advisory_xact_lock(7340163001);

  select * into v_existing
  from public.leaderboard_entries
  where submission_id = v_submission;

  if found then
    if v_existing.display_name = v_name
      and v_existing.score = v_score
      and v_existing.fruits = v_fruits
      and v_existing.bombs = v_bombs
      and v_existing.max_combo = v_combo
    then
      return jsonb_build_object(
        'outcome', 'accepted',
        'created', false,
        'entryId', v_existing.id,
        'entries', public.leaderboard_top()
      );
    end if;
    return jsonb_build_object(
      'outcome', 'submission_conflict',
      'entries', public.leaderboard_top()
    );
  end if;

  select count(*), min(t.score) into v_count, v_cutoff
  from (
    select score
    from public.leaderboard_entries
    order by score desc, accepted_order asc
    limit 10
  ) t;

  if v_count >= 10 and v_score <= v_cutoff then
    return jsonb_build_object(
      'outcome', 'not_qualified',
      'entries', public.leaderboard_top()
    );
  end if;

  select coalesce(max(accepted_order), 0) + 1 into v_order
  from public.leaderboard_entries;

  insert into public.leaderboard_entries (
    submission_id, display_name, score, fruits, bombs, max_combo,
    accepted_at, accepted_order
  ) values (
    v_submission, v_name, v_score, v_fruits, v_bombs, v_combo,
    clock_timestamp(), v_order
  )
  returning id into v_id;

  return jsonb_build_object(
    'outcome', 'accepted',
    'created', true,
    'entryId', v_id,
    'entries', public.leaderboard_top()
  );
end;
$$;

-- 節流 ---------------------------------------------------------------------

-- 固定視窗原子計數。bucket 為 Edge Function 以 HMAC 處理後的來源鍵，不含原始 IP。
create function public.leaderboard_take_submit_token(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_hits integer;
begin
  if p_bucket is null or p_bucket !~ '^(ip:[0-9a-f]{64}|shared)$'
    or p_limit is null or p_limit not between 1 and 1000
    or p_window_seconds is null or p_window_seconds not between 1 and 3600
  then
    raise exception 'invalid rate limit arguments';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into leaderboard_private.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  perform leaderboard_private.purge_rate_limits();

  if v_hits > p_limit then
    return jsonb_build_object(
      'allowed', false,
      'retryAfter', greatest(1, ceil(extract(epoch from
        v_window + make_interval(secs => p_window_seconds) - v_now
      ))::integer)
    );
  end if;
  return jsonb_build_object('allowed', true, 'remaining', p_limit - v_hits);
end;
$$;

-- 函式權限：只有 service_role（Edge Function）可執行 -------------------------

revoke all on function leaderboard_private.count_value(jsonb) from public, anon, authenticated;
revoke all on function leaderboard_private.purge_rate_limits() from public, anon, authenticated;
revoke all on function public.leaderboard_top() from public, anon, authenticated;
revoke all on function public.leaderboard_submit(jsonb) from public, anon, authenticated;
revoke all on function public.leaderboard_take_submit_token(text, integer, integer)
  from public, anon, authenticated;

grant execute on function leaderboard_private.count_value(jsonb) to service_role;
grant execute on function leaderboard_private.purge_rate_limits() to service_role;
grant execute on function public.leaderboard_top() to service_role;
grant execute on function public.leaderboard_submit(jsonb) to service_role;
grant execute on function public.leaderboard_take_submit_token(text, integer, integer)
  to service_role;

-- 排程清理：專案啟用 pg_cron 時每小時清除超過 24 小時的節流紀錄。
-- 未啟用時仍會在每次取得 token 時順帶清理，見 supabase/README.md。
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'leaderboard-purge-rate-limits',
      '17 * * * *',
      'select leaderboard_private.purge_rate_limits()'
    );
  end if;
end;
$$;
