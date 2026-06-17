-- 0017 — fix "column reference 'key_id' is ambiguous" in
-- validate_and_charge_api_key.
--
-- The function declares OUT columns via RETURNS TABLE (key_id uuid, ...),
-- which creates a PL/pgSQL variable named `key_id`. That variable collides
-- with the same-named column in api_key_usage_daily inside the
-- `insert into api_key_usage_daily (key_id, ...)` column list and the
-- `on conflict (key_id, usage_date)` clause — PostgreSQL refuses to guess
-- and aborts the whole function with SQLSTATE 42702.
--
-- Symptom: every /api/v1 + /api/mcp request hit 401 "Invalid or revoked
-- API key" because proxy.ts's rpc() saw the RPC fail (non-2xx from
-- PostgREST) and treated null as "no row found." Until the fix lands,
-- the public API surface is silently broken in production.
--
-- The #variable_conflict use_column directive resolves unqualified names
-- to columns whenever the parser sees an ambiguity — matching the intent
-- at every ambiguous site in this function. Function signature, return
-- shape, and behavior are unchanged.

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
#variable_conflict use_column
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
