-- 0013 — canonicalize operator string variants surfaced by audit-quality.
--
-- Each pair below is the same legal entity written two ways. Canonical form
-- is the one matching the existing dataset convention (legal-suffix style,
-- the same convention CLAUDE.md documents and that OPERATOR_ALIASES in
-- next.config.ts assumes).
--
-- SupraNet AG vs SupraNet Communications, Inc. are NOT merged — they are
-- two unrelated companies (DE vs US) that share a brand.
--
-- Slugs are not rewritten: they are stable identifiers and updating the
-- display name is enough to consolidate the operator filter, operator
-- landing pages, and the sitemap.

update data_centers set operator = 'Equinix, Inc.'                  where operator = 'Equinix';
update data_centers set operator = 'CyrusOne Inc.'                  where operator = 'CyrusOne';
update data_centers set operator = 'Lumen Technologies Inc'         where operator = 'Lumen Technologies';
update data_centers set operator = 'Redcentric PLC'                 where operator = 'Redcentric';
update data_centers set operator = 'SpaceNet Ltd.'                  where operator = 'SpaceNet';
update data_centers set operator = 'AiNET Corporation'              where operator = 'AiNET';
update data_centers set operator = 'Netrix, LLC'                    where operator = 'Netrix LLC';
update data_centers set operator = 'Docklands Data Centre Limited'  where operator = 'Docklands Data Centre Ltd';
