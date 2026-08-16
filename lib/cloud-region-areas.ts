import type { CloudRegion, Facility } from "./types";

const ASSOCIATE_KM = 40;
const CAMPUS_KM = 7;
const EARTH_KM = 6371;

const CLUSTER_PAD_KM: Record<string, number> = {
  oracle: 11,
  azure: 9,
  gcp: 7,
  aws: 5,
};

const DRAW_ORDER = ["oracle", "azure", "gcp", "aws"];

export function toCloudRegionAreaGeoJSON(
  regions: CloudRegion[],
  facilities: Facility[],
): GeoJSON.FeatureCollection {
  const sorted = [...regions].sort(
    (a, b) => DRAW_ORDER.indexOf(a.provider) - DRAW_ORDER.indexOf(b.provider),
  );

  return {
    type: "FeatureCollection",
    features: sorted.map((r) => {
      const pad = CLUSTER_PAD_KM[r.provider] ?? 7;
      const nearby = nearbyFacilities(r, facilities, ASSOCIATE_KM);
      const ring = areaRing(r, nearby, pad);
      return {
        type: "Feature",
        id: `${r.provider}-${r.code}`,
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          provider: r.provider,
          code: r.code,
          name: r.name,
          city: r.city,
          country: r.country,
          az_count: r.az_count,
          launched_year: r.launched_year,
        },
      };
    }),
  };
}

export function facilitiesInRegions(
  facilities: Facility[],
  regions: CloudRegion[],
): Facility[] {
  if (regions.length === 0) return [];
  return facilities.filter((f) =>
    regions.some((r) => haversineKm(r.lat, r.lng, f.lat, f.lng) <= ASSOCIATE_KM),
  );
}

function nearbyFacilities(region: CloudRegion, candidates: Facility[], km: number): Facility[] {
  return candidates.filter((f) => haversineKm(region.lat, region.lng, f.lat, f.lng) <= km);
}

function areaRing(region: CloudRegion, nearby: Facility[], padKm: number): [number, number][] {
  if (nearby.length === 0) {
    return circleRing(region.lng, region.lat, CAMPUS_KM);
  }

  const pts = uniquePoints(nearby.map((f): [number, number] => [f.lng, f.lat]));

  if (pts.length === 1) {
    return circleRing(pts[0][0], pts[0][1], CAMPUS_KM);
  }

  if (pts.length === 2) {
    const [a, b] = pts;
    const midLng = (a[0] + b[0]) / 2;
    const midLat = (a[1] + b[1]) / 2;
    const radius = haversineKm(a[1], a[0], b[1], b[0]) / 2 + CAMPUS_KM;
    return circleRing(midLng, midLat, radius);
  }

  const hull = convexHull(pts);
  if (hull.length < 3) {
    return circleRing(region.lng, region.lat, CAMPUS_KM);
  }

  const expanded = expandFromCentroid(hull, padKm);
  return chaikin(closeRing(expanded), 2);
}

function uniquePoints(points: [number, number][]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const p of points) {
    const key = `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function expandFromCentroid(ring: [number, number][], km: number): [number, number][] {
  let cx = 0;
  let cy = 0;
  for (const [lng, lat] of ring) {
    cx += lng;
    cy += lat;
  }
  cx /= ring.length;
  cy /= ring.length;
  return ring.map(([lng, lat]) => {
    const d = haversineKm(cy, cx, lat, lng);
    const bearing = bearingRad(cy, cx, lat, lng);
    return dest(cy, cx, bearing, d + km);
  });
}

function circleRing(lng: number, lat: number, km: number, steps = 48): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    ring.push(dest(lat, lng, (i / steps) * Math.PI * 2, km));
  }
  ring.push(ring[0]);
  return ring;
}

function closeRing(ring: [number, number][]): [number, number][] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function chaikin(ring: [number, number][], iterations: number): [number, number][] {
  let current = ring;
  for (let n = 0; n < iterations; n++) {
    const next: [number, number][] = [];
    const open = current.length > 1 ? current.slice(0, -1) : current;
    for (let i = 0; i < open.length; i++) {
      const a = open[i];
      const b = open[(i + 1) % open.length];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    current = closeRing(next);
  }
  return current;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

function bearingRad(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x);
}

function dest(lat: number, lng: number, bearing: number, km: number): [number, number] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const δ = km / EARTH_KM;
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearing),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return [toDeg(λ2), toDeg(φ2)];
}
