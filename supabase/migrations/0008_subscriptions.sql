-- 0008 — Polar.sh subscriptions linkage.
-- Webhook handler updates this table; apply_user_tier propagates the tier to
-- every active api_key the user owns. Keeping subscription state separate from
-- api_keys means a user with N keys still has one source of truth for billing.

create table subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  polar_subscription_id   text unique not null,
  polar_customer_id       text not null,
  polar_product_id        text not null,
  tier                    text not null check (tier in ('pro', 'team')),
  status                  text not null,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index subscriptions_user_idx     on subscriptions (user_id);
create index subscriptions_status_idx   on subscriptions (status);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS: users can read their own subscription rows. Inserts/updates only via
-- SECURITY DEFINER functions (called from the webhook handler).
-- ────────────────────────────────────────────────────────────────────────────

alter table subscriptions enable row level security;

create policy "users read own subscriptions"
  on subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- upsert_subscription_and_apply_tier
-- Webhook entry point. Idempotent on polar_subscription_id. Atomically updates
-- the subscription row AND every non-revoked key owned by the user so quota
-- enforcement in api_keys.tier stays in sync with Polar's authoritative state.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function upsert_subscription_and_apply_tier(
  p_polar_subscription_id text,
  p_polar_customer_id     text,
  p_polar_product_id      text,
  p_user_id               uuid,
  p_tier                  text,
  p_status                text,
  p_current_period_end    timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_tier text;
begin
  -- 'pro' and 'team' are the only paid tiers; on cancellation/expiry the
  -- caller passes p_tier='free' so keys roll back. We don't store 'free' in
  -- subscriptions (it's the implicit default), so detect that here.
  effective_tier := case when p_status in ('active', 'trialing') then p_tier else 'free' end;

  if p_status in ('active', 'trialing') then
    insert into subscriptions (
      user_id, polar_subscription_id, polar_customer_id, polar_product_id,
      tier, status, current_period_end, updated_at
    ) values (
      p_user_id, p_polar_subscription_id, p_polar_customer_id, p_polar_product_id,
      p_tier, p_status, p_current_period_end, now()
    )
    on conflict (polar_subscription_id) do update set
      tier               = excluded.tier,
      status             = excluded.status,
      current_period_end = excluded.current_period_end,
      polar_product_id   = excluded.polar_product_id,
      updated_at         = now();
  else
    update subscriptions
       set status = p_status,
           current_period_end = p_current_period_end,
           updated_at = now()
     where polar_subscription_id = p_polar_subscription_id;
  end if;

  -- Propagate to every non-revoked key the user owns.
  update api_keys
     set tier = effective_tier
   where user_id = p_user_id and revoked_at is null;
end;
$$;

revoke all on function upsert_subscription_and_apply_tier(text, text, text, uuid, text, text, timestamptz) from anon, authenticated;
