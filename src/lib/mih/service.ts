import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { MihEligibilityResult, MihCacheEntry } from './types';

const PRIMARY_URL =
  'https://data.cityofnewyork.us/api/geospatial/bw8v-wzdr?method=export&type=GeoJSON';
const FALLBACK_URL =
  'https://data.cityofnewyork.us/api/views/bw8v-wzdr/rows.geojson?accessType=DOWNLOAD';

const CACHE_KEY = 'mih_geojson_cache_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SOURCE_META = {
  name: 'NYC Open Data - Mandatory Inclusionary Housing (MIH)',
  datasetId: 'bw8v-wzdr',
};

const OPTION_KEYS = ['mih_option', 'option', 'options', 'program_option', 'm_option', 'mihopt'];
const NAME_KEYS = ['name', 'area_name', 'project', 'project_nam', 'rezoning', 'neighborhood', 'label'];

function findProperty(props: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const val = props[k] ?? props[k.toUpperCase()] ?? props[k.toLowerCase()];
    if (val != null && String(val).trim() !== '') return String(val).trim();
  }
  return undefined;
}

function readCache(): GeoJSON.FeatureCollection | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: MihCacheEntry = JSON.parse(raw);
    const age = Date.now() - new Date(parsed.fetchedAtISO).getTime();
    if (age >= CACHE_TTL_MS) return null;
    if (parsed.geojson?.type !== 'FeatureCollection') return null;
    console.log('[MIH] Loaded GeoJSON from cache');
    return parsed.geojson;
  } catch {
    return null;
  }
}

function writeCache(geojson: GeoJSON.FeatureCollection): void {
  try {
    const entry: MihCacheEntry = {
      fetchedAtISO: new Date().toISOString(),
      geojson,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    console.warn('[MIH] Failed to write cache (storage full?)');
  }
}

async function fetchGeojsonFromUrl(url: string): Promise<GeoJSON.FeatureCollection> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.type !== 'FeatureCollection') throw new Error('Not a FeatureCollection');
    return data as GeoJSON.FeatureCollection;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMihGeojson(
  forceRefresh = false
): Promise<GeoJSON.FeatureCollection | null> {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  console.log('[MIH] Fetching GeoJSON from primary URL');
  try {
    const geojson = await fetchGeojsonFromUrl(PRIMARY_URL);
    writeCache(geojson);
    return geojson;
  } catch (primaryErr) {
    console.warn('[MIH] Primary URL failed:', primaryErr);
  }

  console.log('[MIH] Trying fallback URL');
  try {
    const geojson = await fetchGeojsonFromUrl(FALLBACK_URL);
    writeCache(geojson);
    return geojson;
  } catch (fallbackErr) {
    console.warn('[MIH] Fallback URL failed:', fallbackErr);
  }

  return null;
}

export function clearMihCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

function testPointInFeature(
  pt: GeoJSON.Feature<GeoJSON.Point>,
  feature: GeoJSON.Feature
): boolean {
  const geom = feature.geometry;
  if (!geom) return false;

  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    return booleanPointInPolygon(
      pt,
      feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
    );
  }

  if (geom.type === 'GeometryCollection') {
    for (const sub of (geom as GeoJSON.GeometryCollection).geometries) {
      if (sub.type === 'Polygon' || sub.type === 'MultiPolygon') {
        const syntheticFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
          type: 'Feature',
          properties: feature.properties,
          geometry: sub as GeoJSON.Polygon | GeoJSON.MultiPolygon,
        };
        if (booleanPointInPolygon(pt, syntheticFeature)) return true;
      }
    }
  }

  return false;
}

const OFFSET_DEG = 0.0003;
const PROXIMITY_OFFSETS: [number, number][] = [
  [OFFSET_DEG, 0],
  [-OFFSET_DEG, 0],
  [0, OFFSET_DEG],
  [0, -OFFSET_DEG],
];

function matchFeatureWithProximity(
  lat: number,
  lng: number,
  features: GeoJSON.Feature[]
): { feature: GeoJSON.Feature; viaBuffer: boolean } | null {
  const pt = point([lng, lat]);
  for (const feature of features) {
    if (!feature.geometry) continue;
    try {
      if (testPointInFeature(pt, feature)) {
        return { feature, viaBuffer: false };
      }
    } catch {
      continue;
    }
  }

  for (const [dlat, dlng] of PROXIMITY_OFFSETS) {
    const offsetPt = point([lng + dlng, lat + dlat]);
    for (const feature of features) {
      if (!feature.geometry) continue;
      try {
        if (testPointInFeature(offsetPt, feature)) {
          return { feature, viaBuffer: true };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function checkMihEligibility(
  lat: number,
  lng: number,
  forceRefresh = false,
  zoneDist?: string
): Promise<MihEligibilityResult> {
  const now = new Date().toISOString();

  const geojson = await fetchMihGeojson(forceRefresh);
  if (!geojson) {
    return {
      status: 'unavailable',
      eligible: false,
      derived: {},
      source: { ...SOURCE_META, fetchedAtISO: now },
      errors: ['Could not fetch MIH GeoJSON data'],
    };
  }

  const match = matchFeatureWithProximity(lat, lng, geojson.features);

  if (match) {
    const props = (match.feature.properties || {}) as Record<string, unknown>;
    const notes: string[] = [];
    if (match.viaBuffer) {
      notes.push('Matched via proximity buffer (~30m); confirm with official zoning map');
    }
    return {
      status: 'eligible',
      eligible: true,
      mihFeatureId: match.feature.id != null ? String(match.feature.id) : undefined,
      mihProperties: props,
      derived: {
        option: findProperty(props, OPTION_KEYS),
        areaName: findProperty(props, NAME_KEYS),
      },
      source: { ...SOURCE_META, fetchedAtISO: now },
      bufferMatch: match.viaBuffer,
      notes,
    };
  }

  if (zoneDist && /\d[A-Z]$/i.test(zoneDist.trim())) {
    const suffix = zoneDist.trim().slice(-1).toUpperCase();
    if (suffix === 'D' || suffix === 'X') {
      return {
        status: 'needs_verification',
        eligible: false,
        derived: {},
        source: { ...SOURCE_META, fetchedAtISO: now },
        notes: [
          `Zoning district ${zoneDist} has suffix typically associated with MIH rezonings; manual confirmation recommended`,
        ],
      };
    }
  }

  return {
    status: 'not_eligible',
    eligible: false,
    derived: {},
    source: { ...SOURCE_META, fetchedAtISO: now },
  };
}
