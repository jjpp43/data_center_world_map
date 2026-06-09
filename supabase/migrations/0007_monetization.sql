-- 0007 — API keys, tiered quotas, and anonymous-IP throttle.
-- Foundation for Phase 5b monetization. Polar.sh webhook wiring (5b.2) will
-- flip api_keys.tier on subscription events; this migration sets up the
-- entities + lookup paths that the runtime needs in place first.

-- ────────────────────────────────────────────────────────────────────────────
-- API keys (one row per generated key, owned by an auth.users row)
-- Plaintext key is never stored — only sha256(key) for lookup.
-- ────────────────────────────────────────────────────────────────────────────

create table api_keys (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  key_hash              text not null unique,
  key_prefix            text not null,
  name                  text not null,
  tier                  text not null default 'free'
                        check (tier in ('free', 'pro', 'team', 'enterprise')),
  created_at            timestamptz not null default now(),
  last_used_at          timestamptz,
  revoked_at            timestamptz,
  current_month_start   date not null default date_trunc('month', now())::date,
  current_month_usage   integer not null default 0
);

create index api_keys_user_idx     on api_keys (user_id);
create index api_keys_active_hash  on api_keys (key_hash) where revoked_at is null;

-- ────────────────────────────────────────────────────────────────────────────
-- Anonymous usage (IP × day buckets — 1k/day per IP soft limit)
-- ────────────────────────────────────────────────────────────────────────────

create table anonymous_usage (
  ip      text   not null,
  day     date   not null default current_date,
  count   integer not null default 0,
  primary key (ip, day)
);

create index anonymous_usage_day_idx on anonymous_usage (day);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — users can only see/manage their own keys via PostgREST.
-- Middleware uses SECURITY DEFINER functions below for validation, so it
-- never needs service-role access in runtime code.
-- ────────────────────────────────────────────────────────────────────────────

alter table api_keys         enable row level security;
alter table anonymous_usage  enable row level security;

create policy "users manage own keys"
  on api_keys
  for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- anonymous_usage has no end-user-facing reads at all
create policy "no direct anonymous_usage access"
  on anonymous_usage
  for all
  to authenticated, anon
  using  (false)
  with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- validate_and_charge_api_key
-- Returns one row if the key is valid AND under quota, else zero rows.
-- Atomically rolls over monthly buckets, charges +1 usage, updates last_used_at.
-- Called by the runtime middleware via PostgREST RPC.
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
    when 'free'       then 10000
    when 'pro'        then 100000
    when 'team'       then 1000000
    when 'enterprise' then 100000000
    else 10000
  end;

  if k.current_month_start < this_month_start then
    update api_keys
       set current_month_start = this_month_start,
           current_month_usage = 0
     where id = k.id;
    k.current_month_usage := 0;
  end if;

  if k.current_month_usage >= this_limit then
    -- over quota: report but don't charge
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

grant execute on function validate_and_charge_api_key(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- charge_anonymous
-- Increments today's bucket for the given IP. Returns the new count.
-- Caller compares against ANONYMOUS_DAILY_LIMIT (1000) to decide on 429.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function charge_anonymous(p_ip text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
begin
  insert into anonymous_usage (ip, day, count)
       values (p_ip, current_date, 1)
  on conflict (ip, day) do update
       set count = anonymous_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

grant execute on function charge_anonymous(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Maintenance: prune anonymous_usage older than 7 days. Call from a cron.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function prune_anonymous_usage()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from anonymous_usage where day < current_date - interval '7 days';
$$;

grant execute on function prune_anonymous_usage() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Refresh check_rls_coverage to skip extension-owned tables (PostGIS installs
-- spatial_ref_sys in the public schema and we can't ALTER it as the owner).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function check_rls_coverage()
returns table(tablename text, rowsecurity boolean)
language sql
security invoker
stable
as $$
  select c.relname::text, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname = 'public'
     and not exists (
       select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
     )
   order by c.relname;
$$;

revoke all on function check_rls_coverage() from anon, authenticated;

