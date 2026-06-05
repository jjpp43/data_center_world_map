"use client";

import { useEffect, useMemo, useState } from "react";
import { Map } from "@/components/Map";
import { TopBar } from "@/components/TopBar";
import { FilterCard } from "@/components/FilterCard";
import { MapToggle } from "@/components/MapToggle";
import { Legend } from "@/components/Legend";
import { FacilityPanel } from "@/components/FacilityPanel";
import { NoTokenBanner } from "@/components/NoTokenBanner";
import { FirstRunHint } from "@/components/FirstRunHint";
import { MobileHome } from "@/components/MobileHome";
import type { Facility, CloudRegion, FacilityStatus, CloudProvider } from "@/lib/types";
import { DEFAULT_STATE, parseUrl, serializeUrl } from "@/lib/url-state";

export default function HomePage() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [cloudRegions, setCloudRegions] = useState<CloudRegion[]>([]);

  useEffect(() => {
    setState(parseUrl(new URLSearchParams(window.location.search)));
  }, []);

  useEffect(() => {
    const qs = serializeUrl(state);
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
    document.cookie = `dcw-theme=${state.theme}; path=/; max-age=31536000; SameSite=Lax`;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [fRes, rRes] = await Promise.all([
        fetch("/api/facilities.geojson"),
        fetch("/api/cloud-regions.geojson"),
      ]);
      const fJson = (await fRes.json()) as GeoJSON.FeatureCollection;
      const rJson = (await rRes.json()) as GeoJSON.FeatureCollection;
      if (cancelled) return;
      setFacilities(fJson.features.map(featureToFacility));
      setCloudRegions(rJson.features.map(featureToCloudRegion));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { filters, selectedSlug, theme, projection, cloudRegionsVisible, providerFocus } = state;

  const filteredFacilities = useMemo(() => {
    if (providerFocus) return [];
    return facilities.filter((f) => {
      if (filters.operators.length && !filters.operators.includes(f.operator)) return false;
      if (filters.countries.length && !filters.countries.includes(f.country)) return false;
      return true;
    });
  }, [facilities, filters, providerFocus]);

  const filteredCloudRegions = useMemo(() => {
    return cloudRegions.filter((r) => {
      if (providerFocus && r.provider !== providerFocus) return false;
      if (filters.countries.length && !filters.countries.includes(r.country)) return false;
      return true;
    });
  }, [cloudRegions, filters.countries, providerFocus]);

  const fitTrigger = providerFocus
    ? `focus:${providerFocus}:${filters.countries.join(",")}`
    : filters.countries.length
      ? filters.countries.join(",")
      : null;

  const fitBoundsTarget = providerFocus ? filteredCloudRegions : undefined;

  const selectedFacility = useMemo(
    () => (selectedSlug ? facilities.find((f) => f.slug === selectedSlug) ?? null : null),
    [facilities, selectedSlug],
  );

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} relative h-full overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
    >
      <div className="block h-full md:hidden">
        <MobileHome facilities={facilities} />
      </div>
      <div className="hidden h-full md:block">
      <Map
        facilities={filteredFacilities}
        cloudRegions={filteredCloudRegions}
        projection={projection}
        style={theme}
        cloudRegionsVisible={providerFocus !== null || cloudRegionsVisible}
        fitTrigger={fitTrigger}
        fitBoundsTarget={fitBoundsTarget}
        onFacilityClick={(slug) => setState((s) => ({ ...s, selectedSlug: slug }))}
      />
      <NoTokenBanner />
      <FirstRunHint facilityCount={facilities.length} dismissOnSlug={selectedSlug} />
      <TopBar
        facilities={facilities}
        onSelect={(slug) => setState((s) => ({ ...s, selectedSlug: slug }))}
        theme={theme}
        onToggleTheme={() =>
          setState((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }))
        }
      />
      <FilterCard
        facilities={facilities}
        filters={filters}
        onChange={(filters) => setState((s) => ({ ...s, filters }))}
        providerFocus={providerFocus}
        onProviderFocusChange={(providerFocus) => setState((s) => ({ ...s, providerFocus }))}
        visibleCount={providerFocus ? filteredCloudRegions.length : filteredFacilities.length}
        totalCount={providerFocus ? cloudRegions.filter((r) => r.provider === providerFocus).length : facilities.length}
        countLabel={providerFocus ? `${providerFocus.toUpperCase()} regions` : "facilities"}
      />
      <MapToggle
        projection={projection}
        onChange={(projection) => setState((s) => ({ ...s, projection }))}
      />
      <Legend
        cloudRegionsVisible={cloudRegionsVisible}
        onCloudRegionsToggle={(cloudRegionsVisible) =>
          setState((s) => ({ ...s, cloudRegionsVisible }))
        }
      />
      <FacilityPanel
        facility={selectedFacility}
        onClose={() => setState((s) => ({ ...s, selectedSlug: null }))}
      />
      </div>
    </div>
  );
}

function featureToFacility(f: GeoJSON.Feature): Facility {
  const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
  const p = f.properties ?? {};
  return {
    slug: p.slug,
    name: p.name,
    operator: p.operator,
    city: p.city,
    country: p.country,
    lat,
    lng,
    status: p.status as FacilityStatus,
    power_mw: p.power_mw ?? null,
    space_sqft: p.space_sqft ?? null,
    min_cabinet_density_kw: p.min_cabinet_density_kw ?? null,
    max_cabinet_density_kw: p.max_cabinet_density_kw ?? null,
    tier: p.tier ?? null,
    ups_redundancy: p.ups_redundancy ?? null,
    uptime_sla: p.uptime_sla ?? null,
    pue: p.pue ?? null,
    code: p.code ?? null,
    year_built: p.year_built ?? null,
    network_count: p.network_count ?? 0,
    ix_count: p.ix_count ?? 0,
  };
}

function featureToCloudRegion(f: GeoJSON.Feature): CloudRegion {
  const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
  const p = f.properties ?? {};
  return {
    provider: p.provider as CloudProvider,
    code: p.code,
    name: p.name,
    city: p.city,
    country: p.country,
    lat,
    lng,
    az_count: p.az_count ?? null,
    launched_year: p.launched_year ?? null,
  };
}
