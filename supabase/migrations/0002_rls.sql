alter table data_centers   enable row level security;
alter table source_records enable row level security;
alter table cloud_regions  enable row level security;
alter table campuses       enable row level security;

create policy "public read data_centers"
  on data_centers for select
  to anon, authenticated
  using (true);

create policy "public read source_records"
  on source_records for select
  to anon, authenticated
  using (true);

create policy "public read cloud_regions"
  on cloud_regions for select
  to anon, authenticated
  using (true);

create policy "public read campuses"
  on campuses for select
  to anon, authenticated
  using (true);
