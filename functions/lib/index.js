"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserAccount = exports.recalculateProgression = exports.onUserProfileUpdatedProgression = exports.onPinCreatedProgression = exports.onPinDeleted = exports.reconcilePinImageCleanup = exports.onUserFollowerDeleted = exports.onUserFollowerCreated = exports.onPinCommentDeleted = exports.onPinCommentCreated = exports.onPinLikeDeleted = exports.onPinLikeCreated = exports.pinImageUpload = exports.FUNCTION_REGION = exports.FIRESTORE_DATABASE_ID = void 0;
exports.updateUserProgressionServer = updateUserProgressionServer;
exports.cleanAccountReports = cleanAccountReports;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const auth_1 = require("firebase-admin/auth");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const pinImageCleanup_1 = require("./pinImageCleanup");
const pinImageUpload_1 = require("./pinImageUpload");
const progressionLocation_1 = require("./progressionLocation");
const progressionConfig_1 = require("./progressionConfig");
// Initialize Firebase Admin SDK
(0, app_1.initializeApp)();
exports.FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
const db = (0, firestore_1.getFirestore)(exports.FIRESTORE_DATABASE_ID);
const storage = (0, storage_1.getStorage)();
exports.FUNCTION_REGION = 'europe-west2';
exports.pinImageUpload = (0, https_1.onCall)({ region: exports.FUNCTION_REGION, timeoutSeconds: 60, memory: '512MiB', concurrency: 2, maxInstances: 8 }, request => (0, pinImageUpload_1.handlePinImageUpload)(db, () => storage.bucket(), request.auth, request.data));
function isActivePin(data) {
    return !data.isDeleted && data.status !== 'reported' && data.status !== 'removed';
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
async function updateUserProgressionServer(userId) {
    return syncUserProgression(userId);
}
async function syncUserProgression(userId, concurrencyRetry = 0) {
    if (!userId || userId.startsWith('system_') || userId.startsWith('demo_'))
        return null;
    // Do not rebuild deleted users' profiles when delayed Firestore triggers arrive.
    const deletionLockRef = db.collection('accountDeletionLocks').doc(userId);
    if ((await deletionLockRef.get()).exists)
        return null;
    if (!(await db.collection('users').doc(userId).get()).exists)
        return null;
    // Establish the version before reading the metrics it protects.
    const summaryRef = db.collection('users').doc(userId).collection('progression').doc('summary');
    const summarySnap = await summaryRef.get();
    const existingSummary = summarySnap.exists ? summarySnap.data() : null;
    // 1. Fetch user's active pins (excluding deleted or reported)
    const pinsSnap = await db.collection('pins').where('userId', '==', userId).get();
    const validPins = [];
    pinsSnap.forEach((doc) => {
        const data = doc.data();
        if (isActivePin(data)) {
            const tags = Array.isArray(data.tags)
                ? data.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
                : [];
            validPins.push({ ...data, id: doc.id, tags });
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
        const cat = typeof pin.category === 'string' ? pin.category.toLowerCase() : '';
        if (cat.includes('hidden') || cat.includes('gem'))
            hiddenGemsCount++;
        if (cat.includes('food'))
            foodCount++;
        if (cat.includes('nature'))
            natureCount++;
        if (cat.includes('photo') || pin.tags.some((tag) => tag.toLowerCase().includes('photo'))) {
            photoSpotsCount++;
        }
        const hasLongDesc = typeof pin.description === 'string' && pin.description.trim().length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
        const hasTags = pin.tags.length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
        if (hasLongDesc && hasTags)
            richSpotsCount++;
    });
    // Profile completeness (avatar, bio >= 10 chars, at least 1 spot)
    let profileCompletePoints = 0;
    if (userData?.avatarUrl || userData?.photoURL)
        profileCompletePoints++;
    if (typeof userData?.bio === 'string' && userData.bio.trim().length >= 10)
        profileCompletePoints++;
    const xpEventsCol = db.collection('users').doc(userId).collection('xpEvents');
    const existingEventsSnap = await xpEventsCol.get();
    const existingEventIds = new Set();
    let historicalLedgerXp = 0;
    let historicalSpotsCount = 0;
    const historicalCitiesSet = new Set();
    const historicalCountriesSet = new Set();
    existingEventsSnap.forEach((doc) => {
        existingEventIds.add(doc.id);
        const data = doc.data();
        historicalLedgerXp += Number(data?.xpEarned) || 0;
        if (doc.id.startsWith('pin_created:')) {
            historicalSpotsCount++;
        }
        else if (doc.id.startsWith('city_first:')) {
            const cityRef = (data?.referenceId || doc.id.replace('city_first:', '')).toLowerCase().trim();
            historicalCitiesSet.add(cityRef);
        }
        else if (doc.id.startsWith('country_first:')) {
            const countryRef = (data?.referenceId || doc.id.replace('country_first:', '')).toUpperCase().trim();
            historicalCountriesSet.add(countryRef);
        }
    });
    const pendingXpEvents = [];
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
        const firstDiscId = (0, progressionConfig_1.getFirstDiscoveryEventId)();
        if (!existingEventIds.has(firstDiscId)) {
            pendingXpEvents.push({
                id: firstDiscId,
                event: {
                    id: firstDiscId,
                    userId,
                    action: 'FIRST_DISCOVERY',
                    referenceId: validPins[0]?.id || 'first_spot',
                    xpEarned: progressionConfig_1.PROGRESSION_CONSTANTS.FIRST_DISCOVERY_BONUS_XP,
                    description: 'First discovery bonus unlocked',
                    createdAt: new Date().toISOString(),
                },
            });
        }
    }
    // Award discovery XP once per physical location, even after a pin is deleted.
    // Quantize to roughly 100m cells to prevent trivial coordinate jitter farming.
    // Existing ledger entries without a fingerprint are preserved unchanged.
    const earnedLocationKeys = new Set();
    existingEventsSnap.forEach((doc) => {
        if (doc.data()?.action === 'PIN_CREATED' && typeof doc.data()?.locationKey === 'string') {
            earnedLocationKeys.add(doc.data().locationKey);
        }
    });
    const eligibleIds = new Set((0, progressionLocation_1.eligibleDiscoveryIds)(validPins, earnedLocationKeys));
    validPins.forEach((pin) => {
        if (!eligibleIds.has(pin.id))
            return;
        const locationKey = (0, progressionLocation_1.discoveryLocationKey)(pin.latitude, pin.longitude);
        if (!locationKey)
            return;
        const eventId = (0, progressionConfig_1.getPinCreatedEventId)(pin.id);
        if (!existingEventIds.has(eventId)) {
            pendingXpEvents.push({
                id: eventId,
                event: {
                    id: eventId,
                    userId,
                    action: 'PIN_CREATED',
                    referenceId: pin.id,
                    locationKey,
                    xpEarned: progressionConfig_1.PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP,
                    description: `Discovered: ${pin.title || 'Spot'}`,
                    createdAt: pin.createdAt || new Date().toISOString(),
                },
            });
        }
    });
    // Rich spot bonus (+25 XP each)
    validPins.forEach((pin) => {
        const hasLongDesc = typeof pin.description === 'string' && pin.description.trim().length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
        const hasTags = pin.tags.length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
        if (hasLongDesc && hasTags) {
            const eventId = (0, progressionConfig_1.getRichDiscoveryEventId)(pin.id);
            if (!existingEventIds.has(eventId)) {
                pendingXpEvents.push({
                    id: eventId,
                    event: {
                        id: eventId,
                        userId,
                        action: 'RICH_DISCOVERY',
                        referenceId: pin.id,
                        xpEarned: progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP,
                        description: `Detailed guide bonus for: ${pin.title || 'Spot'}`,
                        createdAt: pin.createdAt || new Date().toISOString(),
                    },
                });
            }
        }
    });
    // Like Milestones (Permanent milestones - earned once reached, never revoked even if likes decrease)
    progressionConfig_1.LIKE_MILESTONES.forEach((m) => {
        const eventId = (0, progressionConfig_1.getLikeMilestoneEventId)(m.count);
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
    progressionConfig_1.FOLLOWER_MILESTONES.forEach((m) => {
        const eventId = (0, progressionConfig_1.getFollowerMilestoneEventId)(m.count);
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
    const existingMap = new Map();
    existingAchSnap.forEach((d) => existingMap.set(d.id, d.data()));
    // Some historical summaries contain earned XP that predates the ledger.
    const earnedXpBefore = Math.max(Number(existingSummary?.xp) || 0, historicalLedgerXp);
    const prelimLevel = (0, progressionConfig_1.getProgressForXp)(earnedXpBefore).level;
    const metricContext = {
        totalSpots: lifetimeSpotsCount, // Historical lifetime spots
        citiesCount: lifetimeCitiesCount, // Historical lifetime cities
        countriesCount: lifetimeCountriesCount, // Historical lifetime countries
        likesReceived, // Dynamic live likes
        followersCount, // Dynamic live followers
        hiddenGemsCount,
        foodCount,
        natureCount,
        photoSpotsCount,
        profileCompletePoints,
        level: prelimLevel,
    };
    let unlockedCount = 0;
    const pendingAchievements = [];
    progressionConfig_1.ACHIEVEMENTS_CATALOG.forEach((item) => {
        const existing = existingMap.get(item.id);
        const achEventId = (0, progressionConfig_1.getAchievementEventId)(item.id);
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
        let progressVal;
        const isHistoricalCategory = item.category === 'Exploration' ||
            item.category === 'Geography' ||
            item.category === 'Discovery' ||
            item.category === 'Special';
        if (isHistoricalCategory) {
            progressVal = Math.min(item.target, Math.max(Number(existing?.progress) || 0, calculatedMetric));
        }
        else {
            progressVal = existing?.isUnlocked
                ? item.target
                : Math.min(item.target, calculatedMetric);
        }
        // PERMANENT: Once unlocked, remains unlocked!
        const alreadyUnlocked = Boolean(existing?.isUnlocked) || (isGeography && existingEventIds.has(achEventId));
        const isUnlocked = alreadyUnlocked || (!isGeography && progressVal >= item.target);
        if (isUnlocked && isGeography)
            progressVal = item.target;
        if (isUnlocked) {
            unlockedCount++;
            if (!existingEventIds.has(achEventId) && !isGeography) {
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
    const prelimLevelInfo = (0, progressionConfig_1.getProgressForXp)(runningTotalXp);
    const pioneer = pendingAchievements.find((a) => a.id === 'pioneer_voyager');
    if (pioneer && !pioneer.isUnlocked && prelimLevelInfo.level >= 5) {
        pioneer.isUnlocked = true;
        pioneer.progress = 5;
        pioneer.unlockedAt = new Date().toISOString();
        unlockedCount++;
        const pioneerEventId = (0, progressionConfig_1.getAchievementEventId)('pioneer_voyager');
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
    const finalLevelInfo = (0, progressionConfig_1.getProgressForXp)(finalTotalXp);
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
        totalSpotsCount: lifetimeSpotsCount, // HISTORICAL permanent count
        citiesCount: lifetimeCitiesCount, // HISTORICAL permanent count
        countriesCount: lifetimeCountriesCount, // HISTORICAL permanent count
        likesReceivedCount: likesReceived, // DYNAMIC current likes
        followersCount, // DYNAMIC current followers
        unlockedAchievementsCount: unlockedCount, // HISTORICAL permanent count
        totalAchievementsCount: progressionConfig_1.ACHIEVEMENTS_CATALOG.length,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    // Read the deletion lock and profile in the same transaction as the writes.
    // A deletion lock created concurrently forces a transaction retry, preventing
    // delayed progression triggers from resurrecting the deleted account.
    const userProfileRef = db.collection('users').doc(userId);
    let result;
    try {
        result = await db.runTransaction(async (transaction) => {
            const [lockSnap, profileSnap, latestSummarySnap] = await transaction.getAll(deletionLockRef, userProfileRef, summaryRef);
            if (lockSnap.exists || !profileSnap.exists)
                return 'skip';
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
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            for (const achievement of pendingAchievements) {
                transaction.set(achievementsCol.doc(achievement.id), achievement, { merge: true });
            }
            for (const { id, event } of pendingXpEvents) {
                transaction.create(xpEventsCol.doc(id), event);
            }
            return 'written';
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'PROGRESSION_STALE_SNAPSHOT' && concurrencyRetry < 5) {
            return syncUserProgression(userId, concurrencyRetry + 1);
        }
        throw error;
    }
    if (result === 'skip')
        return null;
    console.log(`[Progression Server] Authoritatively synchronized user ${userId}: Level ${finalLevelInfo.level} (${finalLevelInfo.title}), ${finalTotalXp} XP, ${unlockedCount} achievements.`);
    return summary;
}
// ============================================================================
// 1–3. SOCIAL COUNTERS
// ============================================================================
async function syncPinCounter(pinId, collection) {
    const pinRef = db.collection('pins').doc(pinId);
    const field = collection === 'likes' ? 'likeCount' : 'commentCount';
    const authorId = await db.runTransaction(async (transaction) => {
        const pin = await transaction.get(pinRef);
        if (!pin.exists)
            return;
        const count = await transaction.get(pinRef.collection(collection).count());
        const canonicalCount = count.data().count;
        if (pin.get(field) !== canonicalCount) {
            transaction.update(pinRef, { [field]: canonicalCount, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        return pin.get('userId');
    });
    if (collection === 'likes' && typeof authorId === 'string' && authorId) {
        await updateUserProgressionServer(authorId);
    }
}
const likesTrigger = {
    document: 'pins/{pinId}/likes/{userId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
    retry: true,
};
exports.onPinLikeCreated = (0, firestore_2.onDocumentCreated)(likesTrigger, event => syncPinCounter(event.params.pinId, 'likes'));
exports.onPinLikeDeleted = (0, firestore_2.onDocumentDeleted)(likesTrigger, event => syncPinCounter(event.params.pinId, 'likes'));
const commentsTrigger = {
    document: 'pins/{pinId}/comments/{commentId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
    retry: true,
};
exports.onPinCommentCreated = (0, firestore_2.onDocumentCreated)(commentsTrigger, event => syncPinCounter(event.params.pinId, 'comments'));
exports.onPinCommentDeleted = (0, firestore_2.onDocumentDeleted)(commentsTrigger, event => syncPinCounter(event.params.pinId, 'comments'));
async function syncFollowCounters(targetUserId, followerId) {
    if (targetUserId === followerId)
        return;
    const targetRef = db.collection('users').doc(targetUserId);
    const followerRef = db.collection('users').doc(followerId);
    await db.runTransaction(async (transaction) => {
        const [target, follower] = await transaction.getAll(targetRef, followerRef);
        const [followers, following] = await Promise.all([
            target.exists ? transaction.get(targetRef.collection('followers').count()) : undefined,
            follower.exists ? transaction.get(followerRef.collection('following').count()) : undefined,
        ]);
        if (followers && target.get('followersCount') !== followers.data().count) {
            transaction.update(targetRef, { followersCount: followers.data().count, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        if (following && follower.get('followingCount') !== following.data().count) {
            transaction.update(followerRef, { followingCount: following.data().count, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
    });
    await updateUserProgressionServer(targetUserId);
}
const followersTrigger = {
    document: 'users/{targetUserId}/followers/{followerId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
    retry: true,
};
exports.onUserFollowerCreated = (0, firestore_2.onDocumentCreated)(followersTrigger, event => syncFollowCounters(event.params.targetUserId, event.params.followerId));
exports.onUserFollowerDeleted = (0, firestore_2.onDocumentDeleted)(followersTrigger, event => syncFollowCounters(event.params.targetUserId, event.params.followerId));
// ============================================================================
// 4. CASCADE DELETION ON PIN REMOVAL
// ============================================================================
exports.reconcilePinImageCleanup = (0, scheduler_1.onSchedule)({ schedule: 'every 5 minutes', timeZone: 'UTC', region: exports.FUNCTION_REGION, maxInstances: 1 }, async () => (0, pinImageCleanup_1.reconcilePinImages)(db, () => storage.bucket()));
exports.onPinDeleted = (0, firestore_2.onDocumentDeleted)({
    document: 'pins/{pinId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const pinId = event.params.pinId;
    const deletedPin = event.data;
    const authorId = deletedPin?.data()?.userId;
    const pinRef = db.collection('pins').doc(pinId);
    const createdAt = deletedPin?.createTime;
    const lastUpdatedAt = deletedPin?.updateTime;
    const cleanup = async () => {
        if (!createdAt || !lastUpdatedAt)
            return;
        for (const name of ['likes', 'comments']) {
            const children = await pinRef.collection(name).get();
            for (let offset = 0; offset < children.docs.length; offset += 200) {
                const group = children.docs.slice(offset, offset + 200);
                const recreated = await db.runTransaction(async (transaction) => {
                    if ((await transaction.get(pinRef)).exists)
                        return true;
                    const current = await transaction.getAll(...group.map(child => child.ref));
                    for (const child of current) {
                        // Keep writes outside the deleted snapshot's proven lifetime.
                        if (child.createTime && child.updateTime &&
                            child.createTime.valueOf() >= createdAt.valueOf() &&
                            child.updateTime.valueOf() <= lastUpdatedAt.valueOf()) {
                            transaction.delete(child.ref);
                        }
                    }
                    return false;
                });
                if (recreated)
                    return;
            }
        }
    };
    const results = await Promise.allSettled([
        cleanup(),
        deletedPin ? (0, pinImageCleanup_1.cleanupPinImages)(db, () => storage.bucket(), deletedPin, event.id) : Promise.resolve(),
        typeof authorId === 'string' ? updateUserProgressionServer(authorId) : Promise.resolve(),
    ]);
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length)
        throw new AggregateError(failures, 'Pin deletion processing failed for ' + pinId);
});
// ============================================================================
// 5. EXPLORER PROGRESSION TRIGGERS
// ============================================================================
exports.onPinCreatedProgression = (0, firestore_2.onDocumentCreated)({
    document: 'pins/{pinId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
    retry: true,
}, async (event) => {
    const userId = event.data?.get('userId');
    if (typeof userId === 'string')
        await updateUserProgressionServer(userId);
});
exports.onUserProfileUpdatedProgression = (0, firestore_2.onDocumentUpdated)({
    document: 'users/{userId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const userId = event.params.userId;
    if (!userId || userId.startsWith('system_') || userId.startsWith('demo_'))
        return;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after)
        return;
    // Check if bio or avatar changed
    const bioChanged = before?.bio !== after?.bio;
    const avatarChanged = (before?.avatarUrl || before?.photoURL) !== (after?.avatarUrl || after?.photoURL);
    if (bioChanged || avatarChanged) {
        console.log(`[Progression Trigger] Profile info updated for ${userId}. Recalculating progression.`);
        try {
            await updateUserProgressionServer(userId);
        }
        catch (err) {
            console.error(`[Progression Trigger] Error updating progression on profile update:`, err);
        }
    }
});
// ============================================================================
// 6. CALLABLE FUNCTION: RECALCULATE PROGRESSION
// ============================================================================
exports.recalculateProgression = (0, https_1.onCall)({
    region: exports.FUNCTION_REGION,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be signed in.');
    }
    const callerUid = request.auth.uid;
    const targetUserId = request.data?.userId || callerUid;
    // Only allow caller to recalculate their own or admin
    if (targetUserId !== callerUid && !request.auth.token?.admin) {
        throw new https_1.HttpsError('permission-denied', 'Cannot recalculate progression for another user.');
    }
    try {
        const summary = await updateUserProgressionServer(targetUserId);
        return { success: true, summary };
    }
    catch (err) {
        console.error(`Failed to recalculate progression for ${targetUserId}:`, err);
        throw new https_1.HttpsError('internal', err.message || 'Failed to recalculate progression.');
    }
});
// ============================================================================
// 7. ACCOUNT DELETION
// ============================================================================
async function forEachAccountDeletionPage(query, handlePage) {
    const ordered = query.orderBy('__name__').limit(200);
    let cursor;
    do {
        const page = await (cursor ? ordered.startAfter(cursor) : ordered).get();
        if (page.empty)
            return;
        await handlePage(page.docs);
        cursor = page.docs[page.docs.length - 1];
        if (page.size < 200)
            return;
    } while (cursor);
}
async function cleanAccountReports(userId) {
    const reports = db.collection('reports');
    await forEachAccountDeletionPage(reports.where('reporterId', '==', userId), async (docs) => {
        await db.runTransaction(async (transaction) => {
            const currentReports = await transaction.getAll(...docs.map(report => report.ref));
            for (const report of currentReports) {
                if (report.get('reporterId') !== userId ||
                    (report.get('reporterEmail') === undefined && report.get('reporterDeletedAt')))
                    continue;
                transaction.update(report.ref, {
                    reporterEmail: firestore_1.FieldValue.delete(),
                    reporterDeletedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        });
    });
    await forEachAccountDeletionPage(reports.where('targetId', '==', userId), async (docs) => {
        await db.runTransaction(async (transaction) => {
            const currentReports = await transaction.getAll(...docs.map(report => report.ref));
            for (const current of currentReports) {
                if (current.get('targetId') !== userId || current.get('targetType') !== 'user' ||
                    current.get('status') !== 'pending')
                    continue;
                transaction.update(current.ref, {
                    status: 'resolved',
                    resolvedReason: 'target_account_deleted',
                    resolvedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        });
    });
}
exports.deleteUserAccount = (0, https_1.onCall)({
    region: exports.FUNCTION_REGION,
    timeoutSeconds: 540,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be signed in.');
    }
    const userId = request.auth.uid;
    // Strict ownership enforcement: reject any attempt to target another user's UID
    const requestedTargetUid = request.data && typeof request.data === 'object' && 'userId' in request.data
        ? request.data.userId
        : undefined;
    if (typeof requestedTargetUid === 'string' && requestedTargetUid.trim() !== '' && requestedTargetUid !== userId) {
        throw new https_1.HttpsError('permission-denied', 'You can only delete your own authenticated account.');
    }
    // Require recent authentication (within 5 minutes / 300 seconds) before destructive deletion
    const authTimeSec = Number(request.auth.token?.auth_time || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const MAX_RECENT_AUTH_AGE_SEC = 300;
    if (!authTimeSec || nowSec - authTimeSec > MAX_RECENT_AUTH_AGE_SEC) {
        throw new https_1.HttpsError('failed-precondition', 'RECENT_LOGIN_REQUIRED: Please reauthenticate before deleting your account.');
    }
    console.log(`Starting account deletion for user: ${userId}`);
    try {
        // Persist a server-owned deletion lock before any destructive operation.
        // Firestore rules deny new client content and profile recreation while it exists.
        await db.collection('accountDeletionLocks').doc(userId).set({
            status: 'deleting',
            startedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        // Remove the account's reactions and comments on other users' pins before
        // revoking its Auth identity. Only documents whose userId matches are deleted.
        // This intentionally preserves likes/comments authored by other users.
        for (const collectionName of ['likes', 'comments']) {
            while (true) {
                const authored = await db.collectionGroup(collectionName)
                    .where('userId', '==', userId).limit(200).get();
                if (authored.empty)
                    break;
                const batch = db.batch();
                authored.docs.forEach((entry) => batch.delete(entry.ref));
                await batch.commit();
            }
        }
        // Legacy likes may have no userId field. Their document ID is the author's
        // Firebase UID, so a collection-group userId query cannot discover them.
        // Scan pin IDs in bounded pages and inspect only the departing user's like.
        let lastScannedPin;
        while (true) {
            let pinsPageQuery = db.collection('pins').orderBy('__name__').limit(200);
            if (lastScannedPin)
                pinsPageQuery = pinsPageQuery.startAfter(lastScannedPin);
            const pinsPage = await pinsPageQuery.get();
            if (pinsPage.empty)
                break;
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
            if (deleteCount)
                await batch.commit();
            lastScannedPin = pinsPage.docs[pinsPage.docs.length - 1];
        }
        // Remove both sides of each follow relationship. The user's own
        // subcollections are the authoritative source for the mirror document IDs.
        const departingUserRef = db.collection('users').doc(userId);
        for (const relationship of ['following', 'followers']) {
            while (true) {
                const relationships = await departingUserRef.collection(relationship).limit(200).get();
                if (relationships.empty)
                    break;
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
        await forEachAccountDeletionPage(userPins, async (pins) => {
            for (const pin of pins)
                await db.recursiveDelete(pin.ref);
        });
        // Avatar cleanup must succeed before reporting account deletion complete.
        // The caller can retry on transient Storage errors.
        await storage.bucket().deleteFiles({
            prefix: `profile-images/${userId}/`,
        });
        // Pin delete events and reconciliation remove server-owned images by generation.
        // Legacy pin images can still be referenced by other pins.
        const userRef = db.collection('users').doc(userId);
        await db.recursiveDelete(userRef);
        // Revoke access last, after the primary data cleanup has succeeded.
        // This operation is idempotent for a retried deletion request.
        try {
            await (0, auth_1.getAuth)().deleteUser(userId);
        }
        catch (authErr) {
            if (authErr?.code !== 'auth/user-not-found')
                throw authErr;
        }
        await db.collection('accountDeletionLocks').doc(userId).set({
            status: 'deleted',
            completedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { success: true, message: `Account and associated data deleted for user ${userId}` };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError) {
            throw err;
        }
        console.error(`Failed to delete account for user ${userId}:`, err);
        throw new https_1.HttpsError('internal', err.message || 'Failed to complete account deletion.');
    }
});
//# sourceMappingURL=index.js.map