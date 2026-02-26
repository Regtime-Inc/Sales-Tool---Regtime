import type { DiscoveryFilters, DiscoveryResponse, SortSpec } from '../../types/discovery';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function fetchDiscovery(
  filters: DiscoveryFilters,
  page: number = 1,
  pageSize: number = 25,
  sorts: SortSpec[] = []
): Promise<DiscoveryResponse> {
  const params = new URLSearchParams();
  if (filters.borough) params.set('borough', filters.borough);
  if (filters.minUnderbuiltRatio != null) params.set('minUnderbuiltRatio', String(filters.minUnderbuiltRatio));
  if (filters.minSlackSF != null) params.set('minSlackSF', String(filters.minSlackSF));
  if (filters.excludeCondos != null) params.set('excludeCondos', String(filters.excludeCondos));
  if (filters.zonePrefix && filters.zonePrefix.length > 0) {
    params.set('zonePrefix', filters.zonePrefix.join(','));
  }
  if (filters.maxSaleRecencyYears != null && filters.maxSaleRecencyYears > 0) {
    params.set('maxSaleRecencyYears', String(filters.maxSaleRecencyYears));
  }
  if (filters.minProjectedUnits != null && filters.minProjectedUnits > 0) {
    params.set('minProjectedUnits', String(filters.minProjectedUnits));
  }
  if (filters.maxProjectedUnits != null && filters.maxProjectedUnits > 0) {
    params.set('maxProjectedUnits', String(filters.maxProjectedUnits));
  }
  if (filters.bldgClass && filters.bldgClass.length > 0) {
    params.set('bldgClass', filters.bldgClass.join(','));
  }
  if (filters.minSalePrice != null && filters.minSalePrice > 0) {
    params.set('minSalePrice', String(filters.minSalePrice));
  }
  if (filters.maxSalePrice != null && filters.maxSalePrice > 0) {
    params.set('maxSalePrice', String(filters.maxSalePrice));
  }
  if (filters.minPPBSF != null && filters.minPPBSF > 0) {
    params.set('minPPBSF', String(filters.minPPBSF));
  }
  if (filters.maxPPBSF != null && filters.maxPPBSF > 0) {
    params.set('maxPPBSF', String(filters.maxPPBSF));
  }
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  if (sorts.length > 0) {
    params.set('sortBy', sorts[0].column);
    params.set('sortDir', sorts[0].direction);
  }
  if (sorts.length > 1) {
    params.set('sortBy2', sorts[1].column);
    params.set('sortDir2', sorts[1].direction);
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/discovery?${params}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Discovery failed (${res.status})`);
  return data as DiscoveryResponse;
}
