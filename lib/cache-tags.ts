/** ISR tag for index/aggregate pages only. Per-slug pages must not use this. */
export const CATALOG_INDEX_TAG = "catalog-indexes";

/** Runtime data-cache tag for REST/MCP loaders. Not attached to HTML ISR. */
export const API_DATA_TAG = "api-data";

export const ISR_SECONDS = 2_592_000;

export const catalogIndexCache: { revalidate: number; tags: string[] } = {
  revalidate: ISR_SECONDS,
  tags: [CATALOG_INDEX_TAG],
};

export const pageCache: { revalidate: number } = { revalidate: ISR_SECONDS };
