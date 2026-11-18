import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  GEOGRAPHY_RETRY_WINDOW_MS, geographyCityIds, normalizeGeographyCity,
  type ResolvedGeography,
} from './progressionGeography';
import { discoveryLocationKey, eligibleDiscoveryIds } from './progressionLocation';
import {
  ACHIEVEMENTS_CATALOG,
  PROGRESSION_CONSTANTS,
  LIKE_MILESTONES,
  FOLLOWER_MILESTONES,
  getProgressForXp,
  getPinCreatedEventId,
  getFirstDiscoveryEventId,
  getCountryFirstEventId,
  getRichDiscoveryEventId,
  getAchievementEventId,
  getLikeMilestoneEventId,
  getFollowerMilestoneEventId,
  MetricContext,
} from './progressionConfig';

// Initialize Firebase Admin SDK
initializeApp();

export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';

const db = getFirestore(FIRESTORE_DATABASE_ID);
const storage = getStorage();

export const FUNCTION_REGION = 'europe-west2';

interface PinGeography {
  pin: FirebaseFirestore.QueryDocumentSnapshot;
  location: ResolvedGeography | null;
}

function isActivePin(data: FirebaseFirestore.DocumentData): boolean {
  return !data.isDeleted && data.status !== 'reported' && data.status !== 'removed';
}

function geographyReceipt(userId: string, pinId: string) {
  return db.collection('users').doc(userId).collection('geographyPins').doc(pinId);
}

/**
 * Server-Authoritative Progression Calculation and Update Engine
 *
 * ARCHITECTURAL CONTRACT (PERMANENT / HISTORICAL vs DYNAMIC):
 *
 * HISTORICAL / MONOTONIC (MUST NEVER DECREASE):
 * - Lifetime XP (`xp`): Cumulative sum of all earned ledger events.
 * - Explorer Level (`level` & `title`): Determined strictly by lifetime XP.
 * - Lifetime Discovered Spots (`totalSpotsCount`): Permanent milestone count.
 * - Lifetime Discovered Cities (`citiesCount`): Unique historical cities explored.
 * - Lifetime Discovered Countries (`countriesCount`): Unique historical countries visited.
 * - Unlocked Achievements: Once earned (`isUnlocked === true`), permanent forever.
 * - Historical Achievement Progress: High-water mark preserved for exploration/discovery.
 * - Milestone XP Events: Deterministic ledger entries are never revoked or deleted.
 *
 * DYNAMIC / CURRENT-STATE (LEGITIMATELY TRACKS LIVE STATE):
 * - Active Pins count (`userProfile.pinsCount`): Reflects current non-deleted pins for map/profile queries.
 * - Current Likes Received (`summary.likesReceivedCount`): Live sum of likes on surviving pins.
 * - Current Followers (`summary.followersCount`): Live count of followers.
 */
export async function updateUserProgressionServer(userId: string) {
  return syncUserProgression(userId);
}

async function syncUserProgression(userId: string, geography?: PinGeography, concurrencyRetry = 0): Promise<unknown> {
  if (!userId || userId.startsWith('system_') || userId.startsWith('demo_')) return null;

  // Do not rebuild deleted users' profiles when delayed Firestore triggers arrive.
  const deletionLockRef = db.collection('accountDeletionLocks').doc(userId);
  if ((await deletionLockRef.get()).exists) return null;
  if (!(await db.collection('users').doc(userId).get()).exists) return null;

  // 1. Fetch user's active pins (excluding deleted or reported)
  const pinsSnap = await db.collection('pins').where('userId', '==', userId).get();
  const validPins: any[] = [];
  pinsSnap.forEach((doc) => {
    const data = doc.data();
    if (isActivePin(data)) {
      validPins.push({ ...data, id: doc.id });
    }
  });

  const activeSpotsCount = validPins.length; // DYNAMIC: Current non-deleted pins

  // 2. Fetch user profile for followers & completeness
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const followersCount = Number(userData?.followersCount) || 0; // DYNAMIC: Current followers

  // Engagement metrics: aggregate likes across surviving pins
  const likesReceived = validPins.reduce((acc, p) => acc + (Number(p.likeCount) || 0), 0); // DYNAMIC: Current likes

  // Category metrics across current active spots
  let hiddenGemsCount = 0;
  let foodCount = 0;
  let natureCount = 0;
  let photoSpotsCount = 0;
  let richSpotsCount = 0;

  validPins.forEach((pin) => {
    const cat = (pin.category || '').toLowerCase();
    if (cat.includes('hidden') || cat.includes('gem')) hiddenGemsCount++;
    if (cat.includes('food')) foodCount++;
    if (cat.includes('nature')) natureCount++;
    if (cat.includes('photo') || (pin.tags && pin.tags.some((t: string) => t.toLowerCase().includes('photo')))) {
      photoSpotsCount++;
    }
    const hasLongDesc = (pin.description || '').trim().length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
    const hasTags = Array.isArray(pin.tags) && pin.tags.length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
    if (hasLongDesc && hasTags) richSpotsCount++;
  });

  // Profile completeness (avatar, bio >= 10 chars, at least 1 spot)
  let profileCompletePoints = 0;
  if (userData?.avatarUrl || userData?.photoURL) profileCompletePoints++;
  if (userData?.bio && userData.bio.trim().length >= 10) profileCompletePoints++;

  // 3. Read Existing State to Enforce Monotonic Historical Invariants
  const summaryRef = db.collection('users').doc(userId).collection('progression').doc('summary');
  const summarySnap = await summaryRef.get();
  const existingSummary = summarySnap.exists ? summarySnap.data() : null;

  const xpEventsCol = db.collection('users').doc(userId).collection('xpEvents');
  const existingEventsSnap = await xpEventsCol.get();
  const existingEventIds = new Set<string>();
  const earnedCityBoundaryIds = new Set<string>();
  let historicalLedgerXp = 0;
  let historicalSpotsCount = 0;
  const historicalCitiesSet = new Set<string>();
  const historicalCountriesSet = new Set<string>();

  existingEventsSnap.forEach((doc) => {
    existingEventIds.add(doc.id);
    const data = doc.data();
    historicalLedgerXp += Number(data?.xpEarned) || 0;

    if (doc.id.startsWith('pin_created:')) {
      historicalSpotsCount++;
    } else if (doc.id.startsWith('city_first:')) {
      const cityRef = (data?.referenceId || doc.id.replace('city_first:', '')).toLowerCase().trim();
      historicalCitiesSet.add(cityRef);
      if (typeof data.geographyBoundaryId === 'string') {
        earnedCityBoundaryIds.add(data.geographyBoundaryId);
      }
    } else if (doc.id.startsWith('country_first:')) {
      const countryRef = (data?.referenceId || doc.id.replace('country_first:', '')).toUpperCase().trim();
      historicalCountriesSet.add(countryRef);
    }
  });

  const earnedCitiesBefore = historicalCitiesSet.size;
  const earnedCountriesBefore = historicalCountriesSet.size;
  const pendingXpEvents: { id: string; event: any }[] = [];
  const location = geography?.location;
  if (location) {
    const { countryCode, cityBoundaryId, attribution } = location;
    const city = location.city ? normalizeGeographyCity(location.city) : null;
    const countryEventId = getCountryFirstEventId(countryCode);
    const createdAt = new Date().toISOString();
    if (!existingEventIds.has(countryEventId) && !historicalCountriesSet.has(countryCode)) {
      historicalCountriesSet.add(countryCode);
      pendingXpEvents.push({
        id: countryEventId,
        event: {
          id: countryEventId, userId, createdAt, attribution,
          action: 'UNIQUE_COUNTRY', referenceId: countryCode,
          xpEarned: PROGRESSION_CONSTANTS.UNIQUE_COUNTRY_BONUS_XP,
          description: 'Verified a new country discovery',
        },
      });
    }

    if (city) {
      const { id, legacyId } = geographyCityIds(city, countryCode);
      const alreadyEarned = legacyId
        ? existingEventIds.has(legacyId) || existingEventIds.has(legacyId + ':' + countryCode)
        : historicalCitiesSet.has(city);
      if (!existingEventIds.has(id) && !alreadyEarned &&
          !(cityBoundaryId && earnedCityBoundaryIds.has(cityBoundaryId))) {
        historicalCitiesSet.add(city);
        pendingXpEvents.push({
          id,
          event: {
            id, userId, createdAt, attribution,
            action: 'UNIQUE_CITY', referenceId: city,
            ...(cityBoundaryId ? { geographyBoundaryId: cityBoundaryId } : {}),
            xpEarned: PROGRESSION_CONSTANTS.UNIQUE_CITY_BONUS_XP,
            description: 'Verified a new city discovery',
          },
        });
      }
    }
  }
  // Geography high-water marks survive deletes and historical partial ledgers.
  // HISTORICAL MONOTONIC METRICS: Must never decrease!
  const prevSpots = Number(existingSummary?.totalSpotsCount) || 0;
  const lifetimeSpotsCount = Math.max(prevSpots, historicalSpotsCount, activeSpotsCount);

  const prevCities = Number(existingSummary?.citiesCount) || 0;
  const lifetimeCitiesCount = Math.max(prevCities, historicalCitiesSet.size);

  const prevCountries = Number(existingSummary?.countriesCount) || 0;
  const lifetimeCountriesCount = Math.max(prevCountries, historicalCountriesSet.size);

  if (lifetimeSpotsCount >= 1) {
    profileCompletePoints++;
  }

  // 4. Calculate other pending XP events.

  // First discovery bonus (+100 XP)
  if (lifetimeSpotsCount >= 1) {
    const firstDiscId = getFirstDiscoveryEventId();
    if (!existingEventIds.has(firstDiscId)) {
      pendingXpEvents.push({
        id: firstDiscId,
        event: {
          id: firstDiscId,
          userId,
          action: 'FIRST_DISCOVERY',
          referenceId: validPins[0]?.id || 'first_spot',
          xpEarned: PROGRESSION_CONSTANTS.FIRST_DISCOVERY_BONUS_XP,
          description: 'First discovery bonus unlocked',
          createdAt: new Date().toISOString(),
        },
      });
    }
  }

  // Award discovery XP once per physical location, even after a pin is deleted.
  // Quantize to roughly 100m cells to prevent trivial coordinate jitter farming.
  // Existing ledger entries without a fingerprint are preserved unchanged.
  const earnedLocationKeys = new Set<string>();
  existingEventsSnap.forEach((doc) => {
    if (doc.data()?.action === 'PIN_CREATED' && typeof doc.data()?.locationKey === 'string') {
      earnedLocationKeys.add(doc.data().locationKey);
    }
  });
  const eligibleIds = new Set(eligibleDiscoveryIds(validPins, earnedLocationKeys));
  validPins.forEach((pin) => {
    if (!eligibleIds.has(pin.id)) return;
    const locationKey = discoveryLocationKey(pin.latitude, pin.longitude);
    if (!locationKey) return;
    const eventId = getPinCreatedEventId(pin.id);
    if (!existingEventIds.has(eventId)) {
      pendingXpEvents.push({
        id: eventId,
        event: {
          id: eventId,
          userId,
          action: 'PIN_CREATED',
          referenceId: pin.id,
          locationKey,
          xpEarned: PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP,
          description: `Discovered: ${pin.title || 'Spot'}`,
          createdAt: pin.createdAt || new Date().toISOString(),
        },
      });
    }
  });

  // Rich spot bonus (+25 XP each)
  validPins.forEach((pin) => {
    const hasLongDesc = (pin.description || '').trim().length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
    const hasTags = Array.isArray(pin.tags) && pin.tags.length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
    if (hasLongDesc && hasTags) {
      const eventId = getRichDiscoveryEventId(pin.id);
      if (!existingEventIds.has(eventId)) {
        pendingXpEvents.push({
          id: eventId,
          event: {
            id: eventId,
            userId,
            action: 'RICH_DISCOVERY',
            referenceId: pin.id,
            xpEarned: PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP,
            description: `Detailed guide bonus for: ${pin.title || 'Spot'}`,
            createdAt: pin.createdAt || new Date().toISOString(),
          },
        });
      }
    }
  });

  // Like Milestones (Permanent milestones - earned once reached, never revoked even if likes decrease)
  LIKE_MILESTONES.forEach((m) => {
    const eventId = getLikeMilestoneEventId(m.count);
    if (likesReceived >= m.count && !existingEventIds.has(eventId)) {
      pendingXpEvents.push({
        id: eventId,
        event: {
          id: eventId,
          userId,
          action: 'LIKE_MILESTONE',
          referenceId: String(m.count),
          xpEarned: m.xp,
          description: `Reached ${m.count} total likes received`,
          createdAt: new Date().toISOString(),
        },
      });
    }
  });

  // Follower Milestones (Permanent milestones - earned once reached, never revoked even if followers decrease)
  FOLLOWER_MILESTONES.forEach((m) => {
    const eventId = getFollowerMilestoneEventId(m.count);
    if (followersCount >= m.count && !existingEventIds.has(eventId)) {
      pendingXpEvents.push({
        id: eventId,
        event: {
          id: eventId,
          userId,
          action: 'FOLLOWER_MILESTONE',
          referenceId: String(m.count),
          xpEarned: m.xp,
          description: `Reached ${m.count} followers`,
          createdAt: new Date().toISOString(),
        },
      });
    }
  });

  // 5. Read Existing Achievements to PRESERVE permanent unlocked state!
  const achievementsCol = db.collection('users').doc(userId).collection('achievements');
  const existingAchSnap = await achievementsCol.get();
  const existingMap = new Map<string, any>();
  existingAchSnap.forEach((d) => existingMap.set(d.id, d.data()));

  // Some historical summaries contain earned XP that predates the ledger.
  const earnedXpBefore = Math.max(Number(existingSummary?.xp) || 0, historicalLedgerXp);
  const prelimLevel = getProgressForXp(earnedXpBefore).level;
  const metricContext: MetricContext = {
    totalSpots: lifetimeSpotsCount,       // Historical lifetime spots
    citiesCount: lifetimeCitiesCount,     // Historical lifetime cities
    countriesCount: lifetimeCountriesCount, // Historical lifetime countries
    likesReceived,                       // Dynamic live likes
    followersCount,                      // Dynamic live followers
    hiddenGemsCount,
    foodCount,
    natureCount,
    photoSpotsCount,
    profileCompletePoints,
    level: prelimLevel,
  };

  let unlockedCount = 0;
  const pendingAchievements: any[] = [];

  ACHIEVEMENTS_CATALOG.forEach((item) => {
    const existing = existingMap.get(item.id);
    const achEventId = getAchievementEventId(item.id);
    const isGeography = item.category === 'Geography';
    const calculatedMetric = item.metric(isGeography ? {
      ...metricContext,
      citiesCount: historicalCitiesSet.size,
      countriesCount: historicalCountriesSet.size,
    } : metricContext);

    // Determine progress high-water mark:
    // For exploration, geography, discovery, and special achievements, progress represents
    // lifetime discovery activity and must not regress upon pin deletion.
    // For community achievements, current progress reflects live metrics unless already unlocked.
    let progressVal: number;
    const isHistoricalCategory =
      item.category === 'Exploration' ||
      item.category === 'Geography' ||
      item.category === 'Discovery' ||
      item.category === 'Special';

    if (isHistoricalCategory) {
      progressVal = Math.min(item.target, Math.max(Number(existing?.progress) || 0, calculatedMetric));
    } else {
      progressVal = existing?.isUnlocked
        ? item.target
        : Math.min(item.target, calculatedMetric);
    }

    // PERMANENT: Once unlocked, remains unlocked!
    const alreadyUnlocked = Boolean(existing?.isUnlocked) || (isGeography && existingEventIds.has(achEventId));
    const metricBefore = isGeography ? item.metric({
      ...metricContext,
      citiesCount: earnedCitiesBefore,
      countriesCount: earnedCountriesBefore,
    }) : 0;
    const newlyUnlocked = isGeography
      ? calculatedMetric >= item.target && calculatedMetric > metricBefore
      : progressVal >= item.target;
    const isUnlocked = alreadyUnlocked || newlyUnlocked;
    if (isUnlocked && isGeography) progressVal = item.target;

    if (isUnlocked) {
      unlockedCount++;
      if (!existingEventIds.has(achEventId) && (!isGeography || !alreadyUnlocked)) {
        pendingXpEvents.push({
          id: achEventId,
          event: {
            id: achEventId,
            userId,
            action: 'ACHIEVEMENT_UNLOCKED',
            referenceId: item.id,
            xpEarned: item.xpReward,
            description: `Unlocked achievement: ${item.title}`,
            createdAt: existing?.unlockedAt || new Date().toISOString(),
          },
        });
      }
    }

    pendingAchievements.push({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      iconName: item.iconName,
      tier: item.tier,
      xpReward: item.xpReward,
      progress: progressVal,
      target: item.target,
      isUnlocked,
      unlockedAt: isUnlocked ? (existing?.unlockedAt || new Date().toISOString()) : null,
      updatedAt: new Date().toISOString(),
    });
  });

  // Re-verify Pioneer Voyager (Level 5) with full XP
  const newlyEarnedXp = pendingXpEvents.reduce((acc, curr) => acc + (Number(curr.event.xpEarned) || 0), 0);
  const runningTotalXp = earnedXpBefore + newlyEarnedXp;
  const prelimLevelInfo = getProgressForXp(runningTotalXp);

  const pioneer = pendingAchievements.find((a) => a.id === 'pioneer_voyager');
  if (pioneer && !pioneer.isUnlocked && prelimLevelInfo.level >= 5) {
    pioneer.isUnlocked = true;
    pioneer.progress = 5;
    pioneer.unlockedAt = new Date().toISOString();
    unlockedCount++;
    const pioneerEventId = getAchievementEventId('pioneer_voyager');
    if (!existingEventIds.has(pioneerEventId)) {
      pendingXpEvents.push({
        id: pioneerEventId,
        event: {
          id: pioneerEventId,
          userId,
          action: 'ACHIEVEMENT_UNLOCKED',
          referenceId: 'pioneer_voyager',
          xpEarned: pioneer.xpReward,
          description: `Unlocked achievement: ${pioneer.title}`,
          createdAt: new Date().toISOString(),
        },
      });
    }
  }

  // 6. Final Monotonic XP Calculation
  const totalNewXp = pendingXpEvents.reduce((acc, curr) => acc + (Number(curr.event.xpEarned) || 0), 0);
  const finalTotalXp = earnedXpBefore + totalNewXp;
  const finalLevelInfo = getProgressForXp(finalTotalXp);

  // SUMMARY DOCUMENT CONTRACT:
  // - xp, level, title, totalSpotsCount, citiesCount, countriesCount, unlockedAchievementsCount: HISTORICAL / MONOTONIC
  // - likesReceivedCount, followersCount: CURRENT / DYNAMIC
  const summary = {
    userId,
    xp: finalTotalXp,
    level: finalLevelInfo.level,
    title: finalLevelInfo.title,
    nextLevelXp: finalLevelInfo.nextLevelXp,
    currentLevelBaseXp: finalLevelInfo.currentLevelBaseXp,
    progressPercent: finalLevelInfo.progressPercent,
    totalSpotsCount: lifetimeSpotsCount,       // HISTORICAL permanent count
    citiesCount: lifetimeCitiesCount,         // HISTORICAL permanent count
    countriesCount: lifetimeCountriesCount,   // HISTORICAL permanent count
    likesReceivedCount: likesReceived,        // DYNAMIC current likes
    followersCount,                           // DYNAMIC current followers
    unlockedAchievementsCount: unlockedCount, // HISTORICAL permanent count
    totalAchievementsCount: ACHIEVEMENTS_CATALOG.length,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Read the deletion lock and profile in the same transaction as the writes.
  // A deletion lock created concurrently forces a transaction retry, preventing
  // delayed progression triggers from resurrecting the deleted account.
  const userProfileRef = db.collection('users').doc(userId);
  const receiptRef = geography ? geographyReceipt(userId, geography.pin.id) : undefined;
  let result: 'written' | 'skip' | 'recalculate';
  try {
    result = await db.runTransaction(async (transaction) => {
      const [lockSnap, profileSnap, latestSummarySnap, latestPin, receipt] = await Promise.all([
        transaction.get(deletionLockRef),
        transaction.get(userProfileRef),
        transaction.get(summaryRef),
        geography ? transaction.get(geography.pin.ref) : undefined,
        receiptRef ? transaction.get(receiptRef) : undefined,
      ]);
      if (lockSnap.exists || !profileSnap.exists) return 'skip';
      if (geography) {
        const pin = latestPin?.data();
        const original = geography.pin.data();
        if (receipt?.exists) return 'skip';
        if (!pin || !latestPin?.createTime?.isEqual(geography.pin.createTime) ||
            pin.userId !== userId || !isActivePin(pin) ||
            pin.latitude !== original.latitude || pin.longitude !== original.longitude) {
          return 'recalculate';
        }
      }

      // The XP ledger and summary were calculated outside the transaction.
      // If another trigger committed a progression update in the meantime,
      // abort and recalculate from the fresh ledger rather than overwrite it.
      const expectedVersion = summarySnap.updateTime;
      const currentVersion = latestSummarySnap.updateTime;
      if (expectedVersion ? !currentVersion?.isEqual(expectedVersion) : currentVersion) {
        throw new Error('PROGRESSION_STALE_SNAPSHOT');
      }

      transaction.set(summaryRef, summary, { merge: true });
      transaction.update(userProfileRef, {
        pinsCount: activeSpotsCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const achievement of pendingAchievements) {
        transaction.set(achievementsCol.doc(achievement.id), achievement, { merge: true });
      }
      for (const { id, event } of pendingXpEvents) {
        transaction.create(xpEventsCol.doc(id), event);
      }
      if (receiptRef) transaction.create(receiptRef, { verifiedAt: FieldValue.serverTimestamp() });
      return 'written';
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PROGRESSION_STALE_SNAPSHOT' && concurrencyRetry < 5) {
      return syncUserProgression(userId, geography, concurrencyRetry + 1);
    }
    throw error;
  }
  if (result === 'recalculate') return syncUserProgression(userId);
  if (result === 'skip') return null;
  console.log(`[Progression Server] Authoritatively synchronized user ${userId}: Level ${finalLevelInfo.level} (${finalLevelInfo.title}), ${finalTotalXp} XP, ${unlockedCount} achievements.`);
  return summary;
}

/**
 * Helper to safely extract a Cloud Storage object path from a Firebase Storage download URL.
 */
function extractStoragePathFromUrl(url: string, expectedPrefix: string): string | null {
  try {
    if (!url || typeof url !== 'string') return null;
    if (url.includes('/o/')) {
      const parts = url.split('/o/');
      if (parts.length < 2) return null;
      const pathWithParams = parts[1];
      const encodedPath = pathWithParams.split('?')[0];
      const decodedPath = decodeURIComponent(encodedPath);
      if (decodedPath.startsWith(expectedPrefix)) {
        return decodedPath;
      }
    }
  } catch (err) {
    console.warn('Failed to parse storage path from url:', url, err);
  }
  return null;
}

// ============================================================================
// 1. PIN LIKE COUNTER (Server-Side Trigger - Idempotent Canonical Count)
// ============================================================================

export const onPinLikeCreated = onDocumentCreated(
  {
    document: 'pins/{pinId}/likes/{userId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);

    try {
      // Authoritative, idempotent count of existing like documents
      const likesCountSnap = await pinRef.collection('likes').count().get();
      const canonicalCount = likesCountSnap.data().count;

      let authorId: string | null = null;
      await db.runTransaction(async (transaction) => {
        const pinDoc = await transaction.get(pinRef);
        if (!pinDoc.exists) return;
        authorId = pinDoc.data()?.userId || null;
        transaction.update(pinRef, {
          likeCount: canonicalCount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      console.log(`Successfully synchronized likeCount to ${canonicalCount} for pin ${pinId}`);
      if (authorId) {
        await updateUserProgressionServer(authorId);
      }
    } catch (err) {
      console.error(`Error synchronizing likeCount for pin ${pinId}:`, err);
      throw err;
    }
  }
);

export const onPinLikeDeleted = onDocumentDeleted(
  {
    document: 'pins/{pinId}/likes/{userId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);

    try {
      // Authoritative, idempotent count of existing like documents
      const likesCountSnap = await pinRef.collection('likes').count().get();
      const canonicalCount = likesCountSnap.data().count;

      let authorId: string | null = null;
      await db.runTransaction(async (transaction) => {
        const pinDoc = await transaction.get(pinRef);
        if (!pinDoc.exists) return;
        authorId = pinDoc.data()?.userId || null;
        transaction.update(pinRef, {
          likeCount: canonicalCount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      console.log(`Successfully synchronized likeCount to ${canonicalCount} for pin ${pinId}`);
      if (authorId) {
        await updateUserProgressionServer(authorId);
      }
    } catch (err) {
      console.error(`Error synchronizing likeCount for pin ${pinId}:`, err);
      throw err;
    }
  }
);

// ============================================================================
// 2. PIN COMMENT COUNTER (Server-Side Trigger - Idempotent Canonical Count)
// ============================================================================

export const onPinCommentCreated = onDocumentCreated(
  {
    document: 'pins/{pinId}/comments/{commentId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);

    try {
      // Authoritative, idempotent count of existing comment documents
      const commentsCountSnap = await pinRef.collection('comments').count().get();
      const canonicalCount = commentsCountSnap.data().count;

      await db.runTransaction(async (transaction) => {
        const pinDoc = await transaction.get(pinRef);
        if (!pinDoc.exists) return;
        transaction.update(pinRef, {
          commentCount: canonicalCount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      console.log(`Successfully synchronized commentCount to ${canonicalCount} for pin ${pinId}`);
    } catch (err) {
      console.error(`Error synchronizing commentCount for pin ${pinId}:`, err);
      throw err;
    }
  }
);

export const onPinCommentDeleted = onDocumentDeleted(
  {
    document: 'pins/{pinId}/comments/{commentId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);

    try {
      // Authoritative, idempotent count of existing comment documents
      const commentsCountSnap = await pinRef.collection('comments').count().get();
      const canonicalCount = commentsCountSnap.data().count;

      await db.runTransaction(async (transaction) => {
        const pinDoc = await transaction.get(pinRef);
        if (!pinDoc.exists) return;
        transaction.update(pinRef, {
          commentCount: canonicalCount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      console.log(`Successfully synchronized commentCount to ${canonicalCount} for pin ${pinId}`);
    } catch (err) {
      console.error(`Error synchronizing commentCount for pin ${pinId}:`, err);
      throw err;
    }
  }
);

// ============================================================================
// 3. FOLLOWER / FOLLOWING COUNTERS (Server-Side Trigger)
// ============================================================================

export const onUserFollowerCreated = onDocumentCreated(
  {
    document: 'users/{targetUserId}/followers/{followerId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const { targetUserId, followerId } = event.params;
    if (targetUserId === followerId) return;

    const targetUserRef = db.collection('users').doc(targetUserId);
    const followerRef = db.collection('users').doc(followerId);

    try {
      await db.runTransaction(async (transaction) => {
        const [targetDoc, followerDoc] = await Promise.all([
          transaction.get(targetUserRef),
          transaction.get(followerRef),
        ]);

        if (targetDoc.exists) {
          const prev = Number(targetDoc.data()?.followersCount) || 0;
          transaction.update(targetUserRef, {
            followersCount: prev + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        if (followerDoc.exists) {
          const prev = Number(followerDoc.data()?.followingCount) || 0;
          transaction.update(followerRef, {
            followingCount: prev + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      console.log(`Successfully updated follow counters for ${targetUserId}`);
      await updateUserProgressionServer(targetUserId);
    } catch (err) {
      console.error(`Error updating follow counters on create:`, err);
      throw err;
    }
  }
);

export const onUserFollowerDeleted = onDocumentDeleted(
  {
    document: 'users/{targetUserId}/followers/{followerId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const { targetUserId, followerId } = event.params;
    if (targetUserId === followerId) return;

    const targetUserRef = db.collection('users').doc(targetUserId);
    const followerRef = db.collection('users').doc(followerId);

    try {
      await db.runTransaction(async (transaction) => {
        const [targetDoc, followerDoc] = await Promise.all([
          transaction.get(targetUserRef),
          transaction.get(followerRef),
        ]);

        if (targetDoc.exists) {
          const prev = Number(targetDoc.data()?.followersCount) || 0;
          transaction.update(targetUserRef, {
            followersCount: Math.max(0, prev - 1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        if (followerDoc.exists) {
          const prev = Number(followerDoc.data()?.followingCount) || 0;
          transaction.update(followerRef, {
            followingCount: Math.max(0, prev - 1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      console.log(`Successfully decremented follow counters for ${targetUserId}`);
      await updateUserProgressionServer(targetUserId);
    } catch (err) {
      console.error(`Error updating follow counters on delete:`, err);
      throw err;
    }
  }
);

// ============================================================================
// 4. CASCADE DELETION ON PIN REMOVAL
// ============================================================================

export const onPinDeleted = onDocumentDeleted(
  {
    document: 'pins/{pinId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const pinId = event.params.pinId;
    const pinData = event.data?.data();
    console.log(`Pin deleted: ${pinId}. Processing cleanup.`);

    try {
      const pinRef = db.collection('pins').doc(pinId);
      const likesSnap = await pinRef.collection('likes').get();
      for (const doc of likesSnap.docs) {
        await doc.ref.delete();
      }

      const commentsSnap = await pinRef.collection('comments').get();
      for (const doc of commentsSnap.docs) {
        await doc.ref.delete();
      }

      if (pinData?.imageUrls && Array.isArray(pinData.imageUrls)) {
        for (const url of pinData.imageUrls) {
          const storagePath = pinData?.userId
            ? extractStoragePathFromUrl(url, `pins/${pinData.userId}/`)
            : null;
          if (storagePath) {
            try {
              await storage.bucket().file(storagePath).delete();
            } catch (fileErr) {
              console.warn(`Could not delete storage file ${storagePath}:`, fileErr);
            }
          }
        }
      }

      // Synchronize progression for author (preserving permanent milestones)
      if (pinData?.userId) {
        await updateUserProgressionServer(pinData.userId);
      }
    } catch (err) {
      console.error(`Error in onPinDeleted cleanup for ${pinId}:`, err);
    }
  }
);

// ============================================================================
// 5. EXPLORER PROGRESSION TRIGGERS
// ============================================================================

export async function processPinCreationProgression(
  pin: FirebaseFirestore.QueryDocumentSnapshot,
  startAt = Infinity,
  resolve?: (latitude: number, longitude: number) => Promise<ResolvedGeography | null>,
) {
  const data = pin.data();
  const { userId, latitude, longitude } = data;
  if (typeof userId !== 'string' || !userId || userId.startsWith('system_') || userId.startsWith('demo_')) return;

  const createdAt = pin.createTime.toMillis();
  if (!resolve || !Number.isFinite(startAt) || createdAt < startAt || Date.now() < startAt ||
      Date.now() - createdAt >= GEOGRAPHY_RETRY_WINDOW_MS || !isActivePin(data) ||
      !discoveryLocationKey(latitude, longitude)) {
    await updateUserProgressionServer(userId);
    return;
  }

  const current = await pin.ref.get();
  const currentData = current.data();
  if (!currentData || !current.createTime?.isEqual(pin.createTime) ||
      !isActivePin(currentData) || currentData.userId !== userId ||
      currentData.latitude !== latitude || currentData.longitude !== longitude) {
    await updateUserProgressionServer(userId);
    return;
  }
  const [receipt, profile, deletionLock] = await Promise.all([
    geographyReceipt(userId, pin.id).get(),
    db.collection('users').doc(userId).get(),
    db.collection('accountDeletionLocks').doc(userId).get(),
  ]);
  if (receipt.exists || !profile.exists || deletionLock.exists) return;

  let location: ResolvedGeography | null;
  try {
    location = await resolve(latitude, longitude);
  } catch (error) {
    // Keep ordinary discovery XP available while the event is retried.
    await updateUserProgressionServer(userId);
    throw error;
  }
  await syncUserProgression(userId, { pin, location });
}

export const onPinCreatedProgression = onDocumentCreated(
  {
    document: 'pins/{pinId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
    retry: true,
  },
  async (event) => {
    if (!event.data) return;
    // Geographic awards stay paused until a provider is approved for durable XP.
    await processPinCreationProgression(event.data);
  }
);

export const onUserProfileUpdatedProgression = onDocumentUpdated(
  {
    document: 'users/{userId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const userId = event.params.userId;
    if (!userId || userId.startsWith('system_') || userId.startsWith('demo_')) return;

    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    // Check if bio or avatar changed
    const bioChanged = before?.bio !== after?.bio;
    const avatarChanged = (before?.avatarUrl || before?.photoURL) !== (after?.avatarUrl || after?.photoURL);

    if (bioChanged || avatarChanged) {
      console.log(`[Progression Trigger] Profile info updated for ${userId}. Recalculating progression.`);
      try {
        await updateUserProgressionServer(userId);
      } catch (err) {
        console.error(`[Progression Trigger] Error updating progression on profile update:`, err);
      }
    }
  }
);

// ============================================================================
// 6. CALLABLE FUNCTION: RECALCULATE PROGRESSION
// ============================================================================

export const recalculateProgression = onCall(
  {
    region: FUNCTION_REGION,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }

    const callerUid = request.auth.uid;
    const targetUserId = request.data?.userId || callerUid;

    // Only allow caller to recalculate their own or admin
    if (targetUserId !== callerUid && !request.auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Cannot recalculate progression for another user.');
    }

    try {
      const summary = await updateUserProgressionServer(targetUserId);
      return { success: true, summary };
    } catch (err: any) {
      console.error(`Failed to recalculate progression for ${targetUserId}:`, err);
      throw new HttpsError('internal', err.message || 'Failed to recalculate progression.');
    }
  }
);

// ============================================================================
// 7. ACCOUNT DELETION
// ============================================================================

async function forEachAccountDeletionPage(
  query: FirebaseFirestore.Query,
  handlePage: (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => Promise<void>,
) {
  const ordered = query.orderBy('__name__').limit(200);
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  do {
    const page = await (cursor ? ordered.startAfter(cursor) : ordered).get();
    if (page.empty) return;
    await handlePage(page.docs);
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 200) return;
  } while (cursor);
}

export async function cleanAccountReports(userId: string) {
  const reports = db.collection('reports');
  await forEachAccountDeletionPage(reports.where('reporterId', '==', userId), async docs => {
    await db.runTransaction(async transaction => {
      const currentReports = await transaction.getAll(...docs.map(report => report.ref));
      for (const report of currentReports) {
        if (report.get('reporterId') !== userId ||
            (report.get('reporterEmail') === undefined && report.get('reporterDeletedAt'))) continue;
        transaction.update(report.ref, {
          reporterEmail: FieldValue.delete(),
          reporterDeletedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  });
  await forEachAccountDeletionPage(reports.where('targetId', '==', userId), async docs => {
    await db.runTransaction(async transaction => {
      const currentReports = await transaction.getAll(...docs.map(report => report.ref));
      for (const current of currentReports) {
        if (current.get('targetId') !== userId || current.get('targetType') !== 'user' ||
            current.get('status') !== 'pending') continue;
        transaction.update(current.ref, {
          status: 'resolved',
          resolvedReason: 'target_account_deleted',
          resolvedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  });
}

export const deleteUserAccount = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }

    const userId = request.auth.uid;

    // Strict ownership enforcement: reject any attempt to target another user's UID
    const requestedTargetUid =
      request.data && typeof request.data === 'object' && 'userId' in request.data
        ? (request.data as { userId?: unknown }).userId
        : undefined;
    if (typeof requestedTargetUid === 'string' && requestedTargetUid.trim() !== '' && requestedTargetUid !== userId) {
      throw new HttpsError('permission-denied', 'You can only delete your own authenticated account.');
    }

    // Require recent authentication (within 5 minutes / 300 seconds) before destructive deletion
    const authTimeSec = Number(request.auth.token?.auth_time || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const MAX_RECENT_AUTH_AGE_SEC = 300;
    if (!authTimeSec || nowSec - authTimeSec > MAX_RECENT_AUTH_AGE_SEC) {
      throw new HttpsError(
        'failed-precondition',
        'RECENT_LOGIN_REQUIRED: Please reauthenticate before deleting your account.'
      );
    }

    console.log(`Starting account deletion for user: ${userId}`);

    try {
      // Persist a server-owned deletion lock before any destructive operation.
      // Firestore rules deny new client content and profile recreation while it exists.
      await db.collection('accountDeletionLocks').doc(userId).set({
        status: 'deleting',
        startedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Remove the account's reactions and comments on other users' pins before
      // revoking its Auth identity. Only documents whose userId matches are deleted.
      // This intentionally preserves likes/comments authored by other users.
      for (const collectionName of ['likes', 'comments'] as const) {
        while (true) {
          const authored = await db.collectionGroup(collectionName)
            .where('userId', '==', userId).limit(200).get();
          if (authored.empty) break;
          const batch = db.batch();
          authored.docs.forEach((entry) => batch.delete(entry.ref));
          await batch.commit();
        }
      }

      // Legacy likes may have no userId field. Their document ID is the author's
      // Firebase UID, so a collection-group userId query cannot discover them.
      // Scan pin IDs in bounded pages and inspect only the departing user's like.
      let lastScannedPin: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      while (true) {
        let pinsPageQuery: FirebaseFirestore.Query = db.collection('pins').orderBy('__name__').limit(200);
        if (lastScannedPin) pinsPageQuery = pinsPageQuery.startAfter(lastScannedPin);
        const pinsPage = await pinsPageQuery.get();
        if (pinsPage.empty) break;
        const likeRefs = pinsPage.docs.map((pin) => pin.ref.collection('likes').doc(userId));
        const likeDocs = await db.getAll(...likeRefs);
        const batch = db.batch();
        let deleteCount = 0;
        for (const like of likeDocs) {
          if (like.exists && (!like.data()?.userId || like.data()?.userId === userId)) {
            batch.delete(like.ref);
            deleteCount++;
          }
        }
        if (deleteCount) await batch.commit();
        lastScannedPin = pinsPage.docs[pinsPage.docs.length - 1];
      }

      // Remove both sides of each follow relationship. The user's own
      // subcollections are the authoritative source for the mirror document IDs.
      const departingUserRef = db.collection('users').doc(userId);
      for (const relationship of ['following', 'followers'] as const) {
        while (true) {
          const relationships = await departingUserRef.collection(relationship).limit(200).get();
          if (relationships.empty) break;
          const batch = db.batch();
          for (const entry of relationships.docs) {
            const otherUserId = entry.id;
            const counterpart = relationship === 'following'
              ? db.collection('users').doc(otherUserId).collection('followers').doc(userId)
              : db.collection('users').doc(otherUserId).collection('following').doc(userId);
            batch.delete(counterpart);
            batch.delete(entry.ref);
          }
          await batch.commit();
        }
      }

      await cleanAccountReports(userId);

      const userPins = db.collection('pins').where('userId', '==', userId);
      await forEachAccountDeletionPage(userPins, async pins => {
        for (const pin of pins) await db.recursiveDelete(pin.ref);
      });

      // Avatar cleanup must succeed before reporting account deletion complete.
      // The caller can retry on transient Storage errors.
      await storage.bucket().deleteFiles({
        prefix: `profile-images/${userId}/`,
      });

      // Remove the user's remaining pin images, including uploads not attached to a pin.
      // A missing bucket or transient Storage error must not silently be reported as success.
      await storage.bucket().deleteFiles({ prefix: `pins/${userId}/` });

      const userRef = db.collection('users').doc(userId);
      await db.recursiveDelete(userRef);

      // Revoke access last, after the primary data cleanup has succeeded.
      // This operation is idempotent for a retried deletion request.
      try {
        await getAuth().deleteUser(userId);
      } catch (authErr: any) {
        if (authErr?.code !== 'auth/user-not-found') throw authErr;
      }

      await db.collection('accountDeletionLocks').doc(userId).set(
        {
          status: 'deleted',
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { success: true, message: `Account and associated data deleted for user ${userId}` };
    } catch (err: any) {
      if (err instanceof HttpsError) {
        throw err;
      }
      console.error(`Failed to delete account for user ${userId}:`, err);
      throw new HttpsError('internal', err.message || 'Failed to complete account deletion.');
    }
  }
);
