/**
 * One-shot inspection of the 34 facilities missing the `operator` field.
 * Goal: decide whether they're recoverable, structurally unknown, or noise.
 *
 * Run: npx tsx --env-file=.env.local scripts/audit-orphans.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await sb
    .from("data_centers")
    .select("slug, name, city, country, lat, lng")
    .or("operator.is.null,operator.eq.")
    .order("country");
  if (error) throw error;

  console.log(`# Missing-operator facilities (${data!.length})\n`);

  // Group by country
  const byCountry = new Map<string, typeof data>();
  for (const r of data!) {
    if (!byCountry.has(r.country)) byCountry.set(r.country, []);
    byCountry.get(r.country)!.push(r);
  }

  for (const [country, rows] of [...byCountry.entries()].sort(
    (a, b) => b[1]!.length - a[1]!.length,
  )) {
    console.log(`## ${country} (${rows!.length})\n`);
    for (const r of rows!) {
      console.log(`- \`${r.slug}\``);
      console.log(`  name: ${r.name}`);
      console.log(`  city: ${r.city ?? "—"}`);
      console.log();
    }
  }

  // Also peek at the source_records for one to see if operator is recoverable
  console.log("---\n");
  console.log("## Sample source_record peek\n");
  const sampleSlug = data![0]?.slug;
  if (sampleSlug) {
    const { data: src } = await sb
      .from("source_records")
      .select("source, source_id, payload")
      .eq(
        "data_center_id",
        (
          await sb.from("data_centers").select("id").eq("slug", sampleSlug).single()
        ).data!.id,
      )
      .limit(1);
    if (src?.[0]) {
      console.log(`Source: ${src[0].source}`);
      console.log("Payload (first 2000 chars):");
      console.log("```json");
      console.log(JSON.stringify(src[0].payload, null, 2).slice(0, 2000));
      console.log("```");
    } else {
      console.log("No source_records row for sample.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
