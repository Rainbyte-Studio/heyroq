import type { UserAchievement } from '../types';

export type AchievementAvailability = 'coming_soon' | 'available' | 'completed';

// Build the activated presentation only after the awarding backend is verified.
const availableGeographicBadgeIds: ReadonlySet<string> = new Set(
  import.meta.env?.VITE_GEOGRAPHY_V11_AVAILABLE === 'true'
    ? ['local_explorer', 'city_scout', 'metro_hopper', 'city_pathfinder',
      'border_crosser', 'world_citizen', 'global_voyager']
    : [],
);

export function getAchievementPresentation(
  badge: Pick<UserAchievement, 'id' | 'category' | 'isUnlocked' | 'progress' | 'target' | 'verifiedGeographicProgress'>,
  availableIds: ReadonlySet<string> = availableGeographicBadgeIds,
): { state: AchievementAvailability; progress: number | null } {
  if (badge.isUnlocked) return { state: 'completed', progress: badge.progress };
  if (badge.category !== 'Geography') return { state: 'available', progress: badge.progress };
  if (!availableIds.has(badge.id)) return { state: 'coming_soon', progress: null };

  // Legacy progress may predate verified geography. A future backend can write
  // this separate count from verified evidence, including an explicit zero.
  const verified = badge.verifiedGeographicProgress;
  const progress = typeof verified === 'number' && Number.isSafeInteger(verified) && verified >= 0
    ? Math.min(verified, badge.target)
    : null;
  return { state: 'available', progress };
}
