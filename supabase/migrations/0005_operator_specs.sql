-- Extend data_centers with operator-page spec fields (power topology, cabinet
-- density, cooling/UPS/generator redundancy, building description, etc.) and
-- allow the per-operator source keys emitted by the operator-page scrapers.

alter table data_centers
  add column if not exists code                   text,
  add column if not exists space_sqm              integer,
  add column if not exists raised_floor_sqft      integer,
  add column if not exists power_redundancy       text,
  add column if not exists min_cabinet_density_kw numeric,
  add column if not exists max_cabinet_density_kw numeric,
  add column if not exists cooling_redundancy     text,
  add column if not exists year_opened            integer,
  add column if not exists uptime_sla             text,
  add column if not exists generator_redundancy   text,
  add column if not exists generator_autonomy     text,
  add column if not exists ups_redundancy         text,
  add column if not exists power_distribution     text,
  add column if not exists building_description   text,
  add column if not exists site_acres             numeric,
  add column if not exists carriers_count         integer,
  add column if not exists ixps_count             integer,
  add column if not exists meet_me_rooms          integer,
  add column if not exists cross_connects_count   integer,
  add column if not exists security               jsonb,
  add column if not exists datasheet_url          text;

create index if not exists data_centers_code_idx on data_centers (code);

alter table source_records drop constraint if exists source_records_source_check;
alter table source_records add constraint source_records_source_check
  check (source in (
    'peeringdb','aws','gcp','azure','oracle','osm','user',
    'equinix-com','digitalrealty-com','coresite-com','cyrusone-com',
    'qtsdatacenters-com','cologix-com','databank-com','ironmountain-com'
  ));
