"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { Facility, CloudRegion } from "@/lib/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type MapStyle = "dark" | "light";
type MapProjection = "mercator" | "globe";

type Props = {
  facilities: Facility[];
  cloudRegions: CloudRegion[];
  projection: MapProjection;
  style: MapStyle;
  cloudRegionsVisible: boolean;
  fitTrigger: string | null;
  fitBoundsTarget?: Array<{ lat: number; lng: number }>;
  onFacilityClick: (slug: string) => void;
};

const STYLE_URL: Record<MapStyle, string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
};

// Soft cool-gray for the light style base — pure white blends into the
// editorial UI and washes out the overlay buttons. Applied at style.load
// by overriding the `background` layer plus any land/landcover fill.
const LIGHT_BASE_TINT = "#e7eaf0";

function tintLightBase(map: mapboxgl.Map) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "background") {
      try {
        map.setPaintProperty(layer.id, "background-color", LIGHT_BASE_TINT);
      } catch {
        /* layer missing — skip */
      }
    } else if (layer.type === "fill" && /^(land|landcover|landuse)/.test(layer.id)) {
      try {
        map.setPaintProperty(layer.id, "fill-color", LIGHT_BASE_TINT);
      } catch {
        /* layer missing — skip */
      }
    }
  }
}

export function Map({
  facilities,
  cloudRegions,
  projection,
  style,
  cloudRegionsVisible,
  fitTrigger,
  fitBoundsTarget,
  onFacilityClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const dataRef = useRef({ facilities, cloudRegions, cloudRegionsVisible, style });
  dataRef.current = { facilities, cloudRegions, cloudRegionsVisible, style };

  const clickRef = useRef(onFacilityClick);
  clickRef.current = onFacilityClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxgl.accessToken) {
      console.warn("[Map] No NEXT_PUBLIC_MAPBOX_TOKEN — skipping map init");
      return;
    }

    const initial = dataRef.current;
    console.log("[Map] init with", initial.facilities.length, "facilities,", initial.cloudRegions.length, "cloud regions");

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URL[initial.style],
      projection,
      center: [-98, 39],
      zoom: 1.8,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false, showCompass: false }), "bottom-right");

    function setupLayers() {
      const d = dataRef.current;
      console.log("[Map] style.load — attaching layers with", d.facilities.length, "facilities");
      attachLayers(map, d.facilities, d.cloudRegions, d.cloudRegionsVisible);
      if (d.style === "light") tintLightBase(map);
      const facilitiesSrc = map.getSource("facilities") as mapboxgl.GeoJSONSource | undefined;
      const cloudSrc = map.getSource("cloud-regions") as mapboxgl.GeoJSONSource | undefined;
      if (facilitiesSrc) facilitiesSrc.setData(toFacilityGeoJSON(d.facilities));
      if (cloudSrc) cloudSrc.setData(toCloudRegionGeoJSON(d.cloudRegions));
    }

    map.on("style.load", setupLayers);
    if (map.isStyleLoaded()) setupLayers();

    map.on("click", "facility-point", (e) => {
      const f = e.features?.[0];
      const slug = f?.properties?.slug;
      if (typeof slug === "string") clickRef.current(slug);
    });

    map.on("click", "facility-clusters", (e) => {
      const cluster = e.features?.[0];
      if (!cluster) return;
      const clusterId = cluster.properties?.cluster_id as number;
      const src = map.getSource("facilities") as mapboxgl.GeoJSONSource;
      src.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        const coords = (cluster.geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom });
      });
    });

    map.on("click", "cloud-region-point", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties ?? {};
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      new mapboxgl.Popup({ offset: 14, closeButton: true, className: "cloud-popup" })
        .setLngLat(coords)
        .setHTML(renderCloudPopup(p))
        .addTo(map);
    });

    for (const layer of ["facility-point", "facility-clusters", "cloud-region-point"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setProjection(projection);
  }, [projection]);

  const lastStyleRef = useRef<MapStyle | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastStyleRef.current === null) {
      lastStyleRef.current = style;
      return;
    }
    if (lastStyleRef.current === style) return;
    lastStyleRef.current = style;
    map.setStyle(STYLE_URL[style]);
  }, [style]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("facilities") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(toFacilityGeoJSON(facilities));
  }, [facilities]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("cloud-regions") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(toCloudRegionGeoJSON(cloudRegions));
  }, [cloudRegions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = cloudRegionsVisible ? "visible" : "none";
    for (const layer of ["cloud-region-point", "cloud-region-glow"]) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visibility);
    }
  }, [cloudRegionsVisible]);

  const lastFitRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!fitTrigger) {
      lastFitRef.current = null;
      return;
    }
    if (lastFitRef.current === fitTrigger) return;
    const points = fitBoundsTarget && fitBoundsTarget.length > 0 ? fitBoundsTarget : facilities;
    if (points.length === 0) return;
    lastFitRef.current = fitTrigger;

    const bounds = new mapboxgl.LngLatBounds();
    for (const p of points) bounds.extend([p.lng, p.lat]);
    map.fitBounds(bounds, { padding: 100, duration: 1000, maxZoom: 7 });
  }, [fitTrigger, facilities, fitBoundsTarget]);

  return <div ref={containerRef} className="h-full w-full" />;
}

const FACILITY_COLOR = [
  "match",
  ["get", "status"],
  "operational",
  "#4ade80",
  "under_construction",
  "#fbbf24",
  "planned",
  "#94a3b8",
  "#4ade80",
] as const;

const CLUSTER_COLOR = [
  "step",
  ["get", "point_count"],
  "#22d3ee",
  25,
  "#06b6d4",
  100,
  "#0891b2",
] as const;

const CLUSTER_RADIUS = [
  "step",
  ["get", "point_count"],
  16,
  25,
  22,
  100,
  30,
] as const;

const POINT_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  3,
  6,
  5,
  10,
  7,
] as const;

const CLOUD_COLOR = [
  "match",
  ["get", "provider"],
  "aws",
  "#ff9d2e",
  "gcp",
  "#a855f7",
  "azure",
  "#3aa0e6",
  "oracle",
  "#ff5757",
  "#c084fc",
] as const;

function attachLayers(
  map: mapboxgl.Map,
  facilities: Facility[],
  cloudRegions: CloudRegion[],
  cloudRegionsVisible: boolean,
) {
  if (!map.getSource("facilities")) {
    map.addSource("facilities", {
      type: "geojson",
      data: toFacilityGeoJSON(facilities),
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 12,
      clusterProperties: {
        sum_networks: ["+", ["coalesce", ["get", "network_count"], 0]],
      },
    });
  }

  if (!map.getLayer("facility-clusters-glow")) {
    map.addLayer({
      id: "facility-clusters-glow",
      type: "circle",
      source: "facilities",
      filter: ["has", "point_count"],
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": CLUSTER_COLOR as any,
        "circle-radius": [
          "+",
          [
            "step",
            ["get", "point_count"],
            28,
            25,
            38,
            100,
            50,
          ],
          [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "sum_networks"], 0],
            0, 0,
            500, 4,
            2000, 10,
            5000, 18,
          ],
        ],
        "circle-blur": 1,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "sum_networks"], 0],
          0, 0.4,
          500, 0.55,
          2000, 0.75,
          5000, 0.9,
        ],
      },
    });
  }

  if (!map.getLayer("facility-clusters")) {
    map.addLayer({
      id: "facility-clusters",
      type: "circle",
      source: "facilities",
      filter: ["has", "point_count"],
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": CLUSTER_COLOR as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-radius": CLUSTER_RADIUS as any,
        "circle-opacity": 0.95,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#a5f3fc",
        "circle-stroke-opacity": 0.8,
      },
    });
  }

  if (!map.getLayer("facility-cluster-count")) {
    map.addLayer({
      id: "facility-cluster-count",
      type: "symbol",
      source: "facilities",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#06222b",
        "text-halo-color": "#a5f3fc",
        "text-halo-width": 0.5,
      },
    });
  }

  if (!map.getLayer("facility-point-glow")) {
    map.addLayer({
      id: "facility-point-glow",
      type: "circle",
      source: "facilities",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "circle-sort-key": ["coalesce", ["get", "network_count"], 0],
      },
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": FACILITY_COLOR as any,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 7,
            50, 10,
            150, 14,
            400, 20,
            800, 27,
          ],
          6, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 12,
            50, 15,
            150, 19,
            400, 25,
            800, 32,
          ],
          10, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 16,
            50, 19,
            150, 23,
            400, 29,
            800, 36,
          ],
        ],
        "circle-blur": 1,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "network_count"], 0],
          0, 0.35,
          50, 0.5,
          200, 0.65,
          500, 0.8,
          1000, 0.92,
        ],
      },
    });
  }

  if (!map.getLayer("facility-point")) {
    map.addLayer({
      id: "facility-point",
      type: "circle",
      source: "facilities",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "circle-sort-key": ["coalesce", ["get", "network_count"], 0],
      },
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": FACILITY_COLOR as any,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 3,
            50, 4.5,
            200, 6.5,
            500, 9,
            1000, 11,
          ],
          6, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 5,
            50, 6.5,
            200, 8.5,
            500, 11,
            1000, 13,
          ],
          10, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 7,
            50, 8.5,
            200, 10.5,
            500, 13,
            1000, 15,
          ],
        ],
        "circle-opacity": 1,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.6,
      },
    });
  }

  if (!map.getSource("cloud-regions")) {
    map.addSource("cloud-regions", {
      type: "geojson",
      data: toCloudRegionGeoJSON(cloudRegions),
    });
  }

  if (!map.getLayer("cloud-region-glow")) {
    map.addLayer({
      id: "cloud-region-glow",
      type: "circle",
      source: "cloud-regions",
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": CLOUD_COLOR as any,
        "circle-radius": 14,
        "circle-blur": 1,
        "circle-opacity": 0.5,
      },
      layout: {
        visibility: cloudRegionsVisible ? "visible" : "none",
      },
    });
  }

  if (!map.getLayer("cloud-region-point")) {
    map.addLayer({
      id: "cloud-region-point",
      type: "circle",
      source: "cloud-regions",
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": CLOUD_COLOR as any,
        "circle-radius": 4.5,
        "circle-opacity": 1,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.7,
      },
      layout: {
        visibility: cloudRegionsVisible ? "visible" : "none",
      },
    });
  }
}

function toFacilityGeoJSON(facilities: Facility[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: facilities.map((f) => ({
      type: "Feature",
      id: f.slug,
      geometry: { type: "Point", coordinates: [f.lng, f.lat] },
      properties: {
        slug: f.slug,
        name: f.name,
        operator: f.operator,
        city: f.city,
        country: f.country,
        status: f.status,
        power_mw: f.power_mw,
        network_count: f.network_count,
      },
    })),
  };
}

const CLOUD_LABEL: Record<string, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Microsoft Azure",
  oracle: "Oracle Cloud",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function renderCloudPopup(p: GeoJSON.GeoJsonProperties): string {
  if (!p) return "";
  const provider = String(p.provider ?? "");
  const label = escapeHtml(CLOUD_LABEL[provider] ?? provider);
  const code = escapeHtml(String(p.code ?? ""));
  const name = escapeHtml(String(p.name ?? ""));
  const city = p.city ? escapeHtml(String(p.city)) : "";
  const country = p.country ? escapeHtml(String(p.country)) : "";
  const az = p.az_count != null ? `${p.az_count} AZ${p.az_count === 1 ? "" : "s"}` : null;
  const year = p.launched_year != null ? `Launched ${p.launched_year}` : null;
  const meta = [az, year].filter(Boolean).join(" · ");
  const where = [city, country].filter(Boolean).join(", ");
  return `
    <div class="text-xs">
      <div class="font-medium uppercase tracking-wider text-zinc-500">${label}</div>
      <div class="mt-0.5 font-semibold">${name}</div>
      <div class="mt-0.5 font-mono text-[10px] text-zinc-500">${code}</div>
      ${where ? `<div class="mt-1 text-zinc-500">${where}</div>` : ""}
      ${meta ? `<div class="mt-0.5 text-zinc-500">${meta}</div>` : ""}
    </div>
  `;
}

function toCloudRegionGeoJSON(regions: CloudRegion[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: regions.map((r) => ({
      type: "Feature",
      id: `${r.provider}-${r.code}`,
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        provider: r.provider,
        code: r.code,
        name: r.name,
        city: r.city,
        country: r.country,
        az_count: r.az_count,
        launched_year: r.launched_year,
      },
    })),
  };
}
