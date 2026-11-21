import { collection, query, where, getDocsFromServer, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Pin } from '../types';
import { publicPinFilters } from './pinVisibility';
import {
  GeographicCluster,
  FootprintStatsData,
  DynamicViewportConfig,
  CountryFootprintGroup,
  clusterPinsGeographically,
  calculateFootprintStats,
  calculateDynamicViewport,
  aggregatePinsByCountryAndCity,
} from '../utils/footprintUtils';
import { fetchUserPins } from './pinService';

export interface UserFootprintData {
  pins: Pin[];
  clusters: GeographicCluster[];
  countries: CountryFootprintGroup[];
  stats: FootprintStatsData;
  viewport: DynamicViewportConfig;
}

/**
 * Standardized filter ensuring ONLY genuine, valid, published public pins are included.
 * Never includes mock data, drafts, archived, private, or invalid coordinates.
 */
export function filterValidPublicPins(rawPins: Pin[]): Pin[] {
  const isDemoDisabled = (import.meta as any).env?.VITE_DEMO_MODE === 'false';

  return rawPins.filter((pin) => {
    if (!pin) return false;

    // Coordinate validation
    if (typeof pin.latitude !== 'number' || typeof pin.longitude !== 'number') return false;
    if (isNaN(pin.latitude) || isNaN(pin.longitude)) return false;
    if (pin.latitude < -90 || pin.latitude > 90 || pin.longitude < -180 || pin.longitude > 180) {
      return false;
    }
    // Null island / placeholder check
    if (pin.latitude === 0 && pin.longitude === 0) return false;

    // Privacy checks
    if (pin.isPrivate === true || pin.visibility === 'private') return false;

    // Publication / Moderation status checks
    if (pin.status === 'draft' || pin.status === 'archived') return false;
    if (pin.isReported === true || pin.status === 'reported' || pin.status === 'removed') return false;
    if (pin.isDeleted === true) return false;

    // Demo pins check: Never include demo or seed pins
    if (pin.isDemo === true || pin.id?.startsWith('seed_pin_') || pin.id?.startsWith('curated_pin_')) {
      return false;
    }

    return true;
  });
}

/**
 * Builds user footprint data from an array of valid pins.
 */
export function buildFootprintFromPins(validPublicPins: Pin[]): UserFootprintData {
  const clusters = clusterPinsGeographically(validPublicPins);
  const countries = aggregatePinsByCountryAndCity(validPublicPins);
  const stats = calculateFootprintStats(clusters, validPublicPins.length);
  const viewport = calculateDynamicViewport(clusters);

  return {
    pins: validPublicPins,
    clusters,
    countries,
    stats,
    viewport,
  };
}

/**
 * Real-time subscription to user's real Firestore footprint.
 * Updates immediately whenever the user publishes, edits, or removes pins.
 */
export function subscribeToUserFootprint(
  userId: string,
  onUpdate: (data: UserFootprintData) => void,
  onError?: (err: any) => void
): () => void {
  if (!userId) {
    onUpdate({
      pins: [],
      clusters: [],
      countries: [],
      stats: { totalSpots: 0, citiesCount: 0, countriesCount: 0 },
      viewport: calculateDynamicViewport([]),
    });
    return () => {};
  }

  try {
    const q = query(
      collection(db, 'pins'),
      ...publicPinFilters,
      where('userId', '==', userId),
      limit(250)
    );

    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const rawPins: Pin[] = (snap.metadata.fromCache ? [] : snap.docs).map((d) => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(data as Omit<Pin, 'id'>),
            createdAt:
              typeof data.createdAt?.toDate === 'function'
                ? data.createdAt.toDate().toISOString()
                : data.createdAt || new Date().toISOString(),
          };
        });

        const validPublicPins = filterValidPublicPins(rawPins);
        onUpdate(buildFootprintFromPins(validPublicPins));
      },
      (err) => {
        console.warn('Footprint onSnapshot notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('subscribeToUserFootprint initial error:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetches and aggregates the real public footprint for a specific user.
 *
 * Rules:
 * - Queries the Firestore "pins" collection for the user's pins.
 * - Filters for strictly PUBLIC pins (excludes private, draft, unpublished, deleted, or reported pins).
 * - Excludes demo pins if DEMO_MODE is disabled.
 * - Safely validates coordinate ranges and drops invalid or 0,0 placeholder coordinates.
 * - Obscures pin locations geographically into city/region clusters with rounded centroids.
 * - Computes dynamic statistics (spots, cities, countries).
 * - Computes intelligent zoom and viewport settings.
 */
export async function fetchUserFootprint(userId: string): Promise<UserFootprintData> {
  if (!userId) {
    const emptyClusters: GeographicCluster[] = [];
    return {
      pins: [],
      clusters: emptyClusters,
      countries: [],
      stats: calculateFootprintStats(emptyClusters, 0),
      viewport: calculateDynamicViewport(emptyClusters),
    };
  }

  // 1. Fetch pins for this user from pinService (which queries Firestore and merges real session cache)
  let rawPins: Pin[] = [];
  try {
    rawPins = await fetchUserPins(userId);
  } catch (err) {
    console.warn('Notice querying user pins for footprint, trying direct Firestore query:', err);
    try {
      const q = query(
        collection(db, 'pins'),
        ...publicPinFilters,
        where('userId', '==', userId),
        limit(150)
      );
      const snap = await getDocsFromServer(q);
      rawPins = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pin, 'id'>) }));
    } catch (e2) {
      console.error('Failed to load footprint pins:', e2);
      rawPins = [];
    }
  }

  // 2. Strict public filtering & coordinate validation
  const validPublicPins = filterValidPublicPins(rawPins);

  // 3. Build footprint data
  return buildFootprintFromPins(validPublicPins);
}
