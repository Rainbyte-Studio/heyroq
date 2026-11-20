import type { UserAchievement } from '../types';

export type AchievementAvailability = 'coming_soon' | 'available' | 'completed';
type GeographicRelease = Exclude<AchievementAvailability, 'completed'>;

// This release setting only affects presentation. Award eligibility is server-owned.
const geographicReleases: Readonly<Partial<Record<string, GeographicRelease>>> = {
  local_explorer: 'coming_soon',
  city_scout: 'coming_soon',
  metro_hopper: 'coming_soon',
  city_pathfinder: 'coming_soon',
  border_crosser: 'coming_soon',
  world_citizen: 'coming_soon',
  global_voyager: 'coming_soon',
};

export function getAchievementPresentation(
  badge: Pick<UserAchievement, 'id' | 'isUnlocked' | 'progress' | 'target' | 'verifiedGeographicProgress'>,
  geographicRelease = geographicReleases[badge.id],
): { state: AchievementAvailability; progress: number | null } {
  if (badge.isUnlocked) return { state: 'completed', progress: badge.progress };
  if (geographicRelease === 'coming_soon') return { state: 'coming_soon', progress: null };
  if (geographicRelease === undefined) return { state: 'available', progress: badge.progress };

  // Legacy progress may predate verified geography. A future backend can write
  // this separate count from verified evidence, including an explicit zero.
  const verified = badge.verifiedGeographicProgress;
  const progress = typeof verified === 'number' && Number.isSafeInteger(verified) && verified >= 0
    ? Math.min(verified, badge.target)
    : null;
  return { state: 'available', progress };
}
