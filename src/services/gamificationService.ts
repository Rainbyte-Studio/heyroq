import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Pin,
  UserProfile,
  UserProgressionSummary,
  UserAchievement,
  XpEvent,
} from '../types';
import { filterValidPublicPins } from './footprintService';
import { extractCityAndCountry } from '../utils/footprintUtils';
import {
  EXPLORER_LEVELS,
  ACHIEVEMENTS_CATALOG,
  PROGRESSION_CONSTANTS,
  LIKE_MILESTONES,
  FOLLOWER_MILESTONES,
  getProgressForXp,
  getPinCreatedEventId,
  getFirstDiscoveryEventId,
  getRichDiscoveryEventId,
  getAchievementEventId,
  getLikeMilestoneEventId,
  getFollowerMilestoneEventId,
  ExplorerLevelDef,
  AchievementBlueprint,
  MetricContext,
} from '../config/progressionConfig';

// Re-export configurations and helper functions for backward compatibility with UI components
export {
  EXPLORER_LEVELS,
  ACHIEVEMENTS_CATALOG,
  PROGRESSION_CONSTANTS,
  LIKE_MILESTONES,
  FOLLOWER_MILESTONES,
  getProgressForXp,
};
export type { ExplorerLevelDef, AchievementBlueprint, MetricContext };
export type LevelDefinition = ExplorerLevelDef;
export const getLevelInfo = getProgressForXp;

// ============================================================================
// CALCULATION ENGINE (Server & Client-Preview Pure Function)
// ============================================================================

export interface ProgressionCalculationResult {
  summary: UserProgressionSummary;
  achievements: UserAchievement[];
  xpEvents: XpEvent[];
}

/**
 * Estimates non-geographic progression for local previews. Only the backend can award XP.
 * Pure function: strictly idempotent, milestone-based, and preserves permanent unlocked achievements.
 */
export function calculateProgression(
  userId: string,
  rawPins: Pin[],
  userProfile?: Partial<UserProfile> | null,
  existingAchievements?: UserAchievement[]
): ProgressionCalculationResult {
  const validPins = filterValidPublicPins(rawPins);
  const totalSpots = validPins.length;

  // Geographic footprint calculation with ISO normalization
  const uniqueCitiesSet = new Set<string>();
  const uniqueCountriesSet = new Set<string>();

  validPins.forEach((pin) => {
    const geo = extractCityAndCountry(pin);
    if (geo.city && geo.city !== 'Exploration Spot') {
      const c = geo.city.toLowerCase().trim();
      uniqueCitiesSet.add(c);
    }
    if (geo.countryCode && geo.countryCode !== 'GL') {
      uniqueCountriesSet.add(geo.countryCode.toUpperCase().trim());
    }
  });

  const citiesCount = uniqueCitiesSet.size;
  const countriesCount = uniqueCountriesSet.size;

  // Engagement metrics
  const likesReceived = validPins.reduce((acc, p) => acc + (Number(p.likeCount) || 0), 0);
  const followersCount = Number(userProfile?.followersCount) || 0;

  // Category metrics
  let hiddenGemsCount = 0;
  let foodCount = 0;
  let natureCount = 0;
  let richSpotsCount = 0;

  validPins.forEach((pin) => {
    const cat = (pin.category || '').toLowerCase();
    if (cat.includes('hidden') || cat.includes('gem')) hiddenGemsCount++;
    if (cat.includes('food')) foodCount++;
    if (cat.includes('nature')) natureCount++;
    const hasLongDesc = (pin.description || '').trim().length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
    const hasTags = Array.isArray(pin.tags) && pin.tags.length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
    if (hasLongDesc && hasTags) {
      richSpotsCount++;
    }
  });

  // Profile completeness points (photo: +1, bio: +1, at least 1 pin: +1 => target 3)
  let profileCompletePoints = 0;
  if (userProfile?.photoURL || userProfile?.avatarUrl) profileCompletePoints++;
  if (userProfile?.bio && userProfile.bio.trim().length >= 10) profileCompletePoints++;
  if (totalSpots >= 1) profileCompletePoints++;

  const xpEvents: XpEvent[] = [];
  let baseActivityXp = 0;

  // 1. First discovery bonus (+100 XP)
  if (totalSpots >= 1) {
    baseActivityXp += PROGRESSION_CONSTANTS.FIRST_DISCOVERY_BONUS_XP;
    xpEvents.push({
      id: getFirstDiscoveryEventId(),
      userId,
      action: 'FIRST_DISCOVERY',
      referenceId: validPins[0]?.id || 'first_spot',
      xpEarned: PROGRESSION_CONSTANTS.FIRST_DISCOVERY_BONUS_XP,
      description: 'First discovery bonus unlocked',
      createdAt: new Date().toISOString(),
    });
  }

  // 2. Base discovery spot creation (+50 XP each)
  validPins.forEach((pin) => {
    baseActivityXp += PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP;
    xpEvents.push({
      id: getPinCreatedEventId(pin.id),
      userId,
      action: 'PIN_CREATED',
      referenceId: pin.id,
      xpEarned: PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP,
      description: `Discovered: ${pin.title}`,
      createdAt: pin.createdAt || new Date().toISOString(),
    });
  });

  // 5. Rich spot bonuses (+25 XP each)
  validPins.forEach((pin) => {
    const hasLongDesc = (pin.description || '').trim().length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
    const hasTags = Array.isArray(pin.tags) && pin.tags.length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
    if (hasLongDesc && hasTags) {
      baseActivityXp += PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP;
      xpEvents.push({
        id: getRichDiscoveryEventId(pin.id),
        userId,
        action: 'RICH_DISCOVERY',
        referenceId: pin.id,
        xpEarned: PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP,
        description: `Detailed guide bonus for: ${pin.title}`,
        createdAt: pin.createdAt || new Date().toISOString(),
      });
    }
  });

  // 6. Like Milestones (Permanent milestones, non-linear!)
  LIKE_MILESTONES.forEach((milestone) => {
    if (likesReceived >= milestone.count) {
      baseActivityXp += milestone.xp;
      xpEvents.push({
        id: getLikeMilestoneEventId(milestone.count),
        userId,
        action: 'LIKE_MILESTONE',
        referenceId: String(milestone.count),
        xpEarned: milestone.xp,
        description: `Reached ${milestone.count} total likes received`,
        createdAt: new Date().toISOString(),
      });
    }
  });

  // 7. Follower Milestones (Permanent milestones, non-linear!)
  FOLLOWER_MILESTONES.forEach((milestone) => {
    if (followersCount >= milestone.count) {
      baseActivityXp += milestone.xp;
      xpEvents.push({
        id: getFollowerMilestoneEventId(milestone.count),
        userId,
        action: 'FOLLOWER_MILESTONE',
        referenceId: String(milestone.count),
        xpEarned: milestone.xp,
        description: `Reached ${milestone.count} followers`,
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Preliminary Level estimation for Level-based achievements (e.g. Pioneer Voyager)
  const prelimLevel = getProgressForXp(baseActivityXp).level;

  const metricContext: MetricContext = {
    totalSpots,
    citiesCount,
    countriesCount,
    likesReceived,
    followersCount,
    hiddenGemsCount,
    foodCount,
    natureCount,
    photoSpotsCount: 0,
    distinctDiscoveryCount: 0,
    distinctCategoryCount: 0,
    qualifyingRichCount: 0,
    trustedLikeCount: 0,
    profileCompletePoints,
    level: prelimLevel,
  };

  // Map existing achievements to preserve permanent unlocked state
  const existingMap = new Map<string, UserAchievement>();
  if (existingAchievements && Array.isArray(existingAchievements)) {
    existingAchievements.forEach((a) => existingMap.set(a.id, a));
  }

  let achievementsXp = 0;
  let unlockedCount = 0;

  const userAchievements: UserAchievement[] = ACHIEVEMENTS_CATALOG.map((item) => {
    const existing = existingMap.get(item.id);
    const serverProofOnly = item.category === 'Geography' ||
      item.id === 'visual_storyteller' || item.id === 'heyroq_legend';
    const calculatedMetric = serverProofOnly ? 0 : item.metric(metricContext);
    const progressVal = Math.min(item.target, Math.max(existing?.progress || 0, calculatedMetric));

    // PERMANENT: If previously unlocked, it remains unlocked regardless of counter changes!
    const isUnlocked = Boolean(existing?.isUnlocked) || (!serverProofOnly && progressVal >= item.target);

    if (isUnlocked) {
      achievementsXp += existing?.isUnlocked ? existing.xpReward : item.xpReward;
      unlockedCount++;
      xpEvents.push({
        id: getAchievementEventId(item.id),
        userId,
        action: 'ACHIEVEMENT_UNLOCKED',
        referenceId: item.id,
        xpEarned: existing?.isUnlocked ? existing.xpReward : item.xpReward,
        description: `Unlocked achievement: ${item.title}`,
        createdAt: existing?.unlockedAt || new Date().toISOString(),
      });
    }

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      iconName: item.iconName,
      tier: existing?.isUnlocked ? existing.tier : item.tier,
      xpReward: existing?.isUnlocked ? existing.xpReward : item.xpReward,
      progress: progressVal,
      target: item.target,
      isUnlocked,
      unlockedAt: isUnlocked ? (existing?.unlockedAt || new Date().toISOString()) : null,
      updatedAt: new Date().toISOString(),
    };
  });

  // Re-verify Pioneer Voyager (Level 5) with full XP
  const prelimTotalXp = baseActivityXp + achievementsXp;
  const verifiedLevelInfo = getProgressForXp(prelimTotalXp);

  const pioneer = userAchievements.find((a) => a.id === 'pioneer_voyager');
  if (pioneer && !pioneer.isUnlocked && verifiedLevelInfo.level >= 5) {
    pioneer.isUnlocked = true;
    pioneer.progress = 5;
    pioneer.unlockedAt = new Date().toISOString();
    achievementsXp += pioneer.xpReward;
    unlockedCount++;
    xpEvents.push({
      id: getAchievementEventId('pioneer_voyager'),
      userId,
      action: 'ACHIEVEMENT_UNLOCKED',
      referenceId: 'pioneer_voyager',
      xpEarned: pioneer.xpReward,
      description: `Unlocked achievement: ${pioneer.title}`,
      createdAt: new Date().toISOString(),
    });
  }

  const finalTotalXp = baseActivityXp + achievementsXp;
  const finalLevelInfo = getProgressForXp(finalTotalXp);

  const summary: UserProgressionSummary = {
    userId,
    xp: finalTotalXp,
    level: finalLevelInfo.level,
    title: finalLevelInfo.title,
    nextLevelXp: finalLevelInfo.nextLevelXp,
    currentLevelBaseXp: finalLevelInfo.currentLevelBaseXp,
    progressPercent: finalLevelInfo.progressPercent,
    totalSpotsCount: totalSpots,
    citiesCount,
    countriesCount,
    likesReceivedCount: likesReceived,
    followersCount,
    unlockedAchievementsCount: unlockedCount,
    totalAchievementsCount: ACHIEVEMENTS_CATALOG.length,
    updatedAt: new Date().toISOString(),
  };

  return {
    summary,
    achievements: userAchievements,
    xpEvents,
  };
}

// ============================================================================
// READ-ONLY REAL-TIME OBSERVERS (Browser Client)
// ============================================================================

/**
 * Purely observational real-time listener for user progression summary.
 * Strictly READ-ONLY: Never writes or backfills to Firestore from the browser client.
 */
export function subscribeToUserProgression(
  userId: string,
  onUpdate: (summary: UserProgressionSummary) => void,
  onError?: (err: any) => void
): () => void {
  if (!userId) {
    onUpdate(getDefaultProgressionSummary(''));
    return () => {};
  }

  const summaryRef = doc(db, 'users', userId, 'progression', 'summary');

  return onSnapshot(
    summaryRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserProgressionSummary;
        onUpdate(data);
      } else {
        // Doc not yet created on server: report condition cleanly and provide initial Level 1 default state without client write
        console.info(`[Progression] Progression summary doc does not exist yet for user ${userId}. Awaiting server-authoritative trigger.`);
        onUpdate(getDefaultProgressionSummary(userId));
      }
    },
    (err) => {
      console.warn('Progression observer read event:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Purely observational real-time listener for user achievements list.
 * Strictly READ-ONLY: Never writes or backfills to Firestore from the browser client.
 */
export function subscribeToUserAchievements(
  userId: string,
  onUpdate: (achievements: UserAchievement[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!userId) {
    onUpdate(getDefaultAchievements());
    return () => {};
  }

  const achCol = collection(db, 'users', userId, 'achievements');

  return onSnapshot(
    achCol,
    (snap) => {
      const saved = new Map(snap.docs.map(doc => [doc.id, doc.data() as UserAchievement]));
      onUpdate(getDefaultAchievements().map(defaultBadge => {
        const found = saved.get(defaultBadge.id);
        if (!found) return defaultBadge;
        if (found.isUnlocked) return { ...defaultBadge, ...found, description: defaultBadge.description };
        const progress = found.id === 'visual_storyteller' ? (found.qualifiedPhotoProgress ?? 0) : found.progress;
        return {
          ...defaultBadge,
          progress,
          verifiedGeographicProgress: found.verifiedGeographicProgress,
          updatedAt: found.updatedAt,
        };
      }));
    },
    (err) => {
      console.warn('Achievements observer read event:', err);
      if (onError) onError(err);
      onUpdate(getDefaultAchievements());
    }
  );
}

/**
 * Fetches recent XP milestone events for a user.
 */
export async function fetchUserXpEvents(userId: string, count = 10): Promise<XpEvent[]> {
  if (!userId) return [];
  try {
    const q = query(
      collection(db, 'users', userId, 'xpEvents'),
      orderBy('createdAt', 'desc'),
      limit(count)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<XpEvent, 'id'>),
    }));
  } catch (err) {
    console.warn('Error fetching XP events:', err);
    return [];
  }
}

/**
 * @deprecated Server-authoritative architecture: progression is calculated exclusively by Cloud Functions.
 * Client writes to progression documents are strictly prohibited by Firestore rules.
 * This helper calculates progression purely in-memory for preview/dry-run purposes and does NOT execute any write to Firestore.
 */
export async function syncUserProgression(
  userId: string,
  knownPins?: Pin[]
): Promise<UserProgressionSummary> {
  if (!userId) {
    return getDefaultProgressionSummary('');
  }

  let pinsToUse: Pin[] = knownPins || [];
  if (!knownPins || knownPins.length === 0) {
    try {
      const q = query(
        collection(db, 'pins'),
        where('userId', '==', userId),
        limit(200)
      );
      const snap = await getDocs(q);
      pinsToUse = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Pin, 'id'>),
      }));
    } catch (err) {
      console.warn('Error reading pins for in-memory preview:', err);
    }
  }

  let userProfile: Partial<UserProfile> | null = null;
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      userProfile = userDoc.data() as UserProfile;
    }
  } catch (err) {
    console.warn('Error reading profile for in-memory preview:', err);
  }

  const { summary } = calculateProgression(userId, pinsToUse, userProfile);
  return summary;
}

// Helpers
function getDefaultProgressionSummary(userId: string): UserProgressionSummary {
  const level1 = EXPLORER_LEVELS[0];
  return {
    userId,
    xp: 0,
    level: 1,
    title: level1.title,
    nextLevelXp: level1.maxXp + 1,
    currentLevelBaseXp: 0,
    progressPercent: 0,
    totalSpotsCount: 0,
    citiesCount: 0,
    countriesCount: 0,
    likesReceivedCount: 0,
    followersCount: 0,
    unlockedAchievementsCount: 0,
    totalAchievementsCount: ACHIEVEMENTS_CATALOG.length,
    updatedAt: new Date().toISOString(),
  };
}

function getDefaultAchievements(): UserAchievement[] {
  return ACHIEVEMENTS_CATALOG.map((catItem) => ({
    id: catItem.id,
    title: catItem.title,
    description: catItem.description,
    category: catItem.category,
    iconName: catItem.iconName,
    tier: catItem.tier,
    xpReward: catItem.xpReward,
    progress: 0,
    target: catItem.target,
    isUnlocked: false,
    unlockedAt: null,
    updatedAt: new Date().toISOString(),
  }));
}
