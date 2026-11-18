import { createHash } from 'node:crypto';
import { getCityFirstEventId } from './progressionConfig';

export interface ResolvedGeography {
  countryCode: string;
  city: string | null;
  cityBoundaryId: string | null;
  attribution: string;
}

interface BoundaryProperties {
  country_code?: unknown;
  city?: unknown;
  name?: unknown;
  place_id?: unknown;
  datasource?: { attribution?: unknown };
}

export const GEOGRAPHY_RETRY_WINDOW_MS = 60 * 60 * 1000;

export function geographyStartTime(value: string | undefined): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value.replace('Z', '.000Z')
    ? time
    : NaN;
}

const legacyCityAliases = new Map([
  ['athina', 'athens'], ['roma', 'rome'], ['zante', 'zakynthos'],
  ['thira', 'santorini'], ['kerkyra', 'corfu'],
]);

function normalizeCity(value: string): string {
  const city = value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const aliasKey = city.normalize('NFD').replace(/\p{M}/gu, '');
  return legacyCityAliases.get(aliasKey) ?? city;
}

export function geographyCityIds(city: string, countryCode: string) {
  const legacyId = getCityFirstEventId(city);
  const slug = legacyId.slice('city_first:'.length);
  const identity = slug || 'u-' + createHash('sha256').update(city).digest('hex');
  return { id: `city_first:${countryCode}:${identity}`, legacyId: slug ? legacyId : null };
}

function parseBoundaries(body: unknown): ResolvedGeography | null {
  const response = body as { type?: unknown; features?: { properties?: BoundaryProperties }[] };
  if (response?.type !== 'FeatureCollection' || !Array.isArray(response.features)) {
    throw new Error('Invalid geography provider response');
  }

  const countries = new Set<string>();
  const cities = new Set<string>();
  const boundaries = new Map<string, Set<string>>();
  const attributions = new Set<string>();
  for (const { properties } of response.features) {
    if (!properties) continue;
    const country = properties.country_code;
    if (typeof country !== 'string' || !/^[a-z]{2}$/i.test(country)) continue;
    countries.add(country.toUpperCase());

    const attribution = properties.datasource?.attribution;
    if (typeof attribution === 'string' && attribution.trim()) attributions.add(attribution);
    const city = typeof properties.city === 'string' ? normalizeCity(properties.city) : '';
    if (!city || city.length > 120 || !/\p{L}/u.test(city)) continue;
    cities.add(city);

    const name = typeof properties.name === 'string' ? normalizeCity(properties.name) : '';
    const boundaryId = properties.place_id;
    if (name === city && typeof boundaryId === 'string' && /^[a-f0-9]{1,512}$/i.test(boundaryId)) {
      const ids = boundaries.get(city) ?? new Set<string>();
      ids.add(boundaryId);
      boundaries.set(city, ids);
    }
  }

  if (countries.size !== 1 || attributions.size === 0) return null;
  const city = cities.size === 1 ? [...cities][0] : null;
  const ids = city ? boundaries.get(city) : undefined;
  return {
    countryCode: [...countries][0],
    city,
    cityBoundaryId: ids?.size === 1 ? [...ids][0] : null,
    attribution: [...attributions].sort().join('; '),
  };
}

export async function resolvePinGeography(
  latitude: number, longitude: number, apiKey: string, request: typeof fetch = fetch,
): Promise<ResolvedGeography | null> {
  const url = new URL('https://api-eu.geoapify.com/v1/boundaries/part-of');
  url.search = new URLSearchParams({
    lat: String(latitude), lon: String(longitude), boundaries: 'administrative,place',
    geometry: 'point', lang: 'en', apiKey,
  }).toString();

  // A fetch failure can contain the full URL. Keep credentials out of logs.
  try {
    const response = await request(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (response.status === 429 || response.status >= 500) throw new Error();
    if (!response.ok) {
      console.warn('[Geography XP] Provider rejected request', response.status);
      return null;
    }
    return parseBoundaries(await response.json());
  } catch {
    throw new Error('Geography verification unavailable');
  }
}
