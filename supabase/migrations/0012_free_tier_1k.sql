-- 0012 — bump Free tier monthly quota from 500 → 1,000.
--
-- Lowers the bar to "try the API and build something tiny" — pure
-- conversion-funnel optimization. Keep this in sync with TIER_LIMITS.free
-- in lib/api-keys.ts.

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
    when 'free'       then 1000
    when 'pro'        then 10000
    when 'team'       then 50000
    when 'enterprise' then 5000000
    else 1000
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
