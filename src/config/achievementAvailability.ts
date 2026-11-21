import type { UserAchievement } from '../types';

export type AchievementAvailability = 'coming_soon' | 'available' | 'completed';

export interface VerifiedGeographicCounts {
  cities: number;
  countries: number;
}

const geographicBadgeDimensions: ReadonlyMap<string, keyof VerifiedGeographicCounts> = new Map([
  ['local_explorer', 'cities'],
  ['city_scout', 'cities'],
  ['metro_hopper', 'cities'],
  ['city_pathfinder', 'cities'],
  ['border_crosser', 'countries'],
  ['world_citizen', 'countries'],
  ['global_voyager', 'countries'],
]);

export const geographyAchievementsAvailable = import.meta.env?.VITE_GEOGRAPHY_V11_AVAILABLE === 'true';
const availableGeographicBadgeIds: ReadonlySet<string> = new Set(
  geographyAchievementsAvailable ? geographicBadgeDimensions.keys() : [],
);

export function getVerifiedGeographicCounts(
  eventIds: Iterable<string>,
  { fromCache, hasPendingWrites }: { fromCache: boolean; hasPendingWrites: boolean },
): VerifiedGeographicCounts | null {
  if (fromCache || hasPendingWrites) return null;

  // Match the server's verified ledger counters. Lifetime summary counts can
  // also include legacy awards based on unverified place labels.
  const counts = { cities: 0, countries: 0 };
  for (const id of eventIds) {
    if (id.startsWith('geo_v1:city:')) counts.cities++;
    if (id.startsWith('geo_v1:country:')) counts.countries++;
  }
  return counts;
}

export function getAchievementPresentation(
  badge: Pick<UserAchievement, 'id' | 'category' | 'isUnlocked' | 'progress' | 'target' | 'verifiedGeographicProgress'>,
  { availableIds = availableGeographicBadgeIds, verifiedGeography }: {
    availableIds?: ReadonlySet<string>;
    verifiedGeography?: VerifiedGeographicCounts | null;
  } = {},
): { state: AchievementAvailability; progress: number | null } {
  if (badge.isUnlocked) return { state: 'completed', progress: badge.progress };
  if (badge.category !== 'Geography') return { state: 'available', progress: badge.progress };

  const dimension = geographicBadgeDimensions.get(badge.id);
  if (!dimension || !availableIds.has(badge.id)) return { state: 'coming_soon', progress: null };

  const verified = verifiedGeography?.[dimension] ?? badge.verifiedGeographicProgress;
  const progress = typeof verified === 'number' && Number.isSafeInteger(verified) && verified >= 0
    ? Math.min(verified, badge.target)
    : null;
  return { state: 'available', progress };
}
