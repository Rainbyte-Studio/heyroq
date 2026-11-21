import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { discoveryLocationKey } from './progressionLocation';
import { isPublishedDiscovery } from './progressionEvidence';

type City = [id: string, country: string, name: string, region: string, latitude: number, longitude: number];
const catalog: { version: string; cities: City[] } = require('../geographyCatalog.json');

export const MAX_GEOGRAPHY_PINS_PER_UTC_DAY = 5;
const cities = new Map(catalog.cities.map(city => [city[0], city]));
const CITY_CENTER_LIMIT_KM = 25;
const radians = (degrees: number) => degrees * Math.PI / 180;

export interface GeographicPolicy {
  readonly startsAtMs: number;
  readonly pilotUsers?: ReadonlySet<string>;
}

export interface GeographicReceipt {
  schemaVersion: 2;
  catalogVersion: string;
  pinId: string;
  publishedDay: string;
  countryCode: string;
  cityId: string;
}

// Recovery deployments omit the capability. A capable deployment still needs
// a post-reset cutoff in the server-owned writer control document.
export function configuredGeographicPolicy(
  cutoff: unknown = undefined,
): GeographicPolicy | undefined {
  if (process.env.HEYROQ_GEOGRAPHY_V11_CAPABLE !== 'true' ||
      typeof cutoff !== 'number' || !Number.isSafeInteger(cutoff) || cutoff <= 0) return undefined;
  return { startsAtMs: cutoff };
}

export function validateGeographicSelection(
  selection: unknown, latitude: number, longitude: number,
): { countryCode: string; cityId: string } | undefined {
  if (!selection || typeof selection !== 'object' || Object.keys(selection).length !== 2 ||
      !discoveryLocationKey(latitude, longitude)) return;
  const { countryCode, cityId } = selection as Record<string, unknown>;
  if (typeof cityId !== 'string' || !/^\d{1,12}$/.test(cityId)) return;
  const city = cities.get(cityId);
  if (!city || countryCode !== city[1]) return;

  const latDelta = radians(latitude - city[4]);
  const lngDelta = radians(longitude - city[5]);
  const h = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(city[4])) * Math.sin(lngDelta / 2) ** 2;
  const distanceKm = 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h)));
  if (distanceKm > CITY_CENTER_LIMIT_KM) return;
  return { countryCode, cityId };
}

export function geographicReceiptForPin(
  pin: DocumentSnapshot, userId: string, policy: GeographicPolicy,
): GeographicReceipt | undefined {
  const data = pin.data();
  const created = pin.createTime;
  if (!data || !created || !Number.isSafeInteger(policy.startsAtMs) || policy.startsAtMs <= 0 ||
      created.toMillis() < policy.startsAtMs || (policy.pilotUsers && !policy.pilotUsers.has(userId)) ||
      data.userId !== userId || !isPublishedDiscovery(data) || data.isReported || data.isPrivate ||
      data.visibility === 'private' || data.publishReceipt !== true ||
      typeof data.imageIncarnation !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.imageIncarnation) ||
      !Array.isArray(data.imageUrls) || data.imageUrls.length === 0) return;
  const place = validateGeographicSelection(data.geographySelection, data.latitude, data.longitude);
  if (!place) return;
  return {
    schemaVersion: 2,
    catalogVersion: catalog.version,
    pinId: pin.id,
    publishedDay: created.toDate().toISOString().slice(0, 10),
    ...place,
  };
}
