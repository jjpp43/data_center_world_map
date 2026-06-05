import { z } from "zod";

export const SourceName = z.enum(["peeringdb", "aws", "gcp", "azure", "oracle", "osm", "user"]);
export type SourceName = z.infer<typeof SourceName>;

export const Status = z.enum(["operational", "under_construction", "planned", "decommissioned"]);
export type Status = z.infer<typeof Status>;

export const Coord = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const SourceRef = z.object({
  source: SourceName,
  source_id: z.string().min(1),
  source_url: z.string().url(),
  fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
  raw: z.unknown(),
});

export const Facility = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  operator: z.string().nullable(),
  campus: z.string().nullable(),
  location: z.object({
    address: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    country: z.string().length(2).regex(/^[A-Z]{2}$/),
    postal_code: z.string().nullable(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  status: Status,
  specs: z.object({
    power_mw: z.number().nullable(),
    space_sqft: z.number().nullable(),
    space_sqm: z.number().nullable(),
    tier: z.enum(["I", "II", "III", "IV"]).nullable(),
    year_built: z.number().int().nullable(),
    cooling: z.string().nullable(),
    pue: z.number().nullable(),
  }),
  connectivity: z.object({
    carriers: z.array(z.string()).nullable(),
    ixps: z.array(z.string()).nullable(),
    cross_connects: z.number().nullable(),
  }),
  certifications: z.array(z.string()).nullable(),
  media: z.object({
    photos: z
      .array(
        z.object({
          url: z.string().url(),
          credit: z.string().nullable(),
          caption: z.string().nullable(),
        })
      )
      .nullable(),
    website: z.string().nullable(),
  }),
  footprint: z.unknown().nullable(),
  sources: z.array(SourceRef).min(1),
});

export type Facility = z.infer<typeof Facility>;

export const CloudRegion = z.object({
  provider: z.enum(["aws", "gcp", "azure", "oracle"]),
  code: z.string().min(1),
  name: z.string().min(1),
  city: z.string().nullable(),
  country: z.string().length(2).regex(/^[A-Z]{2}$/).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  az_count: z.number().int().nullable(),
  launched_year: z.number().int().nullable(),
  services: z.array(z.string()).nullable(),
  source_url: z.string().url(),
});

export type CloudRegion = z.infer<typeof CloudRegion>;

/**
 * Empty/sentinel-aware nullifier. Returns null for null, undefined,
 * empty strings, "unknown"/"n/a"/"none" (case-insensitive), and number 0
 * when treatZeroAsNull is true.
 */
export function nullIfBlank(v: unknown, treatZeroAsNull = false): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (treatZeroAsNull && v === 0) return null;
    return String(v);
  }
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0) return null;
  if (/^(unknown|n\/?a|none|null)$/i.test(t)) return null;
  return t;
}

export function nullIfZero(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v)) return null;
  if (v === 0) return null;
  return v;
}
