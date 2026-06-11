-- 0010 — make the API auth-only.
-- Drops the anonymous-quota machinery. Public HTML pages stay open; only
-- `/api/v1/*` JSON/CSV endpoints now require a Bearer token. The middleware
-- short-circuits unauthenticated requests with 401 — no DB call needed for
-- the rejection path.

drop function if exists charge_anonymous(text);
drop function if exists prune_anonymous_usage();
drop table if exists anonymous_usage;
