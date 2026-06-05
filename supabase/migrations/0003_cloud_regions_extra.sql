alter table cloud_regions
  add column if not exists services    jsonb,
  add column if not exists source_url  text;
