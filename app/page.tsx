"use client";

import { useEffect, useMemo, useState } from "react";
import { Map } from "@/components/Map";
import { TopBar } from "@/components/TopBar";
import { FilterCard } from "@/components/FilterCard";
import { MapToggle } from "@/components/MapToggle";
import { Legend } from "@/components/Legend";
import { FacilityPanel } from "@/components/FacilityPanel";
import { NoTokenBanner } from "@/components/NoTokenBanner";
import { MobileHome } from "@/components/MobileHome";
import type { Facility, CloudRegion, FacilityStatus, CloudProvider } from "@/lib/types";
import { DEFAULT_STATE, parseUrl, serializeUrl } from "@/lib/url-state";
import { CENSUS_FMT } from "@/lib/census";
import { facilitiesInRegions } from "@/lib/cloud-region-areas";

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
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [fRes, rRes] = await Promise.all([
        fetch("/facilities.geojson"),
        fetch("/cloud-regions.geojson"),
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
  const [regionFocus, setRegionFocus] = useState<{ provider: CloudProvider; code: string } | null>(
    null,
  );

  const filteredCloudRegions = useMemo(() => {
    return cloudRegions.filter((r) => {
      if (regionFocus) return r.provider === regionFocus.provider && r.code === regionFocus.code;
      if (providerFocus && r.provider !== providerFocus) return false;
      if (filters.countries.length && !filters.countries.includes(r.country)) return false;
      return true;
    });
  }, [cloudRegions, filters.countries, providerFocus, regionFocus]);

  const filteredFacilities = useMemo(() => {
    const base = facilities.filter((f) => {
      if (filters.operators.length && !filters.operators.includes(f.operator)) return false;
      if (filters.countries.length && !filters.countries.includes(f.country)) return false;
      return true;
    });
    if (!providerFocus && !regionFocus) return base;
    return facilitiesInRegions(base, filteredCloudRegions);
  }, [facilities, filters, providerFocus, regionFocus, filteredCloudRegions]);

  const providerFacilityTotal = useMemo(() => {
    if (!providerFocus) return facilities.length;
    const regions = cloudRegions.filter((r) => r.provider === providerFocus);
    const byOperator = filters.operators.length
      ? facilities.filter((f) => filters.operators.includes(f.operator))
      : facilities;
    return facilitiesInRegions(byOperator, regions).length;
  }, [providerFocus, cloudRegions, facilities, filters.operators]);

  const defaultUSView =
    !providerFocus &&
    filters.operators.length === 0 &&
    filters.countries.length === 1 &&
    filters.countries[0] === "US";

  const fitTrigger = regionFocus
    ? `region:${regionFocus.provider}:${regionFocus.code}`
    : providerFocus
      ? `focus:${providerFocus}:${filters.countries.join(",")}`
      : defaultUSView
        ? null
        : filters.countries.length
          ? filters.countries.join(",")
          : null;

  const fitBoundsTarget = regionFocus
    ? filteredCloudRegions
    : providerFocus
      ? filteredCloudRegions
      : undefined;

  const selectedFacility = useMemo(
    () => (selectedSlug ? facilities.find((f) => f.slug === selectedSlug) ?? null : null),
    [facilities, selectedSlug],
  );

  return (
    <div
      className="relative h-full overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <h1 className="sr-only">Data Centers Map — Every Data Centre in the World</h1>
      <p className="sr-only">
        An open, sourced map of {CENSUS_FMT.facilities} data centers (also spelled data
        centres) across {CENSUS_FMT.countries} countries. Search every facility by operator,
        country, metro, network, or Internet exchange. Verified specs sourced from PeeringDB,
        operator pages, OpenStreetMap, and
        public filings — including Equinix, Digital Realty, Keppel Data Centres, Iron Mountain,
        Google, Meta, and 1,000+ other operators worldwide.
      </p>
      <div className="block h-full md:hidden">
        <MobileHome facilities={facilities} />
      </div>
      <div className="hidden h-full md:block">
      <Map
        facilities={filteredFacilities}
        cloudRegions={filteredCloudRegions}
        projection={projection}
        style={theme}
        cloudRegionsVisible={providerFocus !== null || regionFocus !== null || cloudRegionsVisible}
        fitTrigger={fitTrigger}
        fitBoundsTarget={fitBoundsTarget}
        onFacilityClick={(slug) => setState((s) => ({ ...s, selectedSlug: slug }))}
        onCloudRegionClick={(region) => {
          setRegionFocus(region);
          if (region) setState((s) => ({ ...s, providerFocus: region.provider }));
        }}
      />
      <NoTokenBanner />
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
        onProviderFocusChange={(providerFocus) => {
          setRegionFocus(null);
          setState((s) => ({ ...s, providerFocus }));
        }}
        visibleCount={filteredFacilities.length}
        totalCount={providerFocus || regionFocus ? providerFacilityTotal : facilities.length}
        countLabel="facilities"
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
    // build-geojson omits city when null in the DB (14 facilities); default to
    // "" so it matches the `city: string` type and search filters that call
    // `.toLowerCase()` don't throw and crash the client page.
    city: p.city ?? "",
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
