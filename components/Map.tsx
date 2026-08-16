"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { Facility, CloudRegion, CloudProvider } from "@/lib/types";
import { toCloudRegionAreaGeoJSON } from "@/lib/cloud-region-areas";

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
  onCloudRegionClick: (region: { provider: CloudRegion["provider"]; code: string } | null) => void;
};

const STYLE_URL: Record<MapStyle, string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
};

const LIGHT_BASE_TINT = "#e7eaf0";
const SPIN_KEY = "dcw-globe-intro";
const SEC_PER_REV = 140;
const REVEAL_MS = 700;

const FOG_DARK: mapboxgl.FogSpecification = {
  range: [0.8, 8],
  color: "#0b1220",
  "high-color": "#1e3a5f",
  "space-color": "#020617",
  "horizon-blend": 0.035,
  "star-intensity": 0.55,
};

const FOG_LIGHT: mapboxgl.FogSpecification = {
  range: [0.8, 8],
  color: "#d5dee8",
  "high-color": "#c5d0dc",
  "space-color": LIGHT_BASE_TINT,
  "horizon-blend": 0.1,
  "star-intensity": 0,
};

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

function applyFog(map: mapboxgl.Map, style: MapStyle, projection: MapProjection) {
  if (!map.isStyleLoaded()) return;
  if (projection !== "globe") {
    map.setFog(null);
    return;
  }
  map.setFog(style === "light" ? FOG_LIGHT : FOG_DARK);
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  onCloudRegionClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const revealedRef = useRef(false);
  const stopSpinRef = useRef<(() => void) | null>(null);

  const dataRef = useRef({ facilities, cloudRegions, cloudRegionsVisible, style, projection });
  dataRef.current = { facilities, cloudRegions, cloudRegionsVisible, style, projection };

  const clickRef = useRef({ facility: onFacilityClick, region: onCloudRegionClick });
  clickRef.current = { facility: onFacilityClick, region: onCloudRegionClick };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxgl.accessToken) {
      console.warn("[Map] No NEXT_PUBLIC_MAPBOX_TOKEN — skipping map init");
      return;
    }

    const initial = dataRef.current;
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
      attachLayers(
        map,
        d.facilities,
        d.cloudRegions,
        d.cloudRegionsVisible,
        revealedRef.current && d.facilities.length > 0,
      );
      applyFog(map, d.style, d.projection);
      if (d.style === "light") tintLightBase(map);
      const geo = toFacilityGeoJSON(d.facilities);
      const facilitiesSrc = map.getSource("facilities") as mapboxgl.GeoJSONSource | undefined;
      const clusterSrc = map.getSource("facilities-clusters") as mapboxgl.GeoJSONSource | undefined;
      const cloudSrc = map.getSource("cloud-regions") as mapboxgl.GeoJSONSource | undefined;
      if (facilitiesSrc) facilitiesSrc.setData(geo);
      if (clusterSrc) clusterSrc.setData(geo);
      if (cloudSrc) cloudSrc.setData(toCloudRegionAreaGeoJSON(d.cloudRegions, d.facilities));
    }

    map.on("style.load", setupLayers);
    if (map.isStyleLoaded()) setupLayers();

    map.on("click", "facility-point", (e) => {
      const f = e.features?.[0];
      const slug = f?.properties?.slug;
      if (typeof slug === "string") clickRef.current.facility(slug);
    });

    map.on("click", "facility-clusters", (e) => {
      const cluster = e.features?.[0];
      if (!cluster) return;
      const clusterId = cluster.properties?.cluster_id as number;
      const src = map.getSource("facilities-clusters") as mapboxgl.GeoJSONSource;
      src.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        const coords = (cluster.geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom });
      });
    });

    function openCloudPopup(e: mapboxgl.MapLayerMouseEvent) {
      const f = e.features?.[0];
      if (!f) return;
      const hitFacility = map.queryRenderedFeatures(e.point, {
        layers: ["facility-point", "facility-clusters"].filter((id) => map.getLayer(id)),
      });
      if (hitFacility.length) return;
      const provider = String(f.properties?.provider ?? "");
      const code = String(f.properties?.code ?? "");
      if (isCloudProvider(provider) && code) {
        clickRef.current.region({ provider, code });
      }
      new mapboxgl.Popup({ offset: 8, closeButton: true, className: "cloud-popup" })
        .setLngLat(e.lngLat)
        .setHTML(renderCloudPopup(f.properties ?? {}))
        .addTo(map);
    }
    map.on("click", "cloud-region-fill", openCloudPopup);
    map.on("click", "cloud-region-line", openCloudPopup);

    map.on("click", (e) => {
      const layers = ["cloud-region-fill", "cloud-region-line", "facility-point", "facility-clusters"].filter(
        (id) => map.getLayer(id),
      );
      if (layers.length === 0) return;
      const hits = map.queryRenderedFeatures(e.point, { layers });
      if (hits.length === 0) clickRef.current.region(null);
    });

    for (const layer of ["facility-point", "facility-clusters", "cloud-region-fill", "cloud-region-line"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    let spinRaf = 0;
    let spinning = false;
    let spinTimer = 0;
    const stopSpin = (persist: boolean) => {
      spinning = false;
      window.clearTimeout(spinTimer);
      if (spinRaf) cancelAnimationFrame(spinRaf);
      spinRaf = 0;
      if (persist) {
        try {
          localStorage.setItem(SPIN_KEY, "1");
        } catch {
          /* private mode */
        }
      }
    };
    stopSpinRef.current = () => stopSpin(true);

    const onInteract = () => stopSpin(true);
    map.on("mousedown", onInteract);
    map.on("touchstart", onInteract);
    map.on("wheel", onInteract);

    try {
      const seen = localStorage.getItem(SPIN_KEY);
      if (!seen && projection === "globe" && !reducedMotion()) {
        spinTimer = window.setTimeout(() => {
          if (!mapRef.current || spinning) return;
          spinning = true;
          const origin = map.getBearing();
          const t0 = performance.now();
          const frame = (now: number) => {
            if (!spinning) return;
            const elapsed = (now - t0) / 1000;
            map.rotateTo(origin + (elapsed / SEC_PER_REV) * 360, { duration: 0 });
            spinRaf = requestAnimationFrame(frame);
          };
          spinRaf = requestAnimationFrame(frame);
        }, 900);
      }
    } catch {
      /* private mode */
    }

    mapRef.current = map;
    return () => {
      stopSpin(false);
      map.off("mousedown", onInteract);
      map.off("touchstart", onInteract);
      map.off("wheel", onInteract);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const lastProjectionRef = useRef<MapProjection | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastProjectionRef.current === null) {
      lastProjectionRef.current = projection;
      return;
    }
    if (lastProjectionRef.current === projection) return;
    lastProjectionRef.current = projection;
    map.setProjection(projection);
    applyFog(map, dataRef.current.style, projection);
    if (projection !== "globe") stopSpinRef.current?.();
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
    const geo = toFacilityGeoJSON(facilities);
    const src = map?.getSource("facilities") as mapboxgl.GeoJSONSource | undefined;
    const clusterSrc = map?.getSource("facilities-clusters") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(geo);
    if (clusterSrc) clusterSrc.setData(geo);
    if (map && facilities.length > 0 && !revealedRef.current) {
      revealedRef.current = true;
      if (reducedMotion()) {
        setFacilityVisibility(map, true);
      } else {
        requestAnimationFrame(() => setFacilityVisibility(map, true));
      }
    }
  }, [facilities]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("cloud-regions") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(toCloudRegionAreaGeoJSON(cloudRegions, facilities));
  }, [cloudRegions, facilities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = cloudRegionsVisible ? "visible" : "none";
    for (const layer of ["cloud-region-fill", "cloud-region-line"]) {
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

const HEAT_OPACITY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0, 0.78,
  3.2, 0.62,
  5.2, 0,
] as const;

const POINT_OPACITY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3.8, 0,
  5.4, 1,
] as const;

const CLUSTER_OPACITY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0, 1,
  4.4, 1,
  5.2, 0,
] as const;

const CLUSTER_GLOW_OPACITY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0, 0.42,
  4.4, 0.38,
  5.2, 0,
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

const GLOW_OPACITY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3.8, 0,
  5.4, [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "network_count"], 0],
    0, 0.35,
    50, 0.5,
    200, 0.65,
    500, 0.8,
    1000, 0.92,
  ],
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

const OPACITY_TRANSITION = { duration: REVEAL_MS, delay: 60 };

function setFacilityVisibility(map: mapboxgl.Map, visible: boolean) {
  if (map.getLayer("facilities-heat")) {
    map.setPaintProperty(
      "facilities-heat",
      "heatmap-opacity",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visible ? HEAT_OPACITY : 0) as any,
    );
  }
  if (map.getLayer("facility-clusters-glow")) {
    map.setPaintProperty(
      "facility-clusters-glow",
      "circle-opacity",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visible ? CLUSTER_GLOW_OPACITY : 0) as any,
    );
  }
  if (map.getLayer("facility-clusters")) {
    map.setPaintProperty(
      "facility-clusters",
      "circle-opacity",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visible ? CLUSTER_OPACITY : 0) as any,
    );
    map.setPaintProperty(
      "facility-clusters",
      "circle-stroke-opacity",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visible ? CLUSTER_OPACITY : 0) as any,
    );
  }
  if (map.getLayer("facility-cluster-count")) {
    map.setPaintProperty(
      "facility-cluster-count",
      "text-opacity",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visible ? CLUSTER_OPACITY : 0) as any,
    );
  }
  if (map.getLayer("facility-point-glow")) {
    map.setPaintProperty(
      "facility-point-glow",
      "circle-opacity",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visible ? GLOW_OPACITY : 0) as any,
    );
  }
  if (map.getLayer("facility-point")) {
    map.setPaintProperty(
      "facility-point",
      "circle-opacity",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visible ? POINT_OPACITY : 0) as any,
    );
  }
}

function attachLayers(
  map: mapboxgl.Map,
  facilities: Facility[],
  cloudRegions: CloudRegion[],
  cloudRegionsVisible: boolean,
  revealed: boolean,
) {
  if (!map.getSource("facilities")) {
    map.addSource("facilities", {
      type: "geojson",
      data: toFacilityGeoJSON(facilities),
    });
  }

  if (!map.getLayer("facilities-heat")) {
    map.addLayer({
      id: "facilities-heat",
      type: "heatmap",
      source: "facilities",
      maxzoom: 6.5,
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "network_count"], 0],
          0, 0.18,
          50, 0.4,
          200, 0.7,
          500, 1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.55,
          2, 0.8,
          4, 1.15,
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 14,
          2, 20,
          4, 32,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(74,222,128,0)",
          0.12, "rgba(34,211,238,0.18)",
          0.35, "rgba(52,211,153,0.5)",
          0.65, "rgba(74,222,128,0.82)",
          1, "rgba(187,247,208,0.95)",
        ],
        "heatmap-opacity": (revealed ? HEAT_OPACITY : 0) as never,
        "heatmap-opacity-transition": OPACITY_TRANSITION,
      },
    });
  }

  addCloudRegionLayers(map, facilities, cloudRegions, cloudRegionsVisible);

  if (!map.getSource("facilities-clusters")) {
    map.addSource("facilities-clusters", {
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
      source: "facilities-clusters",
      maxzoom: 5.4,
      filter: ["has", "point_count"],
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": CLUSTER_COLOR as any,
        "circle-radius": [
          "+",
          ["step", ["get", "point_count"], 26, 25, 34, 100, 44],
          [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "sum_networks"], 0],
            0, 0,
            500, 3,
            2000, 8,
            5000, 14,
          ],
        ],
        "circle-blur": 1,
        "circle-opacity": (revealed ? CLUSTER_GLOW_OPACITY : 0) as never,
        "circle-opacity-transition": OPACITY_TRANSITION,
      },
    });
  }

  if (!map.getLayer("facility-clusters")) {
    map.addLayer({
      id: "facility-clusters",
      type: "circle",
      source: "facilities-clusters",
      maxzoom: 5.4,
      filter: ["has", "point_count"],
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-color": CLUSTER_COLOR as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "circle-radius": CLUSTER_RADIUS as any,
        "circle-opacity": (revealed ? CLUSTER_OPACITY : 0) as never,
        "circle-opacity-transition": OPACITY_TRANSITION,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#a5f3fc",
        "circle-stroke-opacity": (revealed ? CLUSTER_OPACITY : 0) as never,
        "circle-stroke-opacity-transition": OPACITY_TRANSITION,
      },
    });
  }

  if (!map.getLayer("facility-cluster-count")) {
    map.addLayer({
      id: "facility-cluster-count",
      type: "symbol",
      source: "facilities-clusters",
      maxzoom: 5.4,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#06222b",
        "text-halo-color": "#a5f3fc",
        "text-halo-width": 0.5,
        "text-opacity": (revealed ? CLUSTER_OPACITY : 0) as never,
        "text-opacity-transition": OPACITY_TRANSITION,
      },
    });
  }

  if (!map.getLayer("facility-point-glow")) {
    map.addLayer({
      id: "facility-point-glow",
      type: "circle",
      source: "facilities",
      minzoom: 3.8,
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
          4, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 8,
            50, 11,
            150, 15,
            400, 22,
            800, 28,
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
        "circle-opacity": (revealed ? GLOW_OPACITY : 0) as never,
        "circle-opacity-transition": OPACITY_TRANSITION,
      },
    });
  }

  if (!map.getLayer("facility-point")) {
    map.addLayer({
      id: "facility-point",
      type: "circle",
      source: "facilities",
      minzoom: 3.8,
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
          4, [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "network_count"], 0],
            0, 3.5,
            50, 5,
            200, 7,
            500, 9.5,
            1000, 12,
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
        "circle-opacity": (revealed ? POINT_OPACITY : 0) as never,
        "circle-opacity-transition": OPACITY_TRANSITION,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.6,
      },
    });
  }
}

function addCloudRegionLayers(
  map: mapboxgl.Map,
  facilities: Facility[],
  cloudRegions: CloudRegion[],
  cloudRegionsVisible: boolean,
) {
  for (const id of ["cloud-region-point", "cloud-region-glow"]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }

  const areas = toCloudRegionAreaGeoJSON(cloudRegions, facilities);
  if (!map.getSource("cloud-regions")) {
    map.addSource("cloud-regions", { type: "geojson", data: areas });
  }

  const visibility = cloudRegionsVisible ? "visible" : "none";

  if (!map.getLayer("cloud-region-fill")) {
    map.addLayer({
      id: "cloud-region-fill",
      type: "fill",
      source: "cloud-regions",
      layout: { visibility },
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "fill-color": CLOUD_COLOR as any,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2, 0.22,
          4, 0.16,
          8, 0.12,
        ],
        "fill-antialias": true,
      },
    });
  }

  if (!map.getLayer("cloud-region-line")) {
    map.addLayer({
      id: "cloud-region-line",
      type: "line",
      source: "cloud-regions",
      layout: {
        visibility,
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "line-color": CLOUD_COLOR as any,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2, 1,
          5, 1.5,
          9, 2.25,
        ],
        "line-opacity": 0.88,
      },
    });
  }

  const before = map.getLayer("facility-clusters-glow")
    ? "facility-clusters-glow"
    : map.getLayer("facility-point-glow")
      ? "facility-point-glow"
      : undefined;
  if (before) {
    if (map.getLayer("cloud-region-fill")) map.moveLayer("cloud-region-fill", before);
    if (map.getLayer("cloud-region-line")) map.moveLayer("cloud-region-line", before);
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
  gcp: "Google",
  azure: "Microsoft Azure",
  oracle: "Oracle Cloud",
};

function isCloudProvider(s: string): s is CloudProvider {
  return s === "aws" || s === "gcp" || s === "azure" || s === "oracle";
}

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
