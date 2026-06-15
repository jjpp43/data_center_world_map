-- 0016 — materialized views for the heavy aggregations.
--
-- The /countries, /operators, /density, /insights, /metros pages all need
-- per-X facility counts. Until now we did this by SELECTing 5,675 rows from
-- data_centers and aggregating in JS. That's the dominant data-fetch payload
-- after the geojson static-bake — a single uncached aggregator pull was
-- ~230 KB. Pre-computing in Postgres drops that to a few KB.
--
-- The views are refreshed by refresh_summary_views(), called from ingest
-- scripts after --apply (and from the weekly cron via the Deploy Hook, which
-- triggers a redeploy that invalidates unstable_cache anyway).
--
-- Unique indexes are required for REFRESH MATERIALIZED VIEW CONCURRENTLY,
-- which lets read queries continue during the refresh.

-- ────────────────────────────────────────────────────────────────────────────
-- country_summary
-- ────────────────────────────────────────────────────────────────────────────

create materialized view country_summary as
select
  country                                                       as code,
  count(*)::int                                                 as facility_count,
  count(distinct operator) filter (where operator is not null)::int
                                                                as operator_count,
  sum(power_mw)                                                 as total_power_mw
from data_centers
where status != 'decommissioned'
group by country;

create unique index country_summary_code_idx on country_summary(code);

-- ────────────────────────────────────────────────────────────────────────────
-- operator_summary
-- ────────────────────────────────────────────────────────────────────────────

create materialized view operator_summary as
select
  operator                                                      as name,
  count(*)::int                                                 as facility_count,
  count(distinct country)::int                                  as country_count,
  sum(power_mw)                                                 as total_power_mw
from data_centers
where status != 'decommissioned'
  and operator is not null
group by operator;

create unique index operator_summary_name_idx on operator_summary(name);

-- ────────────────────────────────────────────────────────────────────────────
-- facility_density
-- Per-facility row with pre-counted network + IX presence. Used by
-- /density, /insights/most-network-dense-facilities, /metros, and any other
-- page that joins data_centers × networks_at_facility(count) × ixes_at_facility(count).
-- ────────────────────────────────────────────────────────────────────────────

create materialized view facility_density as
select
  dc.slug,
  dc.name,
  dc.operator,
  dc.city,
  dc.country,
  dc.lat,
  dc.lng,
  dc.power_mw,
  coalesce(
    (select count(*) from networks_at_facility where data_center_id = dc.id),
    0
  )::int as network_count,
  coalesce(
    (select count(*) from ixes_at_facility where data_center_id = dc.id),
    0
  )::int as ix_count
from data_centers dc
where dc.status != 'decommissioned';

create unique index facility_density_slug_idx on facility_density(slug);
create        index facility_density_country_idx on facility_density(country);
create        index facility_density_nc_desc_idx on facility_density(network_count desc);

-- ────────────────────────────────────────────────────────────────────────────
-- Read access
-- These aggregate public data; no privacy concern. PostgREST needs SELECT
-- for the anon key used by supabaseServer().
-- ────────────────────────────────────────────────────────────────────────────

grant select on country_summary  to anon, authenticated;
grant select on operator_summary to anon, authenticated;
grant select on facility_density to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- refresh_summary_views
-- Called from ingest scripts (service-role only) after --apply. Concurrent
-- refresh so reads aren't blocked. Service role bypasses GRANT entirely; we
-- only grant execute to authenticated so the dashboard could trigger a
-- refresh in the future if we ever want a "rebuild now" admin button.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function refresh_summary_views()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently country_summary;
  refresh materialized view concurrently operator_summary;
  refresh materialized view concurrently facility_density;
end;
$$;

revoke all on function refresh_summary_views() from public, anon, authenticated;
