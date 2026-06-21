-- 0018 — let proxy.ts validate-without-charge for MCP protocol overhead.
--
-- The Streamable HTTP MCP transport sends several JSON-RPC requests per
-- logical client session: `initialize`, `notifications/initialized`,
-- `tools/list`, then the actual `tools/call`. Today every one of these
-- HTTP POSTs goes through validate_and_charge_api_key and decrements the
-- monthly quota, so a single agent's first connect burns 3+ Free-tier
-- credits before doing any useful work. CLAUDE.md "Open improvements"
-- has flagged this since Phase 12.
--
-- Fix: add an optional p_charge boolean. When false, the function still
-- validates the key + reports tier/remaining (so proxy.ts can serve
-- X-RateLimit-* headers and 401 on bad keys), but skips both the
-- counter increment and the api_key_usage_daily upsert.
--
-- Function name + return shape unchanged. /api/v1/* path keeps calling
-- with `{ p_hash }` only and relies on the default to charge as before.

drop function if exists validate_and_charge_api_key(text);

create or replace function validate_and_charge_api_key(
  p_hash text,
  p_charge boolean default true
)
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

  if p_charge then
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
  else
    return query
      select k.id, k.tier, (this_limit - k.current_month_usage)::integer, this_limit;
  end if;
end;
$$;

grant execute on function validate_and_charge_api_key(text, boolean) to anon, authenticated;
