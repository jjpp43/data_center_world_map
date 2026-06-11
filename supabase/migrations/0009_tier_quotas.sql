-- 0009 — rebase tier quotas to monthly across the board.
--
-- Changes:
--   • api_keys monthly limits drop 10x (free 10k→1k, pro 100k→10k, team 1M→50k).
--   • Anonymous quota moves from daily-per-IP to monthly-per-IP. Data isn't
--     live; daily windows added friction with no protective value because
--     edge cache catches the bulk of duplicate traffic.
--   • Drops the old `anonymous_usage(ip, day)` table and rebuilds with month
--     buckets. No production traffic on this yet — losing the bucket
--     counters just means a fresh start.

drop table if exists anonymous_usage;

create table anonymous_usage (
  ip            text   not null,
  month_start   date   not null default date_trunc('month', now())::date,
  count         integer not null default 0,
  primary key (ip, month_start)
);

create index anonymous_usage_month_idx on anonymous_usage (month_start);

alter table anonymous_usage enable row level security;

create policy "no direct anonymous_usage access"
  on anonymous_usage
  for all
  to authenticated, anon
  using  (false)
  with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- validate_and_charge_api_key: replace the tier-limit CASE
-- ────────────────────────────────────────────────────────────────────────────

create or replace function validate_and_charge_api_key(p_hash text)
returns table (
  key_id        uuid,
  tier          text,
  remaining     integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k api_keys%rowtype;
  this_month_start date := date_trunc('month', now())::date;
  this_limit integer;
begin
  select * into k from api_keys
   where key_hash = p_hash and revoked_at is null
   for update;
  if not found then
    return;
  end if;

  this_limit := case k.tier
    when 'free'       then 500
    when 'pro'        then 10000
    when 'team'       then 50000
    when 'enterprise' then 5000000
    else 500
  end;

  if k.current_month_start < this_month_start then
    update api_keys
       set current_month_start = this_month_start,
           current_month_usage = 0
     where id = k.id;
    k.current_month_usage := 0;
  end if;

  if k.current_month_usage >= this_limit then
    return query select k.id, k.tier, 0, this_limit;
    return;
  end if;

  update api_keys
     set current_month_usage = current_month_usage + 1,
         last_used_at = now()
   where id = k.id;

  return query
    select k.id, k.tier, (this_limit - k.current_month_usage - 1)::integer, this_limit;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- charge_anonymous: monthly bucket
-- ────────────────────────────────────────────────────────────────────────────

create or replace function charge_anonymous(p_ip text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
  this_month_start date := date_trunc('month', now())::date;
begin
  insert into anonymous_usage (ip, month_start, count)
       values (p_ip, this_month_start, 1)
  on conflict (ip, month_start) do update
       set count = anonymous_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

grant execute on function charge_anonymous(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Pruner: drop buckets older than 90 days (was 7 — months keep longer).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function prune_anonymous_usage()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from anonymous_usage where month_start < (current_date - interval '90 days');
$$;

grant execute on function prune_anonymous_usage() to authenticated;
