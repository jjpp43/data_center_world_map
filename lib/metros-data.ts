import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";

export interface Metro {
  slug: string;
  name: string;
  short_name?: string;
  country: string;
  region?: string;
  lat: number;
  lng: number;
  radius_km: number;
  aka?: string[];
  blurb?: string;
}

/**
 * Curated list of canonical data-center metros — the unit the industry actually
 * thinks in. A "metro" is finer than a country and coarser than a city: a
 * commercial cluster sharing latency, fiber, and grid characteristics.
 *
 * Each entry: a center point + radius_km. Facilities are assigned to the
 * nearest metro within radius (Haversine), so overlapping radii are fine —
 * the closer center wins. Tune radius up if a known site sits just outside.
 */
export const METROS: Metro[] = [
  // North America — US
  { slug: "northern-virginia", name: "Northern Virginia", short_name: "NoVA", country: "US", region: "Virginia, USA", lat: 39.0438, lng: -77.4874, radius_km: 70, aka: ["Ashburn", "Sterling", "NoVA"], blurb: "The world's largest data center metro — Ashburn and Loudoun County route an estimated 70% of global internet traffic at peak." },
  { slug: "silicon-valley", name: "Silicon Valley", country: "US", region: "California, USA", lat: 37.3541, lng: -121.9552, radius_km: 55, aka: ["Santa Clara", "San Jose", "Bay Area"], blurb: "Santa Clara and San Jose anchor the original cloud and SaaS hub." },
  { slug: "dallas-fort-worth", name: "Dallas–Fort Worth", short_name: "DFW", country: "US", region: "Texas, USA", lat: 32.9, lng: -97.05, radius_km: 65, aka: ["Dallas", "Plano", "Garland"], blurb: "ERCOT's largest metro for colocation, with cheap Texas power and central-US latency." },
  { slug: "chicago", name: "Chicago", country: "US", region: "Illinois, USA", lat: 41.85, lng: -87.65, radius_km: 55, aka: ["Elk Grove Village"], blurb: "Midwest interconnection hub at 350 East Cermak and the Elk Grove campus belt." },
  { slug: "phoenix", name: "Phoenix", country: "US", region: "Arizona, USA", lat: 33.45, lng: -112.07, radius_km: 60, aka: ["Mesa", "Chandler"], blurb: "Fast-growing dry-climate metro — favored for hyperscale builds avoiding NoVA congestion." },
  { slug: "new-york-new-jersey", name: "New York / New Jersey", short_name: "NY/NJ", country: "US", region: "USA", lat: 40.75, lng: -74.05, radius_km: 60, aka: ["Secaucus", "Newark", "Piscataway"], blurb: "Wall Street latency demand pulls finance-heavy colos into northern New Jersey." },
  { slug: "atlanta", name: "Atlanta", country: "US", region: "Georgia, USA", lat: 33.75, lng: -84.4, radius_km: 50, blurb: "Southeast US interconnection anchor — 56 Marietta and adjacent campuses." },
  { slug: "los-angeles", name: "Los Angeles", short_name: "LA", country: "US", region: "California, USA", lat: 34.05, lng: -118.24, radius_km: 60, aka: ["El Segundo"], blurb: "Pacific cable landings plus media/CDN demand drive LA's colo density." },
  { slug: "seattle", name: "Seattle", country: "US", region: "Washington, USA", lat: 47.6, lng: -122.3, radius_km: 50, blurb: "Westin Building Exchange and Quincy hyperscale campuses dominate the Pacific Northwest." },
  { slug: "boston", name: "Boston", country: "US", region: "Massachusetts, USA", lat: 42.36, lng: -71.06, radius_km: 40, blurb: "New England's interconnection center, anchored by Markley One Summer Street." },
  { slug: "miami", name: "Miami", country: "US", region: "Florida, USA", lat: 25.78, lng: -80.2, radius_km: 50, blurb: "Latin American gateway — NAP of the Americas pulls 23+ subsea cables." },
  { slug: "denver", name: "Denver", country: "US", region: "Colorado, USA", lat: 39.74, lng: -104.99, radius_km: 50, blurb: "Mountain West connectivity hub at 910 15th Street." },
  { slug: "houston", name: "Houston", country: "US", region: "Texas, USA", lat: 29.76, lng: -95.37, radius_km: 50, blurb: "Energy-sector demand plus Latin American subsea cables." },
  { slug: "portland-or", name: "Portland (OR)", country: "US", region: "Oregon, USA", lat: 45.51, lng: -122.68, radius_km: 70, aka: ["Hillsboro", "The Dalles"], blurb: "Hillsboro and The Dalles host AWS, Google, and Meta hyperscale campuses." },
  { slug: "reno", name: "Reno–Tahoe", country: "US", region: "Nevada, USA", lat: 39.53, lng: -119.81, radius_km: 60, aka: ["Sparks"], blurb: "Switch's Citadel campus and tax-friendly Nevada power draw hyperscale builds." },
  { slug: "salt-lake-city", name: "Salt Lake City", country: "US", region: "Utah, USA", lat: 40.76, lng: -111.89, radius_km: 50, blurb: "Bluffdale federal complex and Western US interconnection." },
  { slug: "columbus-oh", name: "Columbus (OH)", country: "US", region: "Ohio, USA", lat: 39.96, lng: -82.99, radius_km: 50, aka: ["New Albany"], blurb: "Hyperscale's fastest-growing US metro — Meta, Google, AWS all building." },
  { slug: "minneapolis", name: "Minneapolis", country: "US", region: "Minnesota, USA", lat: 44.98, lng: -93.27, radius_km: 40, blurb: "Upper Midwest connectivity hub." },

  // North America — Canada
  { slug: "toronto", name: "Toronto", country: "CA", region: "Ontario, Canada", lat: 43.65, lng: -79.38, radius_km: 60, aka: ["Vaughan", "Markham"], blurb: "Canada's largest colo metro — 151 Front Street is the national interconnection point." },
  { slug: "montreal", name: "Montréal", country: "CA", region: "Québec, Canada", lat: 45.5, lng: -73.57, radius_km: 50, blurb: "Hydro-Québec's cheap clean power makes Montréal a hyperscale magnet." },

  // Europe — FLAP-D
  { slug: "frankfurt", name: "Frankfurt", country: "DE", region: "Hesse, Germany", lat: 50.11, lng: 8.68, radius_km: 40, blurb: "Continental Europe's largest metro — DE-CIX is the world's largest internet exchange by traffic." },
  { slug: "london", name: "London", country: "GB", region: "United Kingdom", lat: 51.51, lng: -0.13, radius_km: 60, aka: ["Slough", "Docklands"], blurb: "Slough and Docklands form the UK's interconnection backbone." },
  { slug: "amsterdam", name: "Amsterdam", country: "NL", region: "Netherlands", lat: 52.37, lng: 4.9, radius_km: 50, aka: ["Schiphol"], blurb: "AMS-IX and 24/7 chilled-water cooling drive one of Europe's densest colo clusters." },
  { slug: "paris", name: "Paris", country: "FR", region: "Île-de-France, France", lat: 48.85, lng: 2.35, radius_km: 45, blurb: "France-IX anchor; growing share of European hyperscale capacity." },
  { slug: "dublin", name: "Dublin", country: "IE", region: "Ireland", lat: 53.35, lng: -6.26, radius_km: 40, blurb: "Tax-driven hyperscale cluster — Microsoft, Google, AWS, Meta all anchor European ops here." },

  // Europe — secondary
  { slug: "madrid", name: "Madrid", country: "ES", region: "Spain", lat: 40.42, lng: -3.7, radius_km: 50, blurb: "Iberian peninsula's primary interconnection hub." },
  { slug: "milan", name: "Milan", country: "IT", region: "Italy", lat: 45.46, lng: 9.19, radius_km: 40, blurb: "Italy's data-center capital and MIX exchange anchor." },
  { slug: "stockholm", name: "Stockholm", country: "SE", region: "Sweden", lat: 59.33, lng: 18.07, radius_km: 50, blurb: "Nordic free-cooling and Netnod IX draw hyperscale capacity." },
  { slug: "warsaw", name: "Warsaw", country: "PL", region: "Poland", lat: 52.23, lng: 21.01, radius_km: 40, blurb: "Central Europe's fastest-growing colo metro." },
  { slug: "berlin", name: "Berlin", country: "DE", region: "Germany", lat: 52.52, lng: 13.4, radius_km: 40, blurb: "Secondary German metro behind Frankfurt." },
  { slug: "zurich", name: "Zürich", country: "CH", region: "Switzerland", lat: 47.38, lng: 8.54, radius_km: 30, blurb: "Financial-sector demand drives premium Swiss colo capacity." },
  { slug: "marseille", name: "Marseille", country: "FR", region: "France", lat: 43.3, lng: 5.37, radius_km: 30, blurb: "Mediterranean cable-landing hub — 16+ subsea cables make it Europe's fastest-growing metro." },
  { slug: "copenhagen", name: "Copenhagen", country: "DK", region: "Denmark", lat: 55.68, lng: 12.57, radius_km: 50, blurb: "Apple, Meta, and Microsoft hyperscale campuses across Jutland." },
  { slug: "helsinki", name: "Helsinki", country: "FI", region: "Finland", lat: 60.17, lng: 24.94, radius_km: 50, blurb: "Cold-climate hyperscale region — Google's Hamina campus and others." },
  { slug: "oslo", name: "Oslo", country: "NO", region: "Norway", lat: 59.91, lng: 10.75, radius_km: 40, blurb: "Hydro-powered Nordic colos." },
  { slug: "vienna", name: "Vienna", country: "AT", region: "Austria", lat: 48.21, lng: 16.37, radius_km: 30, blurb: "Vienna IX and Eastern European gateway." },

  // APAC
  { slug: "singapore", name: "Singapore", country: "SG", lat: 1.35, lng: 103.82, radius_km: 25, blurb: "Southeast Asia's interconnection capital — sustained moratorium-era constraint makes capacity scarce." },
  { slug: "tokyo", name: "Tokyo", country: "JP", region: "Japan", lat: 35.68, lng: 139.69, radius_km: 70, aka: ["Inzai", "Chiba"], blurb: "Asia's largest metro by capacity — Inzai's hyperscale belt anchors the cluster." },
  { slug: "osaka", name: "Osaka", country: "JP", region: "Japan", lat: 34.69, lng: 135.5, radius_km: 40, blurb: "Japan's secondary metro and DR pair for Tokyo." },
  { slug: "hong-kong", name: "Hong Kong", country: "HK", lat: 22.32, lng: 114.17, radius_km: 30, aka: ["Tseung Kwan O", "Tsuen Wan"], blurb: "South China gateway with HKIX as the regional anchor." },
  { slug: "seoul", name: "Seoul", country: "KR", region: "South Korea", lat: 37.57, lng: 126.98, radius_km: 50, blurb: "KINX and growing hyperscale demand drive Korean capacity." },
  { slug: "sydney", name: "Sydney", country: "AU", region: "Australia", lat: -33.87, lng: 151.21, radius_km: 60, blurb: "ANZ region's primary interconnection metro." },
  { slug: "melbourne", name: "Melbourne", country: "AU", region: "Australia", lat: -37.81, lng: 144.96, radius_km: 50, blurb: "Australia's secondary colo metro." },
  { slug: "mumbai", name: "Mumbai", country: "IN", region: "India", lat: 19.08, lng: 72.88, radius_km: 50, blurb: "India's largest data-center metro and primary cable-landing point." },
  { slug: "chennai", name: "Chennai", country: "IN", region: "India", lat: 13.08, lng: 80.27, radius_km: 40, blurb: "Cable-landing hub on India's east coast." },
  { slug: "bangalore", name: "Bengaluru", country: "IN", region: "India", lat: 12.97, lng: 77.59, radius_km: 40, blurb: "India's tech capital and a fast-growing colo metro." },
  { slug: "jakarta", name: "Jakarta", country: "ID", region: "Indonesia", lat: -6.21, lng: 106.85, radius_km: 50, blurb: "Indonesia's primary metro — hyperscale build-out underway." },
  { slug: "kuala-lumpur", name: "Kuala Lumpur", country: "MY", region: "Malaysia", lat: 3.14, lng: 101.69, radius_km: 60, aka: ["Cyberjaya", "Johor"], blurb: "Cyberjaya and Johor capture spillover from Singapore's constraint." },
  { slug: "bangkok", name: "Bangkok", country: "TH", region: "Thailand", lat: 13.76, lng: 100.5, radius_km: 40 },
  { slug: "manila", name: "Manila", country: "PH", region: "Philippines", lat: 14.6, lng: 120.98, radius_km: 40 },
  { slug: "taipei", name: "Taipei", country: "TW", region: "Taiwan", lat: 25.03, lng: 121.57, radius_km: 30 },

  // LATAM
  { slug: "sao-paulo", name: "São Paulo", country: "BR", region: "Brazil", lat: -23.55, lng: -46.63, radius_km: 60, blurb: "Latin America's largest metro and IX anchor." },
  { slug: "rio-de-janeiro", name: "Rio de Janeiro", country: "BR", region: "Brazil", lat: -22.91, lng: -43.17, radius_km: 40 },
  { slug: "mexico-city", name: "Mexico City", country: "MX", region: "Mexico", lat: 19.43, lng: -99.13, radius_km: 50, aka: ["Querétaro"], blurb: "Mexico's primary metro — Querétaro hyperscale region adjacent." },
  { slug: "santiago", name: "Santiago", country: "CL", region: "Chile", lat: -33.45, lng: -70.66, radius_km: 40 },
  { slug: "bogota", name: "Bogotá", country: "CO", region: "Colombia", lat: 4.71, lng: -74.07, radius_km: 40 },

  // Middle East / Africa
  { slug: "dubai", name: "Dubai", country: "AE", region: "United Arab Emirates", lat: 25.2, lng: 55.27, radius_km: 50, blurb: "Gulf region's primary metro." },
  { slug: "tel-aviv", name: "Tel Aviv", country: "IL", region: "Israel", lat: 32.09, lng: 34.78, radius_km: 30 },
  { slug: "johannesburg", name: "Johannesburg", country: "ZA", region: "South Africa", lat: -26.2, lng: 28.05, radius_km: 50, blurb: "Africa's largest data-center metro and NAPAfrica IX home." },
  { slug: "cape-town", name: "Cape Town", country: "ZA", region: "South Africa", lat: -33.92, lng: 18.42, radius_km: 40 },
  { slug: "lagos", name: "Lagos", country: "NG", region: "Nigeria", lat: 6.45, lng: 3.4, radius_km: 40 },
  { slug: "nairobi", name: "Nairobi", country: "KE", region: "Kenya", lat: -1.29, lng: 36.82, radius_km: 40 },
];

export const METROS_BY_SLUG: Record<string, Metro> = Object.fromEntries(
  METROS.map((m) => [m.slug, m]),
);

export interface MetroSummary extends Metro {
  facility_count: number;
  operator_count: number;
  total_power_mw: number | null;
}

interface FacilityRow {
  slug: string;
  name: string;
  operator: string | null;
  country: string;
  city: string | null;
  lat: number;
  lng: number;
  power_mw: number | null;
  networks_at_facility: Array<{ count: number }> | null;
}

interface FacilityWithNetCount {
  slug: string;
  name: string;
  operator: string | null;
  country: string;
  city: string | null;
  lat: number;
  lng: number;
  power_mw: number | null;
  network_count: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Assign a facility to the closest metro whose radius contains it. Returns
 * null when the facility falls outside every metro — these stay reachable
 * through `/countries/[code]` and `/operators/[slug]` instead.
 */
export function assignMetro(lat: number, lng: number, country?: string): Metro | null {
  let best: { metro: Metro; dist: number } | null = null;
  for (const m of METROS) {
    if (country && m.country !== country) continue;
    const d = haversineKm(lat, lng, m.lat, m.lng);
    if (d > m.radius_km) continue;
    if (!best || d < best.dist) best = { metro: m, dist: d };
  }
  return best?.metro ?? null;
}

const loadAllFacilities = unstable_cache(
  async (): Promise<FacilityWithNetCount[]> => {
    const sb = supabaseServer();
    const rows: FacilityWithNetCount[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await sb
        .from("data_centers")
        .select(
          "slug, name, operator, country, city, lat, lng, power_mw, networks_at_facility(count)",
        )
        .neq("status", "decommissioned")
        .not("lat", "is", null)
        .not("lng", "is", null)
        .order("slug")
        .range(from, from + 999)
        .returns<FacilityRow[]>();
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(
        ...data.map((r) => ({
          slug: r.slug,
          name: r.name,
          operator: r.operator,
          country: r.country,
          city: r.city,
          lat: r.lat,
          lng: r.lng,
          power_mw: r.power_mw,
          network_count: r.networks_at_facility?.[0]?.count ?? 0,
        })),
      );
      if (data.length < 1000) break;
    }
    return rows;
  },
  ["metro-facilities-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

export async function loadMetroSummaries(): Promise<MetroSummary[]> {
  const facilities = await loadAllFacilities();
  const agg = new Map<string, { count: number; operators: Set<string>; mw: number | null }>();
  for (const f of facilities) {
    const metro = assignMetro(f.lat, f.lng, f.country);
    if (!metro) continue;
    const cur = agg.get(metro.slug) ?? { count: 0, operators: new Set<string>(), mw: null };
    cur.count += 1;
    if (f.operator) cur.operators.add(f.operator);
    if (f.power_mw != null) cur.mw = (cur.mw ?? 0) + f.power_mw;
    agg.set(metro.slug, cur);
  }
  return METROS
    .map((m) => {
      const a = agg.get(m.slug);
      return {
        ...m,
        facility_count: a?.count ?? 0,
        operator_count: a?.operators.size ?? 0,
        total_power_mw: a?.mw ?? null,
      };
    })
    .filter((m) => m.facility_count > 0)
    .sort((a, b) => b.facility_count - a.facility_count);
}

export interface MetroDetail {
  metro: Metro;
  facilities: Array<{
    slug: string;
    name: string;
    operator: string | null;
    city: string | null;
    power_mw: number | null;
    network_count: number;
  }>;
  operator_ranking: Array<{ operator: string; facility_count: number }>;
  total_power_mw: number | null;
  total_networks: number;
}

export async function loadMetroDetail(slug: string): Promise<MetroDetail | null> {
  const metro = METROS_BY_SLUG[slug];
  if (!metro) return null;
  const all = await loadAllFacilities();
  const inMetro = all.filter((f) => {
    if (f.country !== metro.country) return false;
    return haversineKm(f.lat, f.lng, metro.lat, metro.lng) <= metro.radius_km;
  });
  // Filter again with global assignMetro so we drop facilities that are closer to a different metro
  const owned = inMetro.filter((f) => assignMetro(f.lat, f.lng, f.country)?.slug === metro.slug);

  const byOperator = new Map<string, number>();
  let totalMw = 0;
  let totalNets = 0;
  for (const f of owned) {
    if (f.operator) byOperator.set(f.operator, (byOperator.get(f.operator) ?? 0) + 1);
    if (f.power_mw) totalMw += f.power_mw;
    if (f.network_count) totalNets += f.network_count;
  }
  const operator_ranking = [...byOperator.entries()]
    .map(([operator, facility_count]) => ({ operator, facility_count }))
    .sort((a, b) => b.facility_count - a.facility_count);

  return {
    metro,
    facilities: owned
      .map((f) => ({
        slug: f.slug,
        name: f.name,
        operator: f.operator,
        city: f.city,
        power_mw: f.power_mw,
        network_count: f.network_count,
      }))
      .sort((a, b) => (b.network_count ?? 0) - (a.network_count ?? 0)),
    operator_ranking,
    total_power_mw: totalMw > 0 ? totalMw : null,
    total_networks: totalNets,
  };
}
