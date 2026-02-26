export interface MihEligibilityResult {
  status: 'eligible' | 'not_eligible' | 'unavailable' | 'needs_verification';
  eligible: boolean;
  mihFeatureId?: string;
  mihProperties?: Record<string, unknown>;
  derived: {
    option?: string;
    areaName?: string;
  };
  source: {
    name: string;
    datasetId: string;
    fetchedAtISO: string;
  };
  errors?: string[];
  bufferMatch?: boolean;
  notes?: string[];
}

export interface MihCacheEntry {
  fetchedAtISO: string;
  geojson: GeoJSON.FeatureCollection;
}
