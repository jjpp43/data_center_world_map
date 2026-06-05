create extension if not exists postgis;
create extension if not exists pgcrypto;

create table campuses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  operator    text,
  city        text,
  country     text,
  lat         double precision,
  lng         double precision
);

create table data_centers (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  operator    text,

  address     text,
  city        text,
  region      text,
  country     text not null,
  postal_code text,
  lat         double precision not null,
  lng         double precision not null,
  geom        geography(point, 4326)
                generated always as
                (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,

  status      text not null default 'operational'
                check (status in ('operational','under_construction','planned','decommissioned')),

  power_mw    numeric,
  space_sqft  integer,
  tier        text check (tier in ('I','II','III','IV') or tier is null),
  year_built  integer,

  carriers       jsonb,
  ixps           jsonb,
  certifications jsonb,
  cooling        text,
  pue            numeric,
  website        text,

  footprint   geography(polygon, 4326),
  photos      jsonb,

  campus_id   uuid references campuses(id) on delete set null,

  verified    boolean not null default false,
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index data_centers_geom_idx     on data_centers using gist (geom);
create index data_centers_country_idx  on data_centers (country);
create index data_centers_operator_idx on data_centers (operator);
create index data_centers_status_idx   on data_centers (status);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger data_centers_updated_at
  before update on data_centers
  for each row execute function set_updated_at();

create table source_records (
  id              uuid primary key default gen_random_uuid(),
  data_center_id  uuid not null references data_centers(id) on delete cascade,
  source          text not null
                    check (source in ('peeringdb','aws','gcp','azure','oracle','osm','user')),
  source_id       text not null,
  source_url      text,
  raw             jsonb not null,
  fetched_at      timestamptz not null default now(),
  unique (source, source_id)
);
create index source_records_dc_idx on source_records (data_center_id);

create table cloud_regions (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null check (provider in ('aws','gcp','azure','oracle')),
  code            text not null,
  name            text not null,
  city            text,
  country         text,
  lat             double precision not null,
  lng             double precision not null,
  az_count        integer,
  launched_year   integer,
  unique (provider, code)
);

create or replace function match_data_center(
  p_operator  text,
  p_name      text,
  p_lat       double precision,
  p_lng       double precision,
  p_radius_m  integer default 100
) returns uuid as $$
declare
  v_id uuid;
begin
  if p_operator is not null and p_name is not null then
    select id into v_id from data_centers
      where operator = p_operator and name = p_name
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select id into v_id from data_centers
    where st_dwithin(
      geom,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
    order by st_distance(
      geom,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    )
    limit 1;
  return v_id;
end;
$$ language plpgsql stable;
