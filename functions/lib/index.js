"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserAccount = exports.reconcileAccountDeletion = exports.recalculateProgression = exports.onUserProfileUpdatedProgression = exports.onPinCreatedProgression = exports.onPinDeleted = exports.reconcilePinImageCleanup = exports.onUserFollowerDeleted = exports.onUserFollowerCreated = exports.onPinCommentDeleted = exports.onPinCommentCreated = exports.onPinLikeDeleted = exports.onPinLikeCreated = exports.pinImageUpload = exports.onAccountAvatarFinalized = exports.uploadProfileAvatar = exports.onUserProfileUpdated = exports.FUNCTION_REGION = exports.FIRESTORE_DATABASE_ID = void 0;
exports.updateUserProgressionServer = updateUserProgressionServer;
exports.cleanAccountReports = cleanAccountReports;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const auth_1 = require("firebase-admin/auth");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const storage_2 = require("firebase-functions/v2/storage");
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
const avatarBucketName = 'rainbyte-studio.firebasestorage.app';
const avatarContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);
const maxAvatarBytes = 10 * 1024 * 1024;
function getAvatarBucket() {
    return process.env.FIREBASE_STORAGE_EMULATOR_HOST ? storage.bucket() : storage.bucket(avatarBucketName);
}
function isExactAvatarGeneration(generation) {
    // The Storage SDK converts the scoped generation to a JS number.
    return /^[1-9][0-9]*$/.test(generation) && Number.isSafeInteger(Number(generation));
}
async function deleteAvatarGeneration(name, generation, metageneration) {
    if (!isExactAvatarGeneration(generation)) {
        throw new Error('Avatar generation cannot be represented exactly.');
    }
    const preconditionOpts = {
        ifGenerationMatch: generation,
        ...(metageneration === undefined ? {} : { ifMetagenerationMatch: metageneration }),
    };
    await getAvatarBucket().file(name, { generation, preconditionOpts }).delete({ ignoreNotFound: true });
}
function parseAvatarReference(value, uid, bucket) {
    if (typeof value !== 'string')
        return;
    try {
        const url = new URL(value);
        const prefix = '/v0/b/' + bucket + '/o/';
        if (url.origin !== 'https://firebasestorage.googleapis.com' ||
            url.username || url.password || !url.pathname.startsWith(prefix))
            return;
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        const parts = path.split('/');
        if (parts.length !== 3 || parts[0] !== 'profile-images' || parts[1] !== uid ||
            !parts[2] || parts[2] === '.' || parts[2] === '..')
            return;
        const generation = /^#generation=([1-9][0-9]*)$/.exec(url.hash)?.[1];
        const tokens = url.searchParams.getAll('token');
        return { path, generation, token: tokens.length === 1 ? tokens[0] : undefined };
    }
    catch {
        return;
    }
}
exports.onUserProfileUpdated = (0, firestore_2.onDocumentUpdated)({ document: 'users/{userId}', database: exports.FIRESTORE_DATABASE_ID, region: exports.FUNCTION_REGION,
    retry: false, timeoutSeconds: 60, preserveExternalChanges: true }, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const uid = event.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    if (before?.photoURL === after?.photoURL && before?.avatarUrl === after?.avatarUrl)
        return;
    const bucket = getAvatarBucket();
    const parse = (value) => parseAvatarReference(value, uid, bucket.name);
    const afterPaths = new Set([parse(after?.photoURL)?.path, parse(after?.avatarUrl)?.path]);
    const replaced = [...new Set([before?.photoURL, before?.avatarUrl])]
        .map(parse)
        .filter(ref => ref && !afterPaths.has(ref.path));
    if (!replaced.length)
        return;
    // A later profile update may have selected the previous path again.
    const current = (await change.after.ref.get()).data();
    if (!current || current.deletionStatus === 'deleting')
        return;
    const currentPaths = new Set([parse(current.photoURL)?.path, parse(current.avatarUrl)?.path]);
    for (const ref of replaced) {
        if (!ref || currentPaths.has(ref.path))
            continue;
        const unresolved = (reason) => console.warn('avatar_cleanup_unresolved', {
            eventId: event.id, uid, path: ref.path, reason,
        });
        const { generation, token } = ref;
        if (!generation || !isExactAvatarGeneration(generation) || !token) {
            unresolved('missing_or_invalid_avatar_identity');
            continue;
        }
        try {
            const [metadata] = await bucket.file(ref.path, { generation }).getMetadata();
            const metageneration = String(metadata.metageneration);
            if (String(metadata.generation) !== generation || !isExactAvatarGeneration(metageneration) ||
                metadata.metadata?.uploadedBy !== uid || metadata.metadata?.firebaseStorageDownloadTokens !== token) {
                unresolved('metadata_mismatch');
                continue;
            }
            await deleteAvatarGeneration(ref.path, generation, metageneration);
        }
        catch (error) {
            const code = error.code;
            if (code !== 404) {
                unresolved(code === 412 ? 'precondition_changed' : 'storage_operation_failed');
                if (code !== 412)
                    throw error;
            }
        }
    }
});
async function assertAvatarUploadAllowed(uid) {
    const [profile, lock] = await db.getAll(db.collection('users').doc(uid), db.collection('accountDeletionLocks').doc(uid));
    if (!profile.exists || lock.exists || profile.get('deletionStatus') === 'deleting') {
        throw new https_1.HttpsError('permission-denied', 'An active profile is required.');
    }
}
exports.uploadProfileAvatar = (0, https_1.onCall)({ region: exports.FUNCTION_REGION, timeoutSeconds: 60, memory: '512MiB', concurrency: 2, maxInstances: 8 }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid || uid.includes('/') || uid === '.' || uid === '..' ||
        request.auth?.token.firebase?.tenant || request.auth?.token.firebase?.sign_in_provider === 'anonymous') {
        throw new https_1.HttpsError('unauthenticated', 'Sign in to upload a profile photo.');
    }
    const { userId, content, contentType } = request.data ?? {};
    if (userId !== uid) {
        throw new https_1.HttpsError('permission-denied', 'The signed-in account changed.');
    }
    if (typeof contentType !== 'string' || !avatarContentTypes.has(contentType) ||
        typeof content !== 'string' || !content.length || content.length % 4 !== 0 ||
        content.length > Math.ceil(maxAvatarBytes / 3) * 4) {
        throw new https_1.HttpsError('invalid-argument', 'Supply a valid profile image.');
    }
    const bytes = Buffer.from(content, 'base64');
    if (bytes.length > maxAvatarBytes || bytes.toString('base64') !== content ||
        !(0, pinImageUpload_1.matchesImageSignature)(bytes, contentType)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid profile image data.');
    }
    const bucket = getAvatarBucket();
    const path = 'profile-images/' + uid + '/' + (0, node_crypto_1.randomUUID)();
    const file = bucket.file(path);
    const token = (0, node_crypto_1.randomUUID)();
    await assertAvatarUploadAllowed(uid);
    // Immutable, non-resumable writes give an ambiguous result at most one object.
    await file.save(bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
            contentType,
            cacheControl: 'private, no-store',
            metadata: { uploadedBy: uid, firebaseStorageDownloadTokens: token },
        },
    });
    // The locked Storage SDK exposes the simple upload response on this handle.
    // Never discover the uploaded generation by looking up the current path.
    const generation = String(file.metadata.generation);
    if (!isExactAvatarGeneration(generation)) {
        throw new https_1.HttpsError('internal', 'The avatar upload did not return an exact generation.');
    }
    try {
        await assertAvatarUploadAllowed(uid);
    }
    catch (error) {
        // The finalize trigger and deletion worker cover transport failure or process death.
        await deleteAvatarGeneration(path, generation);
        throw error;
    }
    return {
        downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name +
            '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token + '#generation=' + generation,
    };
});
exports.onAccountAvatarFinalized = (0, storage_2.onObjectFinalized)({ bucket: avatarBucketName, region: 'us-west1', retry: true, timeoutSeconds: 60 }, async (event) => {
    const match = /^profile-images\/([^/]+)\//.exec(event.data.name);
    if (!match || match[1] === '.' || match[1] === '..')
        return;
    const lock = await db.collection('accountDeletionLocks').doc(match[1]).get();
    if (!lock.exists)
        return;
    await deleteAvatarGeneration(event.data.name, String(event.data.generation));
});
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
    retry: false,
};
exports.onPinLikeCreated = (0, firestore_2.onDocumentCreated)(likesTrigger, event => syncPinCounter(event.params.pinId, 'likes'));
exports.onPinLikeDeleted = (0, firestore_2.onDocumentDeleted)(likesTrigger, event => syncPinCounter(event.params.pinId, 'likes'));
const commentsTrigger = {
    document: 'pins/{pinId}/comments/{commentId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
    retry: false,
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
    retry: false,
};
exports.onUserFollowerCreated = (0, firestore_2.onDocumentCreated)(followersTrigger, event => syncFollowCounters(event.params.targetUserId, event.params.followerId));
exports.onUserFollowerDeleted = (0, firestore_2.onDocumentDeleted)(followersTrigger, event => syncFollowCounters(event.params.targetUserId, event.params.followerId));
// ============================================================================
// 4. CASCADE DELETION ON PIN REMOVAL
// ============================================================================
function scheduledWorker(timeoutSeconds, run) {
    // Cloud Run IAM authenticates the Scheduler OIDC identity. Headers are not credentials.
    return (0, https_1.onRequest)({
        region: exports.FUNCTION_REGION, timeoutSeconds, concurrency: 1, maxInstances: 1, invoker: 'private',
    }, async (req, res) => {
        if (req.method !== 'POST') {
            res.set('Allow', 'POST').sendStatus(405);
            return;
        }
        try {
            await run();
            res.status(204).end();
        }
        catch (error) {
            console.error('Scheduled worker failed', { error });
            res.sendStatus(500);
        }
    });
}
exports.reconcilePinImageCleanup = scheduledWorker(60, () => (0, pinImageCleanup_1.reconcilePinImages)(db, () => storage.bucket()));
exports.onPinDeleted = (0, firestore_2.onDocumentDeleted)({
    document: 'pins/{pinId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
    retry: false,
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
    retry: false,
}, async (event) => {
    const userId = event.data?.get('userId');
    if (typeof userId === 'string')
        await updateUserProgressionServer(userId);
});
exports.onUserProfileUpdatedProgression = (0, firestore_2.onDocumentUpdated)({
    document: 'users/{userId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
    retry: false,
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
const deletionPhases = [
    'likes', 'comments', 'legacyLikes', 'following', 'followers',
    'reporterReports', 'targetReports', 'pins', 'avatars', 'profile', 'auth', 'verifyAvatars',
];
async function updateAccountReportPage(userId, mode, docs) {
    await db.runTransaction(async (transaction) => {
        const reports = await transaction.getAll(...docs.map(report => report.ref));
        for (const report of reports) {
            if (mode === 'reporterReports' && report.get('reporterId') === userId &&
                (report.get('reporterEmail') !== undefined || !report.get('reporterDeletedAt'))) {
                transaction.update(report.ref, {
                    reporterEmail: firestore_1.FieldValue.delete(),
                    reporterDeletedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            if (mode === 'targetReports' && report.get('targetId') === userId &&
                report.get('targetType') === 'user' && report.get('status') === 'pending') {
                transaction.update(report.ref, {
                    status: 'resolved',
                    resolvedReason: 'target_account_deleted',
                    resolvedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
    });
}
async function cleanAccountReports(userId) {
    const reports = db.collection('reports');
    await forEachAccountDeletionPage(reports.where('reporterId', '==', userId), docs => updateAccountReportPage(userId, 'reporterReports', docs));
    await forEachAccountDeletionPage(reports.where('targetId', '==', userId), docs => updateAccountReportPage(userId, 'targetReports', docs));
}
// Each phase advances only after the side effects succeed. A missing cursor means
// the phase is drained. Destructive pages re-read from the front after a retry.
async function deleteAccountPage(userId, phase, cursor) {
    const user = db.collection('users').doc(userId);
    const pins = db.collection('pins');
    switch (phase) {
        case 'likes':
        case 'comments': {
            const page = await db.collectionGroup(phase).where('userId', '==', userId).limit(100).get();
            if (page.empty)
                return null;
            const batch = db.batch();
            for (const entry of page.docs)
                batch.delete(entry.ref, { lastUpdateTime: entry.updateTime });
            await batch.commit();
            return '';
        }
        case 'legacyLikes': {
            const query = pins.orderBy('__name__').limit(100);
            const page = await (cursor ? query.startAfter(cursor) : query).get();
            if (page.empty)
                return null;
            await db.runTransaction(async (tx) => {
                const likes = await tx.getAll(...page.docs.map(pin => pin.ref.collection('likes').doc(userId)));
                for (const like of likes) {
                    if (like.exists && (!like.get('userId') || like.get('userId') === userId))
                        tx.delete(like.ref);
                }
            });
            return page.docs.at(-1).id;
        }
        case 'following':
        case 'followers': {
            const page = await user.collection(phase).limit(100).get();
            if (page.empty)
                return null;
            const batch = db.batch();
            const inverse = phase === 'following' ? 'followers' : 'following';
            for (const relationship of page.docs) {
                batch.delete(db.collection('users').doc(relationship.id).collection(inverse).doc(userId));
                batch.delete(relationship.ref);
            }
            await batch.commit();
            return '';
        }
        case 'reporterReports':
        case 'targetReports': {
            const field = phase === 'reporterReports' ? 'reporterId' : 'targetId';
            const query = db.collection('reports').where(field, '==', userId).orderBy('__name__').limit(100);
            const page = await (cursor ? query.startAfter(cursor) : query).get();
            if (page.empty)
                return null;
            await updateAccountReportPage(userId, phase, page.docs);
            return page.docs.at(-1).id;
        }
        case 'pins': {
            const page = await pins.where('userId', '==', userId).limit(1).get();
            if (page.empty)
                return null;
            const pin = page.docs[0].ref;
            await db.runTransaction(async (tx) => {
                const current = await tx.get(pin);
                if (current.get('userId') !== userId)
                    return;
                const [likes, comments] = await Promise.all([
                    tx.get(pin.collection('likes').limit(100)),
                    tx.get(pin.collection('comments').limit(100)),
                ]);
                if (likes.empty && comments.empty) {
                    tx.delete(pin);
                    return;
                }
                for (const child of [...likes.docs, ...comments.docs])
                    tx.delete(child.ref);
            });
            return '';
        }
        case 'avatars':
        case 'verifyAvatars': {
            const bucket = getAvatarBucket();
            const [files] = await bucket.getFiles({
                prefix: `profile-images/${userId}/`,
                autoPaginate: false,
                maxResults: 25,
                versions: true,
            });
            if (!files.length)
                return null;
            for (const file of files) {
                const generation = file.metadata.generation;
                if (!generation)
                    throw new Error('Avatar object generation is missing.');
                await deleteAvatarGeneration(file.name, String(generation));
            }
            return '';
        }
        case 'profile':
            // The tombstone remains present even if recursiveDelete only partly succeeds.
            await db.recursiveDelete(user);
            return null;
        case 'auth':
            try {
                await (0, auth_1.getAuth)().deleteUser(userId);
            }
            catch (error) {
                if (error?.code !== 'auth/user-not-found')
                    throw error;
            }
            return null;
    }
}
const deletionWorkerTimeoutSeconds = 120;
const deletionLeaseMs = (deletionWorkerTimeoutSeconds + 60) * 1000;
const deletionLocks = db.collection('accountDeletionLocks');
// Legacy resumable sessions can live for a week. Keep a full extra day
// beyond that window before the final strongly consistent listing.
const avatarDrainMs = 8 * 24 * 60 * 60_000;
function initializeDeletionJob(now) {
    return {
        phase: 'likes',
        readyAt: firestore_1.Timestamp.fromMillis(now),
        avatarDrainUntil: firestore_1.Timestamp.fromMillis(now + avatarDrainMs),
        leaseOwner: firestore_1.FieldValue.delete(),
        cursor: firestore_1.FieldValue.delete(),
        progressedAt: firestore_1.FieldValue.serverTimestamp(),
    };
}
async function adoptLegacyDeletionJobs(stopAt) {
    // An ordered readyAt query cannot see older records that lack the field.
    // Paginate by document ID independently of queue ordering.
    const checkpoint = db.collection('_maintenance').doc('accountDeletionLegacyScan');
    const cursor = (await checkpoint.get()).get('cursor');
    const scan = deletionLocks.where('status', '==', 'deleting').orderBy('__name__').limit(25);
    const page = await (typeof cursor === 'string' ? scan.startAfter(cursor) : scan).get();
    let lastScanned = null;
    for (const candidate of page.docs) {
        if (Date.now() >= stopAt)
            break;
        lastScanned = candidate.id;
        if (candidate.get('phase') !== undefined || candidate.get('readyAt') !== undefined)
            continue;
        await db.runTransaction(async (tx) => {
            const lock = await tx.get(candidate.ref);
            if (lock.get('status') !== 'deleting' || lock.get('phase') !== undefined ||
                lock.get('readyAt') !== undefined || lock.get('leaseOwner') !== undefined)
                return;
            tx.update(lock.ref, initializeDeletionJob(Date.now()));
        });
    }
    // Keep the scan monotonic even if a scheduler delivery overlaps a retry.
    await db.runTransaction(async (tx) => {
        const state = await tx.get(checkpoint);
        if (state.get('cursor') !== cursor)
            return;
        const reachedEnd = page.empty || lastScanned === page.docs[page.size - 1].id;
        if (!reachedEnd && lastScanned === null)
            return;
        tx.set(checkpoint, { cursor: reachedEnd && page.size < 25 ? null : lastScanned });
    });
}
async function resumeAccountDeletion(ref, stopAt) {
    const owner = (0, node_crypto_1.randomUUID)();
    const leased = await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        const now = Date.now();
        const due = current.get('readyAt');
        if (current.get('status') !== 'deleting' || !current.get('phase') ||
            !(due instanceof firestore_1.Timestamp) || due.toMillis() > now)
            return false;
        const drain = current.get('avatarDrainUntil');
        const drainUntil = drain instanceof firestore_1.Timestamp ? drain : firestore_1.Timestamp.fromMillis(now + avatarDrainMs);
        if (current.get('phase') === 'verifyAvatars' && drainUntil.toMillis() > now) {
            tx.update(ref, { readyAt: drainUntil, avatarDrainUntil: drainUntil, leaseOwner: firestore_1.FieldValue.delete() });
            return false;
        }
        // A crashed invocation becomes eligible only after its execution window.
        tx.update(ref, {
            leaseOwner: owner,
            readyAt: firestore_1.Timestamp.fromMillis(now + deletionLeaseMs),
            avatarDrainUntil: drainUntil,
        });
        return true;
    });
    if (!leased)
        return;
    let retryDelay = 0;
    try {
        while (Date.now() < stopAt) {
            const current = await ref.get();
            if (current.get('leaseOwner') !== owner || current.get('readyAt').toMillis() <= Date.now())
                return;
            const phase = current.get('phase');
            const index = deletionPhases.indexOf(phase);
            if (index === -1)
                throw new Error('Unknown account deletion phase.');
            const nextCursor = await deleteAccountPage(ref.id, phase, current.get('cursor'));
            const done = phase === 'verifyAvatars' && nextCursor === null;
            const drainUntil = current.get('avatarDrainUntil');
            const park = phase === 'auth' && drainUntil.toMillis() > Date.now();
            const advanced = await db.runTransaction(async (tx) => {
                const lock = await tx.get(ref);
                if (lock.get('leaseOwner') !== owner || lock.get('readyAt').toMillis() <= Date.now())
                    return false;
                tx.update(ref, done ? {
                    status: 'deleted',
                    completedAt: firestore_1.FieldValue.serverTimestamp(),
                    progressedAt: firestore_1.FieldValue.serverTimestamp(),
                    phase: firestore_1.FieldValue.delete(),
                    cursor: firestore_1.FieldValue.delete(),
                    readyAt: firestore_1.FieldValue.delete(),
                    leaseOwner: firestore_1.FieldValue.delete(),
                } : {
                    phase: nextCursor === null ? deletionPhases[index + 1] : phase,
                    cursor: nextCursor || firestore_1.FieldValue.delete(),
                    ...(park ? { readyAt: drainUntil, leaseOwner: firestore_1.FieldValue.delete() } : {}),
                    progressedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                return true;
            });
            if (!advanced || done || park)
                return;
        }
    }
    catch (error) {
        retryDelay = 5 * 60_000;
        console.error('Account deletion worker failed', { userId: ref.id, error });
    }
    finally {
        await db.runTransaction(async (tx) => {
            if ((await tx.get(ref)).get('leaseOwner') !== owner)
                return;
            tx.update(ref, {
                leaseOwner: firestore_1.FieldValue.delete(),
                readyAt: firestore_1.Timestamp.fromMillis(Date.now() + retryDelay),
            });
        });
    }
}
exports.reconcileAccountDeletion = scheduledWorker(deletionWorkerTimeoutSeconds, async () => {
    const stopAt = Date.now() + 40_000;
    // Enable only after the synchronous legacy writer and its invocations drain.
    if (process.env.ACCOUNT_DELETION_LEGACY_ADOPTION === 'true') {
        try {
            await adoptLegacyDeletionJobs(Date.now() + 5_000);
        }
        catch (error) {
            console.error('Account deletion legacy scan failed', error);
        }
    }
    const ready = deletionLocks.where('readyAt', '<=', firestore_1.Timestamp.now()).orderBy('readyAt').limit(10);
    let cursor;
    while (Date.now() < stopAt) {
        const page = await (cursor ? ready.startAfter(cursor) : ready).get();
        for (const job of page.docs) {
            if (Date.now() >= stopAt)
                return;
            if (job.get('status') !== 'deleting' || !job.get('phase') ||
                !(job.get('readyAt') instanceof firestore_1.Timestamp))
                continue;
            try {
                await resumeAccountDeletion(job.ref, Math.min(stopAt, Date.now() + 5_000));
            }
            catch (error) {
                console.error('Account deletion lease operation failed', { userId: job.id, error });
            }
        }
        if (page.size < 10)
            return;
        cursor = page.docs.at(-1);
    }
});
exports.deleteUserAccount = (0, https_1.onCall)({
    region: exports.FUNCTION_REGION,
    preserveExternalChanges: true,
}, async (request) => {
    if (!request.auth || request.auth.token.firebase?.tenant) {
        throw new https_1.HttpsError('unauthenticated', 'A Heyroq account must be signed in.');
    }
    const userId = request.auth.uid;
    if (!userId || userId.includes('/') || userId === '.' || userId === '..') {
        throw new https_1.HttpsError('permission-denied', 'Invalid account.');
    }
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
    if (!Number.isFinite(authTimeSec) || authTimeSec <= 0 || authTimeSec > nowSec ||
        nowSec - authTimeSec > MAX_RECENT_AUTH_AGE_SEC) {
        throw new https_1.HttpsError('failed-precondition', 'RECENT_LOGIN_REQUIRED: Please reauthenticate before deleting your account.');
    }
    const ref = deletionLocks.doc(userId);
    const status = await db.runTransaction(async (tx) => {
        const lock = await tx.get(ref);
        if (lock.get('status') === 'deleted')
            return 'deleted';
        if (lock.get('status') === 'deleting')
            return 'deleting';
        if (lock.exists)
            throw new https_1.HttpsError('failed-precondition', 'Deletion state requires support.');
        tx.set(ref, {
            status: 'deleting',
            startedAt: firestore_1.FieldValue.serverTimestamp(),
            ...initializeDeletionJob(Date.now()),
        }, { merge: true });
        return 'deleting';
    });
    return { success: status === 'deleted', status };
});
//# sourceMappingURL=index.js.map