/**
 * Data quality audit — read-only sweep of the canonical data_centers table.
 *
 * Run:   npm run audit:quality
 * Save:  npm run audit:quality > audit.md
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

interface Row {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  city: string | null;
  country: string;
  lat: number;
  lng: number;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
  year_built: number | null;
  pue: number | null;
}

async function loadAll(): Promise<Row[]> {
  const all: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("data_centers")
      .select(
        "id, slug, name, operator, city, country, lat, lng, status, power_mw, space_sqft, year_built, pue",
      )
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  return all;
}

function pct(n: number, d: number): string {
  return d === 0 ? "0%" : `${((n / d) * 100).toFixed(1)}%`;
}

const SUFFIX = /\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|company|trust|realty|technologies|technology|tech|communications|comm|systems|sys|group|holdings|sa|gmbh|kgaa|ag|nv|bv|spa|plc|kk|pty)\b\.?/g;

function normalizeOperator(s: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(SUFFIX, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function haversineMeters(a: Row, b: Row): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function main() {
  console.log("# Data quality audit\n");
  console.log(`_Run at ${new Date().toISOString()}_\n`);

  const rows = await loadAll();
  console.log(`**${rows.length.toLocaleString()}** facilities loaded.\n`);

  // ─── 1. Bad coordinates ─────────────────────────────────────────────
  const nullIsland = rows.filter(
    (r) => Math.abs(r.lat) < 0.01 && Math.abs(r.lng) < 0.01,
  );
  const outOfRange = rows.filter(
    (r) => r.lat > 90 || r.lat < -90 || r.lng > 180 || r.lng < -180,
  );
  console.log("## 1. Coordinate sanity\n");
  console.log(`- Null Island (0,0 ±0.01°): **${nullIsland.length}**`);
  console.log(`- Out of valid range: **${outOfRange.length}**\n`);
  for (const r of nullIsland.slice(0, 5)) {
    console.log(
      `  - \`${r.slug}\` (${r.operator ?? "no operator"}) lat=${r.lat} lng=${r.lng}`,
    );
  }
  if (nullIsland.length || outOfRange.length) console.log();

  // ─── 2. Placeholder coordinate clusters ─────────────────────────────
  const buckets = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }
  const clusters = [...buckets.entries()]
    .filter(([, rs]) => rs.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);

  console.log("## 2. Placeholder coordinate clusters\n");
  console.log(
    "Facilities sharing identical coords (±11m). 3+ at the exact same point usually = city-center placeholder, not real address.\n",
  );
  console.log(`Clusters of 3+: **${clusters.length}**\n`);
  for (const [coord, rs] of clusters.slice(0, 10)) {
    const cityHint = rs[0].city ?? "—";
    console.log(
      `- ${rs.length}× at \`${coord}\` (${cityHint}) — ${rs
        .slice(0, 3)
        .map((r) => r.slug)
        .join(", ")}${rs.length > 3 ? ", …" : ""}`,
    );
  }
  console.log();

  // ─── 3. Operator string inconsistency ───────────────────────────────
  const opBuckets = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.operator) continue;
    const n = normalizeOperator(r.operator);
    if (!n) continue;
    if (!opBuckets.has(n)) opBuckets.set(n, new Set());
    opBuckets.get(n)!.add(r.operator);
  }
  const inconsistent = [...opBuckets.entries()]
    .filter(([, s]) => s.size > 1)
    .sort((a, b) => b[1].size - a[1].size);

  console.log("## 3. Operator string inconsistency\n");
  console.log(
    "Same normalized operator written multiple ways. Breaks the operator landing pages and the operator filter.\n",
  );
  console.log(`Normalized groups with >1 variant: **${inconsistent.length}**\n`);
  for (const [norm, set] of inconsistent.slice(0, 15)) {
    const variants = [...set]
      .slice(0, 4)
      .map((v) => `"${v}"`)
      .join(" · ");
    console.log(`- \`${norm}\` (${set.size}): ${variants}${set.size > 4 ? " · …" : ""}`);
  }
  console.log();

  // ─── 4. Status distribution ─────────────────────────────────────────
  const statusCount = new Map<string, number>();
  for (const r of rows) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);
  console.log("## 4. Status distribution\n");
  for (const [s, c] of [...statusCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`- \`${s}\`: ${c.toLocaleString()} (${pct(c, rows.length)})`);
  }
  console.log();

  // ─── 5. Suspicious spec values ──────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const hugePower = rows.filter((r) => r.power_mw != null && r.power_mw > 1000);
  const tinyPower = rows.filter((r) => r.power_mw != null && r.power_mw <= 0);
  const hugeSpace = rows.filter(
    (r) => r.space_sqft != null && r.space_sqft > 5_000_000,
  );
  const tinySpace = rows.filter(
    (r) => r.space_sqft != null && r.space_sqft <= 0,
  );
  const oldYear = rows.filter((r) => r.year_built != null && r.year_built < 1990);
  const futureYear = rows.filter(
    (r) => r.year_built != null && r.year_built > currentYear,
  );
  const badPue = rows.filter(
    (r) => r.pue != null && (r.pue < 1.0 || r.pue > 3.5),
  );

  console.log("## 5. Suspicious spec values\n");
  console.log(`- \`power_mw\` > 1,000 MW: **${hugePower.length}**`);
  console.log(`- \`power_mw\` ≤ 0: **${tinyPower.length}**`);
  console.log(`- \`space_sqft\` > 5,000,000: **${hugeSpace.length}**`);
  console.log(`- \`space_sqft\` ≤ 0: **${tinySpace.length}**`);
  console.log(`- \`year_built\` < 1990: **${oldYear.length}**`);
  console.log(`- \`year_built\` > ${currentYear}: **${futureYear.length}**`);
  console.log(`- \`pue\` outside [1.0, 3.5]: **${badPue.length}**\n`);
  const samples = [...hugePower, ...tinyPower, ...badPue].slice(0, 8);
  for (const r of samples) {
    console.log(
      `  - \`${r.slug}\` → power=${r.power_mw ?? "—"}MW · space=${r.space_sqft ?? "—"} · pue=${r.pue ?? "—"}`,
    );
  }
  if (samples.length) console.log();

  // ─── 6. Empty / null required fields ────────────────────────────────
  const emptyName = rows.filter((r) => !r.name?.trim());
  const noOperator = rows.filter((r) => !r.operator?.trim());
  const badCountry = rows.filter(
    (r) => !r.country || r.country.length !== 2 || !/^[A-Z]{2}$/.test(r.country),
  );
  console.log("## 6. Required-field gaps\n");
  console.log(`- Empty/whitespace \`name\`: **${emptyName.length}**`);
  console.log(
    `- Missing \`operator\`: **${noOperator.length}** (${pct(noOperator.length, rows.length)})`,
  );
  console.log(
    `- \`country\` not 2-char ISO upper: **${badCountry.length}**\n`,
  );
  for (const r of badCountry.slice(0, 5)) {
    console.log(`  - \`${r.slug}\` → country=\`${r.country}\``);
  }
  if (badCountry.length) console.log();

  // ─── 7. Near-duplicates within 100m, different operators ────────────
  const byCountry = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byCountry.has(r.country)) byCountry.set(r.country, []);
    byCountry.get(r.country)!.push(r);
  }
  type NearPair = { a: Row; b: Row; m: number };
  const near: NearPair[] = [];
  for (const [, group] of byCountry) {
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        if (Math.abs(a.lat - b.lat) > 0.002 || Math.abs(a.lng - b.lng) > 0.002)
          continue;
        const m = haversineMeters(a, b);
        if (m >= 100) continue;
        if (normalizeOperator(a.operator) === normalizeOperator(b.operator)) continue;
        near.push({ a, b, m });
      }
    }
  }
  console.log("## 7. Near-duplicate pairs (<100m, different operators)\n");
  console.log(
    "Could be a true campus with multiple operators (legitimate) or a slipped duplicate. Worth eyeballing.\n",
  );
  console.log(`Pairs: **${near.length}**\n`);
  near.sort((a, b) => a.m - b.m);
  for (const { a, b, m } of near.slice(0, 20)) {
    console.log(
      `- ${m.toFixed(0)}m · \`${a.slug}\` (${a.operator}) ↔ \`${b.slug}\` (${b.operator})`,
    );
  }
  console.log();

  // ─── 8. Field-fill summary ──────────────────────────────────────────
  const filled = (k: keyof Row) =>
    rows.filter((r) => r[k] != null && r[k] !== "").length;
  console.log("## 8. Field fill rates\n");
  for (const k of [
    "power_mw",
    "space_sqft",
    "year_built",
    "pue",
    "city",
  ] as (keyof Row)[]) {
    const n = filled(k);
    console.log(`- \`${k}\`: ${n.toLocaleString()} / ${rows.length.toLocaleString()} (${pct(n, rows.length)})`);
  }
  console.log("\n---\n");
  console.log("Sources: live `data_centers` table at audit time. Read-only.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
