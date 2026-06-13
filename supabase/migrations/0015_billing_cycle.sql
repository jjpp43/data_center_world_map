-- 0015 — cycle anchored to user signup (free) or subscription period (paid).
--
-- Until now, every API key's monthly quota rolled over on the first of the
-- calendar month UTC. This always felt arbitrary — a user who signed up on
-- the 28th got 3 days of quota before being reset, and a paying customer's
-- bill date had nothing to do with their counter.
--
-- New behavior:
--   • Free tier  → cycle anchored to auth.users.created_at (most recent
--                  anniversary of that day, capped at month-end).
--   • Paid tier  → cycle anchored to subscriptions.current_period_start
--                  (the start of the current billing period from Polar).
--
-- Cycle rollover is lazy: validate_and_charge_api_key computes the current
-- cycle_start on every charge and resets api_keys.current_month_usage when
-- the stored marker (current_month_start) is older than cycle_start. Tier
-- changes (upgrade / downgrade / cancel) also clean-slate the counter so a
-- user can't drag prior usage into a new billing period.
--
-- The column names `current_month_start` / `current_month_usage` are kept
-- to avoid an unnecessary rename — they're now "current cycle" semantically.

-- ────────────────────────────────────────────────────────────────────────────
-- Capture period_start from Polar (we already store period_end).
-- ────────────────────────────────────────────────────────────────────────────

alter table subscriptions
  add column if not exists current_period_start timestamptz;

-- ────────────────────────────────────────────────────────────────────────────
-- anniversary_on_or_before
-- Returns the most recent date <= p_today whose day-of-month matches
-- p_anchor's, capped at the target month's last day. Used for free-tier
-- cycle anchoring.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function anniversary_on_or_before(p_anchor date, p_today date)
returns date
language plpgsql
immutable
as $$
declare
  d          int  := extract(day from p_anchor)::int;
  m_first    date := date_trunc('month', p_today)::date;
  last_this  int  := extract(day from (m_first + interval '1 month - 1 day'))::int;
  candidate  date := make_date(
                       extract(year  from p_today)::int,
                       extract(month from p_today)::int,
                       least(d, last_this)
                     );
  prev_last  date;
  last_prev  int;
begin
  if candidate <= p_today then
    return candidate;
  end if;
  prev_last := m_first - interval '1 day';
  last_prev := extract(day from prev_last)::int;
  return make_date(
    extract(year  from prev_last)::int,
    extract(month from prev_last)::int,
    least(d, last_prev)
  );
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- validate_and_charge_api_key
-- Same return contract; cycle anchor now depends on tier + signup / sub state.
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
  k             api_keys%rowtype;
  this_limit    integer;
  cycle_start   date;
  signup_date   date;
  sub_start     date;
begin
  select * into k from api_keys
   where key_hash = p_hash and revoked_at is null
   for update;
  if not found then
    return;
  end if;

  this_limit := case k.tier
    when 'free'       then 1000
    when 'pro'        then 10000
    when 'team'       then 50000
    when 'enterprise' then 5000000
    else 1000
  end;

  if k.tier = 'free' then
    select created_at::date into signup_date
      from auth.users
     where id = k.user_id;
    cycle_start := anniversary_on_or_before(
      coalesce(signup_date, current_date),
      current_date
    );
  else
    select current_period_start::date into sub_start
      from subscriptions
     where user_id = k.user_id
       and status in ('active', 'trialing')
     order by updated_at desc
     limit 1;
    cycle_start := coalesce(sub_start, current_date);
  end if;

  if k.current_month_start < cycle_start then
    update api_keys
       set current_month_start = cycle_start,
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

-- ────────────────────────────────────────────────────────────────────────────
-- upsert_subscription_and_apply_tier
-- New optional p_current_period_start at end (backwards-compatible signature).
-- Tier changes now also reset the per-key counter to start a fresh cycle.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function upsert_subscription_and_apply_tier(
  p_polar_subscription_id text,
  p_polar_customer_id     text,
  p_polar_product_id      text,
  p_user_id               uuid,
  p_tier                  text,
  p_status                text,
  p_current_period_end    timestamptz,
  p_current_period_start  timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_tier   text;
  reset_cycle_from date := coalesce(p_current_period_start::date, current_date);
begin
  effective_tier := case when p_status in ('active', 'trialing') then p_tier else 'free' end;

  if p_status in ('active', 'trialing') then
    insert into subscriptions (
      user_id, polar_subscription_id, polar_customer_id, polar_product_id,
      tier, status, current_period_start, current_period_end, updated_at
    ) values (
      p_user_id, p_polar_subscription_id, p_polar_customer_id, p_polar_product_id,
      p_tier, p_status, p_current_period_start, p_current_period_end, now()
    )
    on conflict (polar_subscription_id) do update set
      tier                 = excluded.tier,
      status               = excluded.status,
      current_period_start = coalesce(excluded.current_period_start, subscriptions.current_period_start),
      current_period_end   = excluded.current_period_end,
      polar_product_id     = excluded.polar_product_id,
      updated_at           = now();
  else
    update subscriptions
       set status               = p_status,
           current_period_start = coalesce(p_current_period_start, current_period_start),
           current_period_end   = p_current_period_end,
           updated_at           = now()
     where polar_subscription_id = p_polar_subscription_id;
  end if;

  update api_keys
     set tier                = effective_tier,
         current_month_start = reset_cycle_from,
         current_month_usage = 0
   where user_id = p_user_id and revoked_at is null;
end;
$$;

revoke all on function upsert_subscription_and_apply_tier(text, text, text, uuid, text, text, timestamptz, timestamptz) from anon, authenticated;
