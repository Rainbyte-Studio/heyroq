import { createHash } from 'node:crypto';
import { getCityFirstEventId } from './progressionConfig';

export interface ResolvedGeography {
  countryCode: string;
  city: string | null;
  cityBoundaryId: string | null;
  attribution: string;
}

export const GEOGRAPHY_RETRY_WINDOW_MS = 60 * 60 * 1000;

const legacyCityAliases = new Map([
  ['athina', 'athens'], ['roma', 'rome'], ['zante', 'zakynthos'],
  ['thira', 'santorini'], ['kerkyra', 'corfu'],
]);

export function normalizeGeographyCity(value: string): string {
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
