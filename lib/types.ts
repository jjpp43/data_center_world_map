export type FacilityStatus = "operational" | "under_construction" | "planned";

export type Facility = {
  slug: string;
  name: string;
  operator: string;
  code: string | null;
  city: string;
  country: string;
  lat: number;
  lng: number;
  status: FacilityStatus;
  power_mw: number | null;
  space_sqft: number | null;
  min_cabinet_density_kw: number | null;
  max_cabinet_density_kw: number | null;
  tier: string | null;
  ups_redundancy: string | null;
  uptime_sla: string | null;
  pue: number | null;
  year_built: number | null;
  network_count: number;
  ix_count: number;
};

export type Filters = {
  operators: string[];
  countries: string[];
};

export type CloudProvider = "aws" | "gcp" | "azure" | "oracle";

export type CloudRegion = {
  provider: CloudProvider;
  code: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  az_count: number | null;
  launched_year: number | null;
};
