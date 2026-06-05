-- Networks (one row per PeeringDB network / ASN)
create table networks (
  id              uuid primary key default gen_random_uuid(),
  net_id          text unique not null,
  asn             integer not null,
  name            text not null,
  aka             text,
  name_long       text,
  website         text,
  info_type       text,
  info_scope      text,
  info_traffic    text,
  info_ratio      text,
  info_unicast    boolean,
  info_multicast  boolean,
  info_ipv6       boolean,
  policy_general  text,
  policy_url      text,
  irr_as_set      text,
  fetched_at      timestamptz not null default now()
);
create index networks_asn_idx on networks (asn);
create index networks_info_type_idx on networks (info_type);

-- Internet Exchange Points
create table ixes (
  id                uuid primary key default gen_random_uuid(),
  ix_id             text unique not null,
  name              text not null,
  name_long         text,
  city              text,
  country           text,
  region_continent  text,
  media             text,
  proto_unicast     boolean,
  proto_multicast   boolean,
  proto_ipv6        boolean,
  website           text,
  url_stats         text,
  tech_email        text,
  policy_email      text,
  net_count         integer,
  fetched_at        timestamptz not null default now()
);
create index ixes_country_idx on ixes (country);
create index ixes_net_count_idx on ixes (net_count desc);

-- M:N — networks present at facilities
create table networks_at_facility (
  id              uuid primary key default gen_random_uuid(),
  data_center_id  uuid not null references data_centers(id) on delete cascade,
  network_id      uuid not null references networks(id) on delete cascade,
  local_asn       integer,
  fetched_at      timestamptz not null default now(),
  unique (data_center_id, network_id)
);
create index naf_dc_idx on networks_at_facility (data_center_id);
create index naf_network_idx on networks_at_facility (network_id);

-- M:N — IXPs operating at facilities
create table ixes_at_facility (
  id              uuid primary key default gen_random_uuid(),
  data_center_id  uuid not null references data_centers(id) on delete cascade,
  ix_id           uuid not null references ixes(id) on delete cascade,
  fetched_at      timestamptz not null default now(),
  unique (data_center_id, ix_id)
);
create index iaf_dc_idx on ixes_at_facility (data_center_id);
create index iaf_ix_idx on ixes_at_facility (ix_id);

-- RLS — same public-read pattern as the rest of the schema
alter table networks               enable row level security;
alter table ixes                   enable row level security;
alter table networks_at_facility   enable row level security;
alter table ixes_at_facility       enable row level security;

create policy "public read networks"
  on networks for select to anon, authenticated using (true);

create policy "public read ixes"
  on ixes for select to anon, authenticated using (true);

create policy "public read networks_at_facility"
  on networks_at_facility for select to anon, authenticated using (true);

create policy "public read ixes_at_facility"
  on ixes_at_facility for select to anon, authenticated using (true);
