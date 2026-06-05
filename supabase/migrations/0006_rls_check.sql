-- Helper RPC to verify every public-schema table has RLS enabled.
-- Used by scripts/check-security.mjs. Returns one row per table.
-- Service-role only — anon should never see this.

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
  order by c.relname;
$$;

revoke all on function check_rls_coverage() from anon, authenticated;
