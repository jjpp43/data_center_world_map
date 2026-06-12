-- 0014 — backfill the 34 facilities with NULL operator field.
--
-- All 34 are OSM-sourced rows where the `operator` OSM tag was missing or
-- not extracted, but the operator identity is unambiguous from the facility
-- name (e.g. "Mainova WebHouse" → Mainova).
--
-- Canonical operator forms confirmed against existing rows in
-- data_centers where the operator already had presence
-- (see scripts/_check-operators.ts). For operators with no existing
-- presence, the most common public-facing form is used.

-- Germany (12)
update data_centers set operator = 'DVZ Datenverarbeitungszentrum Mecklenburg-Vorpommern GmbH' where slug = 'dvz-datenverarbeitungszentrum-mecklenburg-vorpommern-gmbh-schwerin';
update data_centers set operator = 'Mainova'                                                    where slug = 'mainova-webhouse-frankfurt-am-main';
update data_centers set operator = 'ITSMZ'                                                      where slug = 'itsmz-wismar';
update data_centers set operator = 'Universität Stuttgart'                                      where slug = 'hochstleistungsrechenzentrum-der-universitat-stuttgart-stuttgart';
update data_centers set operator = 'Kyndryl Deutschland GmbH'                                   where slug = 'kyndryl-data-center-eschborn';
update data_centers set operator = 'KÜS Data'                                                   where slug = 'rechenzentrum-kus-data-losheim-am-see';
update data_centers set operator = 'Thüringer Netkom'                                           where slug = 'rechenzentrum-thuringer-netkom-ilmenau';
update data_centers set operator = 'Colt Technology Services Group'                             where slug = 'colt-fra3-frankfurt-am-main';
update data_centers set operator = 'ekom21'                                                     where slug = 'ekom21-gie-en';
update data_centers set operator = 'GWDG'                                                       where slug = 'gwdg-au-enstelle-gottingen';
update data_centers set operator = 'Boreus Rechenzentrum GmbH'                                  where slug = 'boreus-rechenzentrum-gmbh-stralsund';
update data_centers set operator = 'Euregiocenter'                                              where slug = 'euregiocenter-aachen';

-- Singapore (10)
update data_centers set operator = 'Global Switch'                                              where slug = 'global-switch-singapore';
update data_centers set operator = 'Google'                                                     where slug = 'google-singapore-dc-singapore';
update data_centers set operator = 'Digital Realty'                                             where slug = 'digital-realty-data-center-singapore';
update data_centers set operator = 'Princeton Digital Group'                                    where slug = 'princetondg-sg1-singapore-singapore';
update data_centers set operator = 'Singtel'                                                    where slug = 'singtel-kim-chuan-telecommunications-centre-singapore';
update data_centers set operator = 'DC West'                                                    where slug = 'dc-west-singapore';
update data_centers set operator = 'Epsilon'                                                    where slug = 'epsilon-telecommunications-singapore-data-center-singapore';
update data_centers set operator = 'StarHub'                                                    where slug = 'starhub-data-center-tai-seng-singapore';
update data_centers set operator = 'M1 Limited'                                                 where slug = 'm1-next-gen-data-center-singapore';
update data_centers set operator = 'Singtel'                                                    where slug = 'singtel-bedok-data-center-singapore';

-- United Kingdom (3)
update data_centers set operator = 'VIRTUS Data Centres'                                        where slug = 'virtus-london-11-slough';
update data_centers set operator = 'Stellium Datacentres Limited'                               where slug = 'stellium-newcastle-campus-wallsend';
update data_centers set operator = 'Pulsant'                                                    where slug = 'pulsant-reading';

-- United States (2)
update data_centers set operator = 'Cherokee Data Center'                                       where slug = 'cherokee-data-center-tulsa';
update data_centers set operator = 'Data Storage Centers'                                       where slug = 'data-storage-centers-phoenix';

-- One-offs (CH, FI, MD, MY, RU, TW, XK)
update data_centers set operator = '24 hours fiberwork ag'                                      where slug = '24-hours-fiberwork-ag-luzern';
update data_centers set operator = 'Easylinehost Finland Oy'                                    where slug = 'easylinehost-finland-oy-kuopio';
update data_centers set operator = 'Trabia-Network'                                             where slug = 'trabia-network-chisinau';
update data_centers set operator = 'IRIX'                                                       where slug = 'irix-dc-kuching';
update data_centers set operator = 'SDN'                                                        where slug = 'sdn';
update data_centers set operator = '中華電信'                                                   where slug = 'osm-way-449246887';
update data_centers set operator = 'Elektra'                                                    where slug = 'elektra-hani-i-elezit';
