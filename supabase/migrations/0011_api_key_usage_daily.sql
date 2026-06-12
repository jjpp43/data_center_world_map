-- 0011 — daily per-key usage rollup for the dashboard chart.
--
-- One row per (key, day). validate_and_charge_api_key now UPSERTs on every
-- charge so the dashboard can render a 30-day bar chart without scanning a
-- request log. user_id denormalized so the RLS predicate doesn't need to
-- join api_keys (and so the dashboard's SUM-by-day query is one table).

create table if not exists api_key_usage_daily (
  key_id        uuid    not null references api_keys(id)      on delete cascade,
  user_id       uuid    not null references auth.users(id)    on delete cascade,
  usage_date    date    not null,
  request_count integer not null default 0,
  primary key (key_id, usage_date)
);

create index if not exists api_key_usage_daily_user_date_idx
  on api_key_usage_daily (user_id, usage_date);

alter table api_key_usage_daily enable row level security;

create policy "users read own daily usage"
  on api_key_usage_daily
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- validate_and_charge_api_key: same contract as 0009, plus a daily UPSERT.
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

  insert into api_key_usage_daily (key_id, user_id, usage_date, request_count)
       values (k.id, k.user_id, current_date, 1)
  on conflict (key_id, usage_date) do update
       set request_count = api_key_usage_daily.request_count + 1;

  return query
    select k.id, k.tier, (this_limit - k.current_month_usage - 1)::integer, this_limit;
end;
$$;

grant execute on function validate_and_charge_api_key(text) to anon, authenticated;
