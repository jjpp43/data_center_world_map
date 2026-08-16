-- Allow source_records keys for Google/Meta buildings (already ingested)
-- and the new H5 / Vantage / Aligned operator-page scrapers.

alter table source_records drop constraint if exists source_records_source_check;
alter table source_records add constraint source_records_source_check
  check (source in (
    'peeringdb','aws','gcp','azure','oracle','osm','user',
    'equinix-com','digitalrealty-com','coresite-com','cyrusone-com',
    'qtsdatacenters-com','cologix-com','databank-com','ironmountain-com',
    'google-com','meta-com',
    'h5datacenters-com','vantage-dc-com','aligneddc-com'
  ));
