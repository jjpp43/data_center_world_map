import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { refreshSummaryViews, triggerRebuild } from "./_trigger-rebuild";

const SCRAPERS_OUT = path.join(process.cwd(), "scrapers/out");
const BATCH_SIZE = 500;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

type ScraperFacility = {
  slug: string;
  name: string;
  operator: string | null;
  campus: string | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string;
    postal_code: string | null;
    lat: number;
    lng: number;
  };
  status: string;
  specs?: {
    power_mw: number | null;
    space_sqft: number | null;
    space_sqm: number | null;
    tier: string | null;
    year_built: number | null;
    cooling: string | null;
    pue: number | null;
  } | null;
  connectivity?: {
    carriers: string[] | null;
    ixps: string[] | null;
    cross_connects: number | null;
  } | null;
  certifications?: string[] | null;
  media?: {
    photos: unknown | null;
    website: string | null;
  } | null;
  footprint?: unknown | null;
  sources: Array<{
    source: string;
    source_id: string;
    source_url?: string;
    raw: unknown;
    fetched_at: string;
  }>;
};

type ScraperRegion = {
  provider: "aws" | "gcp" | "azure" | "oracle";
  code: string;
  name: string;
  city: string | null;
  country: string;
  lat: number;
  lng: number;
  az_count: number | null;
  launched_year: number | null;
  services: string[] | null;
  source_url: string | null;
};

async function readJsonl<T>(file: string): Promise<T[]> {
  const text = await fs.readFile(file, "utf-8");
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function validLatLng(r: ScraperFacility): boolean {
  const { lat, lng } = r.location ?? {};
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const VALID_STATUS = new Set(["operational", "under_construction", "planned", "decommissioned"]);

async function ingestFacilities() {
  const file = path.join(SCRAPERS_OUT, "facilities.peeringdb.jsonl");
  console.log(`Reading ${file}`);
  const records = await readJsonl<ScraperFacility>(file);
  const valid = records.filter(validLatLng);
  console.log(`  ${valid.length} valid of ${records.length}`);

  const canonicalRaw = valid.map((r) => ({
    slug: r.slug,
    name: r.name,
    operator: r.operator,
    address: r.location.address,
    city: r.location.city,
    region: r.location.region,
    country: r.location.country,
    postal_code: r.location.postal_code,
    lat: r.location.lat,
    lng: r.location.lng,
    status: VALID_STATUS.has(r.status) ? r.status : "operational",
    power_mw: r.specs?.power_mw ?? null,
    space_sqft: r.specs?.space_sqft ?? null,
    tier: r.specs?.tier ?? null,
    year_built: r.specs?.year_built ?? null,
    cooling: r.specs?.cooling ?? null,
    pue: r.specs?.pue ?? null,
    carriers: r.connectivity?.carriers ?? null,
    ixps: r.connectivity?.ixps ?? null,
    certifications: r.certifications ?? null,
    website: r.media?.website ?? null,
    photos: r.media?.photos ?? null,
  }));

  const bySlug = new Map<string, (typeof canonicalRaw)[number]>();
  for (const c of canonicalRaw) {
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
  }
  const canonical = [...bySlug.values()];
  const slugDups = canonicalRaw.length - canonical.length;
  if (slugDups > 0) console.log(`  ${slugDups} duplicate slug(s) skipped`);

  console.log(`Upserting ${canonical.length} data_centers...`);
  const slugToId = new Map<string, string>();
  for (let i = 0; i < canonical.length; i += BATCH_SIZE) {
    const batch = canonical.slice(i, i + BATCH_SIZE);
    const { data, error } = await sb
      .from("data_centers")
      .upsert(batch, { onConflict: "slug" })
      .select("id, slug");
    if (error) {
      console.error(`  batch ${i}–${i + batch.length} failed:`, error);
      throw error;
    }
    for (const row of data ?? []) slugToId.set(row.slug, row.id);
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, canonical.length)}/${canonical.length}\r`);
  }
  console.log();
  console.log(`  mapped ${slugToId.size} slugs to IDs`);

  const sourceRecordsRaw = valid.flatMap((r) => {
    const id = slugToId.get(r.slug);
    if (!id) return [];
    return (r.sources ?? []).map((s) => ({
      data_center_id: id,
      source: s.source,
      source_id: s.source_id,
      source_url: s.source_url ?? null,
      raw: s.raw,
      fetched_at: s.fetched_at,
    }));
  });

  const bySource = new Map<string, (typeof sourceRecordsRaw)[number]>();
  for (const r of sourceRecordsRaw) {
    bySource.set(`${r.source}::${r.source_id}`, r);
  }
  const sourceRecords = [...bySource.values()];
  const sourceDups = sourceRecordsRaw.length - sourceRecords.length;
  if (sourceDups > 0) console.log(`  ${sourceDups} duplicate (source,source_id) skipped`);

  console.log(`Upserting ${sourceRecords.length} source_records...`);
  for (let i = 0; i < sourceRecords.length; i += BATCH_SIZE) {
    const batch = sourceRecords.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from("source_records")
      .upsert(batch, { onConflict: "source,source_id" });
    if (error) {
      console.error(`  batch ${i}–${i + batch.length} failed:`, error);
      throw error;
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, sourceRecords.length)}/${sourceRecords.length}\r`);
  }
  console.log();
}

async function ingestCloudRegions() {
  const providers: ScraperRegion["provider"][] = ["aws", "gcp", "azure", "oracle"];
  const all: ScraperRegion[] = [];
  for (const p of providers) {
    const file = path.join(SCRAPERS_OUT, `cloud_regions.${p}.jsonl`);
    try {
      const rows = await readJsonl<ScraperRegion>(file);
      all.push(...rows);
      console.log(`  ${p}: ${rows.length}`);
    } catch {
      console.log(`  ${p}: file missing, skipped`);
    }
  }

  const rows = all.map((r) => ({
    provider: r.provider,
    code: r.code,
    name: r.name,
    city: r.city,
    country: r.country,
    lat: r.lat,
    lng: r.lng,
    az_count: r.az_count,
    launched_year: r.launched_year,
    services: r.services,
    source_url: r.source_url,
  }));

  console.log(`Upserting ${rows.length} cloud_regions...`);
  const { error } = await sb
    .from("cloud_regions")
    .upsert(rows, { onConflict: "provider,code" });
  if (error) {
    console.error("  failed:", error);
    throw error;
  }
}

async function ingestOsm() {
  const file = path.join(SCRAPERS_OUT, "facilities.osm.jsonl");
  console.log(`Reading ${file}`);
  let records: ScraperFacility[];
  try {
    records = await readJsonl<ScraperFacility>(file);
  } catch {
    console.log("  file missing, skipped");
    return;
  }
  const valid = records.filter(validLatLng);
  console.log(`  ${valid.length} valid of ${records.length}`);

  let matched = 0;
  let created = 0;
  const newSourceRecords: Array<{
    data_center_id: string;
    source: string;
    source_id: string;
    source_url: string | null;
    raw: unknown;
    fetched_at: string;
  }> = [];

  for (let i = 0; i < valid.length; i++) {
    const r = valid[i];
    process.stdout.write(`  matching ${i + 1}/${valid.length}\r`);

    const { data: matchData, error: matchErr } = await sb.rpc("match_data_center", {
      p_operator: r.operator,
      p_name: r.name,
      p_lat: r.location.lat,
      p_lng: r.location.lng,
      p_radius_m: 100,
    });
    if (matchErr) {
      console.warn(`\n  match RPC failed for ${r.slug}: ${matchErr.message}`);
      continue;
    }

    let dcId: string | null = (matchData as string | null) ?? null;

    if (!dcId) {
      const canonical = {
        slug: r.slug,
        name: r.name,
        operator: r.operator,
        address: r.location.address,
        city: r.location.city,
        region: r.location.region,
        country: r.location.country,
        postal_code: r.location.postal_code,
        lat: r.location.lat,
        lng: r.location.lng,
        status: VALID_STATUS.has(r.status) ? r.status : "operational",
        power_mw: r.specs?.power_mw ?? null,
        space_sqft: r.specs?.space_sqft ?? null,
        tier: r.specs?.tier ?? null,
        year_built: r.specs?.year_built ?? null,
        cooling: r.specs?.cooling ?? null,
        pue: r.specs?.pue ?? null,
        carriers: r.connectivity?.carriers ?? null,
        ixps: r.connectivity?.ixps ?? null,
        certifications: r.certifications ?? null,
        website: r.media?.website ?? null,
        photos: r.media?.photos ?? null,
      };
      const { data: ins, error: insErr } = await sb
        .from("data_centers")
        .upsert(canonical, { onConflict: "slug" })
        .select("id")
        .single();
      if (insErr || !ins) {
        console.warn(`\n  insert failed for ${r.slug}: ${insErr?.message}`);
        continue;
      }
      dcId = ins.id;
      created++;
    } else {
      matched++;
    }

    if (!dcId) continue;
    const id: string = dcId;
    for (const s of r.sources ?? []) {
      newSourceRecords.push({
        data_center_id: id,
        source: s.source,
        source_id: s.source_id,
        source_url: s.source_url ?? null,
        raw: s.raw,
        fetched_at: s.fetched_at,
      });
    }
  }
  console.log();
  console.log(`  ${matched} matched to existing canonical, ${created} new canonical created`);

  const bySource = new Map<string, (typeof newSourceRecords)[number]>();
  for (const r of newSourceRecords) bySource.set(`${r.source}::${r.source_id}`, r);
  const sourceRecords = [...bySource.values()];

  console.log(`Upserting ${sourceRecords.length} OSM source_records...`);
  for (let i = 0; i < sourceRecords.length; i += BATCH_SIZE) {
    const batch = sourceRecords.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from("source_records")
      .upsert(batch, { onConflict: "source,source_id" });
    if (error) {
      console.error(`  batch ${i}–${i + batch.length} failed:`, error);
      throw error;
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, sourceRecords.length)}/${sourceRecords.length}\r`);
  }
  console.log();
}

type PeeringdbNet = {
  net_id: string;
  asn: number;
  name: string;
  aka: string | null;
  name_long: string | null;
  website: string | null;
  info_type: string | null;
  info_scope: string | null;
  info_traffic: string | null;
  info_ratio: string | null;
  info_unicast: boolean | null;
  info_multicast: boolean | null;
  info_ipv6: boolean | null;
  policy_general: string | null;
  policy_url: string | null;
  irr_as_set: string | null;
  fetched_at: string;
};

type PeeringdbIx = {
  ix_id: string;
  name: string;
  name_long: string | null;
  city: string | null;
  country: string | null;
  region_continent: string | null;
  media: string | null;
  proto_unicast: boolean | null;
  proto_multicast: boolean | null;
  proto_ipv6: boolean | null;
  website: string | null;
  url_stats: string | null;
  tech_email: string | null;
  policy_email: string | null;
  net_count: number | null;
  fetched_at: string;
};

type PeeringdbNetfac = {
  fac_id: string;
  net_id: string;
  asn: number;
  local_asn: number | null;
  fetched_at: string;
};

type PeeringdbIxfac = {
  fac_id: string;
  ix_id: string;
  fetched_at: string;
};

async function buildPeeringdbFacIdMap(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await sb
      .from("source_records")
      .select("source_id, data_center_id")
      .eq("source", "peeringdb")
      .order("source_id")
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) m.set(row.source_id, row.data_center_id);
    if (data.length < 1000) break;
  }
  return m;
}

async function buildLookupMap(
  table: string,
  idColumn: string,
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await sb
      .from(table)
      .select(`id, ${idColumn}`)
      .order(idColumn)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data as unknown as Array<Record<string, string>>) {
      m.set(row[idColumn], row.id);
    }
    if (data.length < 1000) break;
  }
  return m;
}

async function ingestPeeringdbNetworks() {
  const file = path.join(SCRAPERS_OUT, "peeringdb_net.jsonl");
  console.log(`Reading ${file}`);
  let records: PeeringdbNet[];
  try {
    records = await readJsonl<PeeringdbNet>(file);
  } catch {
    console.log("  file missing, skipped");
    return;
  }
  console.log(`  ${records.length} networks`);

  const seen = new Map<string, PeeringdbNet>();
  for (const r of records) seen.set(r.net_id, r);
  const rows = [...seen.values()].map((r) => ({
    net_id: r.net_id,
    asn: r.asn,
    name: r.name,
    aka: r.aka ?? null,
    name_long: r.name_long ?? null,
    website: r.website ?? null,
    info_type: r.info_type ?? null,
    info_scope: r.info_scope ?? null,
    info_traffic: r.info_traffic ?? null,
    info_ratio: r.info_ratio ?? null,
    info_unicast: r.info_unicast ?? null,
    info_multicast: r.info_multicast ?? null,
    info_ipv6: r.info_ipv6 ?? null,
    policy_general: r.policy_general ?? null,
    policy_url: r.policy_url ?? null,
    irr_as_set: r.irr_as_set ?? null,
    fetched_at: r.fetched_at,
  }));

  console.log(`Upserting ${rows.length} networks...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from("networks")
      .upsert(batch, { onConflict: "net_id" });
    if (error) {
      console.error(`  batch ${i}–${i + batch.length} failed:`, error);
      throw error;
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
  }
  console.log();
}

async function ingestPeeringdbIxes() {
  const file = path.join(SCRAPERS_OUT, "peeringdb_ix.jsonl");
  console.log(`Reading ${file}`);
  let records: PeeringdbIx[];
  try {
    records = await readJsonl<PeeringdbIx>(file);
  } catch {
    console.log("  file missing, skipped");
    return;
  }
  console.log(`  ${records.length} IXPs`);

  const seen = new Map<string, PeeringdbIx>();
  for (const r of records) seen.set(r.ix_id, r);
  const rows = [...seen.values()].map((r) => ({
    ix_id: r.ix_id,
    name: r.name,
    name_long: r.name_long ?? null,
    city: r.city ?? null,
    country: r.country ?? null,
    region_continent: r.region_continent ?? null,
    media: r.media ?? null,
    proto_unicast: r.proto_unicast ?? null,
    proto_multicast: r.proto_multicast ?? null,
    proto_ipv6: r.proto_ipv6 ?? null,
    website: r.website ?? null,
    url_stats: r.url_stats ?? null,
    tech_email: r.tech_email ?? null,
    policy_email: r.policy_email ?? null,
    net_count: r.net_count ?? null,
    fetched_at: r.fetched_at,
  }));

  console.log(`Upserting ${rows.length} ixes...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from("ixes")
      .upsert(batch, { onConflict: "ix_id" });
    if (error) {
      console.error(`  batch ${i}–${i + batch.length} failed:`, error);
      throw error;
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
  }
  console.log();
}

async function ingestPeeringdbNetfac() {
  const file = path.join(SCRAPERS_OUT, "peeringdb_netfac.jsonl");
  console.log(`Reading ${file}`);
  let records: PeeringdbNetfac[];
  try {
    records = await readJsonl<PeeringdbNetfac>(file);
  } catch {
    console.log("  file missing, skipped");
    return;
  }
  console.log(`  ${records.length} netfac rows`);

  console.log("  building fac_id → data_center_id map...");
  const facToDc = await buildPeeringdbFacIdMap();
  console.log(`    ${facToDc.size} mapped`);

  console.log("  building net_id → network.id map...");
  const netToId = await buildLookupMap("networks", "net_id");
  console.log(`    ${netToId.size} mapped`);

  let orphanFac = 0;
  let orphanNet = 0;
  const byKey = new Map<
    string,
    { data_center_id: string; network_id: string; local_asn: number | null; fetched_at: string }
  >();
  for (const r of records) {
    const dcId = facToDc.get(r.fac_id);
    const netId = netToId.get(r.net_id);
    if (!dcId) {
      orphanFac++;
      continue;
    }
    if (!netId) {
      orphanNet++;
      continue;
    }
    byKey.set(`${dcId}::${netId}`, {
      data_center_id: dcId,
      network_id: netId,
      local_asn: r.local_asn ?? null,
      fetched_at: r.fetched_at,
    });
  }
  const rows = [...byKey.values()];
  console.log(
    `  ${orphanFac} unknown fac_id, ${orphanNet} unknown net_id, ${records.length - rows.length - orphanFac - orphanNet} in-batch dupes`,
  );

  console.log(`Upserting ${rows.length} networks_at_facility...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from("networks_at_facility")
      .upsert(batch, { onConflict: "data_center_id,network_id" });
    if (error) {
      console.error(`  batch ${i}–${i + batch.length} failed:`, error);
      throw error;
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
  }
  console.log();
}

async function ingestPeeringdbIxfac() {
  const file = path.join(SCRAPERS_OUT, "peeringdb_ixfac.jsonl");
  console.log(`Reading ${file}`);
  let records: PeeringdbIxfac[];
  try {
    records = await readJsonl<PeeringdbIxfac>(file);
  } catch {
    console.log("  file missing, skipped");
    return;
  }
  console.log(`  ${records.length} ixfac rows`);

  console.log("  building fac_id → data_center_id map...");
  const facToDc = await buildPeeringdbFacIdMap();
  console.log(`    ${facToDc.size} mapped`);

  console.log("  building ix_id → ix.id map...");
  const ixToId = await buildLookupMap("ixes", "ix_id");
  console.log(`    ${ixToId.size} mapped`);

  let orphanFac = 0;
  let orphanIx = 0;
  const byKey = new Map<
    string,
    { data_center_id: string; ix_id: string; fetched_at: string }
  >();
  for (const r of records) {
    const dcId = facToDc.get(r.fac_id);
    const ixId = ixToId.get(r.ix_id);
    if (!dcId) {
      orphanFac++;
      continue;
    }
    if (!ixId) {
      orphanIx++;
      continue;
    }
    byKey.set(`${dcId}::${ixId}`, {
      data_center_id: dcId,
      ix_id: ixId,
      fetched_at: r.fetched_at,
    });
  }
  const rows = [...byKey.values()];
  console.log(
    `  ${orphanFac} unknown fac_id, ${orphanIx} unknown ix_id, ${records.length - rows.length - orphanFac - orphanIx} in-batch dupes`,
  );

  console.log(`Upserting ${rows.length} ixes_at_facility...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from("ixes_at_facility")
      .upsert(batch, { onConflict: "data_center_id,ix_id" });
    if (error) {
      console.error(`  batch ${i}–${i + batch.length} failed:`, error);
      throw error;
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
  }
  console.log();
}

type OperatorFacility = {
  slug: string;
  name: string;
  operator: string | null;
  campus: string | null;
  code: string | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
  };
  status: string;
  specs?: Record<string, unknown> | null;
  connectivity?: Record<string, unknown> | null;
  certifications?: string[] | null;
  security?: Record<string, unknown> | null;
  media?: {
    photos?: unknown | null;
    website?: string | null;
    datasheet_url?: string | null;
  } | null;
  sources: Array<{
    source: string;
    source_id: string;
    source_url?: string;
    raw: unknown;
    fetched_at: string;
  }>;
};

const VALID_TIERS = new Set(["I", "II", "III", "IV"]);

function normalizeTier(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const m = t.match(/\b(IV|III|II|I)\b/);
  return m && VALID_TIERS.has(m[1]) ? m[1] : null;
}

const ENRICH_SPEC_FIELDS = [
  "power_mw",
  "power_redundancy",
  "space_sqft",
  "space_sqm",
  "raised_floor_sqft",
  "min_cabinet_density_kw",
  "max_cabinet_density_kw",
  "cooling",
  "cooling_redundancy",
  "year_built",
  "year_opened",
  "pue",
  "uptime_sla",
  "generator_redundancy",
  "generator_autonomy",
  "ups_redundancy",
  "power_distribution",
  "building_description",
  "site_acres",
] as const;

const ENRICH_CONN_FIELDS = [
  "carriers_count",
  "ixps_count",
  "meet_me_rooms",
  "cross_connects_count",
] as const;

async function ingestOperatorPages() {
  const files = [
    "facilities.equinix.jsonl",
    "facilities.digital-realty.jsonl",
    "facilities.databank.jsonl",
    "facilities.cologix.jsonl",
    "facilities.coresite.jsonl",
    "facilities.cyrusone.jsonl",
    "facilities.qts.jsonl",
  ];

  const orphans: Array<{ op: string; slug: string; name: string; url: string }> = [];
  let totalEnriched = 0;
  let totalSourceRecords = 0;

  for (const file of files) {
    const filePath = path.join(SCRAPERS_OUT, file);
    let records: OperatorFacility[];
    try {
      records = await readJsonl<OperatorFacility>(filePath);
    } catch {
      console.log(`  ${file}: missing, skipped`);
      continue;
    }
    const op = records[0]?.operator ?? file;
    console.log(`  ${op}: ${records.length} records`);

    let matched = 0;
    let opOrphans = 0;
    const sourceRecords: Array<{
      data_center_id: string;
      source: string;
      source_id: string;
      source_url: string | null;
      raw: unknown;
      fetched_at: string;
    }> = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      process.stdout.write(`    ${i + 1}/${records.length}\r`);

      let dcId: string | null = null;

      const { data: m1 } = await sb.rpc("match_data_center", {
        p_operator: r.operator,
        p_name: r.name,
        p_lat: r.location.lat,
        p_lng: r.location.lng,
        p_radius_m: 100,
      });
      dcId = (m1 as string | null) ?? null;

      if (!dcId && r.operator && r.name) {
        const { data: rows } = await sb
          .from("data_centers")
          .select("id")
          .ilike("operator", `${r.operator}%`)
          .ilike("name", `${r.name}%`)
          .order("name", { ascending: true })
          .limit(1);
        if (rows && rows.length > 0) dcId = rows[0].id;
      }

      if (!dcId && r.operator && r.code) {
        const code = r.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const { data: rows } = await sb
          .from("data_centers")
          .select("id, name")
          .ilike("operator", `${r.operator}%`)
          .filter("name", "imatch", `\\m${code}\\M`)
          .order("name", { ascending: true })
          .limit(1);
        if (rows && rows.length > 0) dcId = rows[0].id;
      }

      if (!dcId) {
        opOrphans++;
        orphans.push({
          op,
          slug: r.slug,
          name: r.name,
          url: r.sources?.[0]?.source_url ?? "",
        });
        continue;
      }

      const updates: Record<string, unknown> = {};
      const setIf = (k: string, v: unknown) => {
        if (v !== null && v !== undefined && v !== "") updates[k] = v;
      };

      setIf("code", r.code);

      const s = (r.specs ?? {}) as Record<string, unknown>;
      for (const k of ENRICH_SPEC_FIELDS) setIf(k, s[k]);
      const tier = normalizeTier(s.tier);
      if (tier) updates.tier = tier;

      const c = (r.connectivity ?? {}) as Record<string, unknown>;
      for (const k of ENRICH_CONN_FIELDS) setIf(k, c[k]);

      if (r.certifications && r.certifications.length > 0) {
        updates.certifications = r.certifications;
      }
      if (r.security && Object.keys(r.security).length > 0) {
        updates.security = r.security;
      }
      setIf("datasheet_url", r.media?.datasheet_url);

      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await sb.from("data_centers").update(updates).eq("id", dcId);
        if (upErr) {
          console.warn(`\n    enrich failed for ${r.slug}: ${upErr.message}`);
          continue;
        }
      }
      matched++;

      for (const src of r.sources ?? []) {
        sourceRecords.push({
          data_center_id: dcId,
          source: src.source,
          source_id: src.source_id,
          source_url: src.source_url ?? null,
          raw: src.raw,
          fetched_at: src.fetched_at,
        });
      }
    }
    process.stdout.write("\n");
    console.log(`    enriched: ${matched}, orphans: ${opOrphans}`);
    totalEnriched += matched;

    const bySource = new Map<string, (typeof sourceRecords)[number]>();
    for (const s of sourceRecords) bySource.set(`${s.source}::${s.source_id}`, s);
    const deduped = [...bySource.values()];
    if (deduped.length > 0) {
      for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE);
        const { error } = await sb
          .from("source_records")
          .upsert(batch, { onConflict: "source,source_id" });
        if (error) {
          console.error(`    source_records batch failed:`, error);
          throw error;
        }
      }
      totalSourceRecords += deduped.length;
    }
  }

  console.log(
    `  Total: ${totalEnriched} enriched, ${orphans.length} orphans, ${totalSourceRecords} source_records`,
  );
  if (orphans.length > 0) {
    const orphanFile = path.join(SCRAPERS_OUT, "orphans.operator-pages.jsonl");
    await fs.writeFile(orphanFile, orphans.map((o) => JSON.stringify(o)).join("\n") + "\n");
    console.log(`  Wrote orphan log to ${orphanFile}`);
  }
}

async function main() {
  console.log("=== Cloud regions ===");
  await ingestCloudRegions();
  console.log("=== Facilities (PeeringDB) ===");
  await ingestFacilities();
  console.log("=== Facilities (OSM) ===");
  await ingestOsm();
  console.log("=== Operator pages (enrichment) ===");
  await ingestOperatorPages();
  console.log("=== Networks (PeeringDB) ===");
  await ingestPeeringdbNetworks();
  console.log("=== IXPs (PeeringDB) ===");
  await ingestPeeringdbIxes();
  console.log("=== Networks at facilities ===");
  await ingestPeeringdbNetfac();
  console.log("=== IXPs at facilities ===");
  await ingestPeeringdbIxfac();
  console.log("Done.");
  await refreshSummaryViews();
  await triggerRebuild("ingest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
