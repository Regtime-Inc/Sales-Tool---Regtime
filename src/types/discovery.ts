export type SortableColumn =
  | 'score'
  | 'slack_sf'
  | 'underbuilt_ratio'
  | 'lot_area'
  | 'resid_far'
  | 'last_sale_date'
  | 'last_sale_price'
  | 'data_completeness'
  | 'ppbsf';

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  column: SortableColumn;
  direction: SortDirection;
}

export interface DiscoveryFilters {
  borough?: string;
  minUnderbuiltRatio?: number;
  minSlackSF?: number;
  maxSaleRecencyYears?: number;
  excludeCondos?: boolean;
  zonePrefix?: string[];
  minProjectedUnits?: number;
  maxProjectedUnits?: number;
  bldgClass?: string[];
  minSalePrice?: number;
  maxSalePrice?: number;
  minPPBSF?: number;
  maxPPBSF?: number;
}

export interface ProgramFlag {
  program: string;
  eligible: boolean;
  note?: string;
}

export interface DiscoveryCandidate {
  bbl: string;
  address: string;
  borough: string;
  zoneDist: string;
  lotArea: number;
  bldgArea: number;
  residFar: number;
  builtFar: number;
  maxBuildableSF: number;
  slackSF: number;
  underbuiltRatio: number;
  landUse: string;
  bldgClass: string;
  yearBuilt: number;
  unitsRes: number;
  ownerName: string;
  score: number;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  lastSaleSource: string | null;
  potentialUnits: number;
  programFlags: ProgramFlag[];
  dataCompleteness: number;
  ppbsf: number | null;
}

export interface DiscoveryResponse {
  candidates: DiscoveryCandidate[];
  total: number;
  page: number;
  pageSize: number;
  cached: boolean;
  cachedAt: string | null;
  latestSaleDate: string | null;
}

export interface SaleRecencyOption {
  value: number;
  label: string;
  disabled?: boolean;
  note?: string;
}
