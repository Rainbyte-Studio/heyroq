"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserAccount = exports.recalculateProgression = exports.onUserProfileUpdatedProgression = exports.onPinCreatedProgression = exports.onPinDeleted = exports.onUserFollowerDeleted = exports.onUserFollowerCreated = exports.onPinCommentDeleted = exports.onPinCommentCreated = exports.onPinLikeDeleted = exports.onPinLikeCreated = exports.FUNCTION_REGION = exports.FIRESTORE_DATABASE_ID = void 0;
exports.updateUserProgressionServer = updateUserProgressionServer;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const progressionConfig_1 = require("./progressionConfig");
// Initialize Firebase Admin SDK
(0, app_1.initializeApp)();
exports.FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
const db = (0, firestore_1.getFirestore)(exports.FIRESTORE_DATABASE_ID);
const storage = (0, storage_1.getStorage)();
exports.FUNCTION_REGION = 'europe-west2';
/**
 * Normalizes city strings with diacritic removal and canonical mapping.
 */
function normalizeCityName(rawCity) {
    if (!rawCity)
        return 'Exploration Spot';
    const trimmed = rawCity.trim();
    const lowerNoAccents = trimmed
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const CANONICAL_CITIES = {
        tromso: 'Tromsø',
        oslo: 'Oslo',
        bergen: 'Bergen',
        trondheim: 'Trondheim',
        stavanger: 'Stavanger',
        zakynthos: 'Zakynthos',
        zante: 'Zakynthos',
        athens: 'Athens',
        athina: 'Athens',
        santorini: 'Santorini',
        thira: 'Santorini',
        mykonos: 'Mykonos',
        corfu: 'Corfu',
        kerkyra: 'Corfu',
        paris: 'Paris',
        london: 'London',
        rome: 'Rome',
        roma: 'Rome',
        barcelona: 'Barcelona',
        madrid: 'Madrid',
        berlin: 'Berlin',
        tokyo: 'Tokyo',
        newyork: 'New York',
        'new york': 'New York',
        sanfrancisco: 'San Francisco',
        'san francisco': 'San Francisco',
        bali: 'Bali',
        sydney: 'Sydney',
    };
    if (CANONICAL_CITIES[lowerNoAccents]) {
        return CANONICAL_CITIES[lowerNoAccents];
    }
    return trimmed
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}
/**
 * Normalizes country strings with ISO alpha-2/alpha-3 canonical mapping.
 */
function resolveCountry(rawCountry) {
    if (!rawCountry)
        return { code: 'GL', name: 'Global' };
    const trimmed = rawCountry.trim();
    const lower = trimmed.toLowerCase();
    const CANONICAL_MAP = {
        norway: { code: 'NO', name: 'Norway' },
        no: { code: 'NO', name: 'Norway' },
        nor: { code: 'NO', name: 'Norway' },
        norge: { code: 'NO', name: 'Norway' },
        greece: { code: 'GR', name: 'Greece' },
        gr: { code: 'GR', name: 'Greece' },
        grc: { code: 'GR', name: 'Greece' },
        hellas: { code: 'GR', name: 'Greece' },
        'united states': { code: 'US', name: 'United States' },
        us: { code: 'US', name: 'United States' },
        usa: { code: 'US', name: 'United States' },
        'united kingdom': { code: 'GB', name: 'United Kingdom' },
        uk: { code: 'GB', name: 'United Kingdom' },
        gb: { code: 'GB', name: 'United Kingdom' },
        gbr: { code: 'GB', name: 'United Kingdom' },
        france: { code: 'FR', name: 'France' },
        fr: { code: 'FR', name: 'France' },
        germany: { code: 'DE', name: 'Germany' },
        de: { code: 'DE', name: 'Germany' },
        italy: { code: 'IT', name: 'Italy' },
        it: { code: 'IT', name: 'Italy' },
        spain: { code: 'ES', name: 'Spain' },
        es: { code: 'ES', name: 'Spain' },
        japan: { code: 'JP', name: 'Japan' },
        jp: { code: 'JP', name: 'Japan' },
        australia: { code: 'AU', name: 'Australia' },
        au: { code: 'AU', name: 'Australia' },
        canada: { code: 'CA', name: 'Canada' },
        ca: { code: 'CA', name: 'Canada' },
        netherlands: { code: 'NL', name: 'Netherlands' },
        nl: { code: 'NL', name: 'Netherlands' },
        sweden: { code: 'SE', name: 'Sweden' },
        se: { code: 'SE', name: 'Sweden' },
        denmark: { code: 'DK', name: 'Denmark' },
        dk: { code: 'DK', name: 'Denmark' },
        finland: { code: 'FI', name: 'Finland' },
        fi: { code: 'FI', name: 'Finland' },
        iceland: { code: 'IS', name: 'Iceland' },
        is: { code: 'IS', name: 'Iceland' },
        indonesia: { code: 'ID', name: 'Indonesia' },
        id: { code: 'ID', name: 'Indonesia' },
        singapore: { code: 'SG', name: 'Singapore' },
        sg: { code: 'SG', name: 'Singapore' },
    };
    if (CANONICAL_MAP[lower]) {
        return CANONICAL_MAP[lower];
    }
    if (trimmed.length === 2 && /^[A-Za-z]{2}$/.test(trimmed)) {
        const code = trimmed.toUpperCase();
        return { code, name: code };
    }
    const name = trimmed
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    const code = name.slice(0, 2).toUpperCase();
    return { code, name };
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
    if (!userId || userId.startsWith('system_') || userId.startsWith('demo_'))
        return null;
    // 1. Fetch user's active pins (excluding deleted or reported)
    const pinsSnap = await db.collection('pins').where('userId', '==', userId).get();
    const validPins = [];
    pinsSnap.forEach((doc) => {
        const data = doc.data();
        if (!data.isDeleted && data.status !== 'reported' && data.status !== 'removed') {
            validPins.push({ id: doc.id, ...data });
        }
    });
    const activeSpotsCount = validPins.length; // DYNAMIC: Current non-deleted pins
    // 2. Extract active geographic footprint with ISO normalization
    const activeCitiesSet = new Set();
    const activeCountriesSet = new Set();
    const cityToCountryMap = new Map();
    validPins.forEach((pin) => {
        const country = resolveCountry(pin.countryCode || pin.countryName || pin.country || pin.locationName || '');
        const city = normalizeCityName(pin.city || pin.locationName || '');
        if (city && city !== 'Exploration Spot') {
            const c = city.toLowerCase().trim();
            activeCitiesSet.add(c);
            if (country.code && country.code !== 'GL') {
                cityToCountryMap.set(c, country.code.toUpperCase().trim());
            }
        }
        if (country.code && country.code !== 'GL') {
            activeCountriesSet.add(country.code.toUpperCase());
        }
    });
    // 3. Fetch user profile for followers & completeness
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
        if (cat.includes('hidden') || cat.includes('gem'))
            hiddenGemsCount++;
        if (cat.includes('food'))
            foodCount++;
        if (cat.includes('nature'))
            natureCount++;
        if (cat.includes('photo') || (pin.tags && pin.tags.some((t) => t.toLowerCase().includes('photo')))) {
            photoSpotsCount++;
        }
        const hasLongDesc = (pin.description || '').trim().length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
        const hasTags = Array.isArray(pin.tags) && pin.tags.length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
        if (hasLongDesc && hasTags)
            richSpotsCount++;
    });
    // Profile completeness (avatar, bio >= 10 chars, at least 1 spot)
    let profileCompletePoints = 0;
    if (userData?.avatarUrl || userData?.photoURL)
        profileCompletePoints++;
    if (userData?.bio && userData.bio.trim().length >= 10)
        profileCompletePoints++;
    // 4. Read Existing State to Enforce Monotonic Historical Invariants
    const summaryRef = db.collection('users').doc(userId).collection('progression').doc('summary');
    const summarySnap = await summaryRef.get();
    const existingSummary = summarySnap.exists ? summarySnap.data() : null;
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
    // Union active cities/countries into historical sets
    activeCitiesSet.forEach((c) => historicalCitiesSet.add(c));
    activeCountriesSet.forEach((c) => historicalCountriesSet.add(c));
    // HISTORICAL MONOTONIC METRICS: Must never decrease!
    const prevSpots = Number(existingSummary?.totalSpotsCount) || 0;
    const lifetimeSpotsCount = Math.max(prevSpots, historicalSpotsCount, activeSpotsCount);
    const prevCities = Number(existingSummary?.citiesCount) || 0;
    const lifetimeCitiesCount = Math.max(prevCities, historicalCitiesSet.size, activeCitiesSet.size);
    const prevCountries = Number(existingSummary?.countriesCount) || 0;
    const lifetimeCountriesCount = Math.max(prevCountries, historicalCountriesSet.size, activeCountriesSet.size);
    if (lifetimeSpotsCount >= 1) {
        profileCompletePoints++;
    }
    // 5. Calculate New Pending XP Events (Idempotent: Only award if not already in existingEventIds)
    const pendingXpEvents = [];
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
    // Spots creation (+50 XP each)
    validPins.forEach((pin) => {
        const eventId = (0, progressionConfig_1.getPinCreatedEventId)(pin.id);
        if (!existingEventIds.has(eventId)) {
            pendingXpEvents.push({
                id: eventId,
                event: {
                    id: eventId,
                    userId,
                    action: 'PIN_CREATED',
                    referenceId: pin.id,
                    xpEarned: progressionConfig_1.PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP,
                    description: `Discovered: ${pin.title || 'Spot'}`,
                    createdAt: pin.createdAt || new Date().toISOString(),
                },
            });
        }
    });
    // Unique Cities (+25 XP each)
    activeCitiesSet.forEach((canonicalCity) => {
        const countryCode = cityToCountryMap.get(canonicalCity);
        const eventId = (0, progressionConfig_1.getCityFirstEventId)(canonicalCity, countryCode);
        if (!existingEventIds.has(eventId)) {
            pendingXpEvents.push({
                id: eventId,
                event: {
                    id: eventId,
                    userId,
                    action: 'UNIQUE_CITY',
                    referenceId: canonicalCity,
                    xpEarned: progressionConfig_1.PROGRESSION_CONSTANTS.UNIQUE_CITY_BONUS_XP,
                    description: `Discovered new city: ${canonicalCity}`,
                    createdAt: new Date().toISOString(),
                },
            });
        }
    });
    // Unique Countries (+150 XP each)
    activeCountriesSet.forEach((countryCode) => {
        const eventId = (0, progressionConfig_1.getCountryFirstEventId)(countryCode);
        if (!existingEventIds.has(eventId)) {
            pendingXpEvents.push({
                id: eventId,
                event: {
                    id: eventId,
                    userId,
                    action: 'UNIQUE_COUNTRY',
                    referenceId: countryCode,
                    xpEarned: progressionConfig_1.PROGRESSION_CONSTANTS.UNIQUE_COUNTRY_BONUS_XP,
                    description: `Discovered new country: ${countryCode}`,
                    createdAt: new Date().toISOString(),
                },
            });
        }
    });
    // Rich spot bonus (+25 XP each)
    validPins.forEach((pin) => {
        const hasLongDesc = (pin.description || '').trim().length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
        const hasTags = Array.isArray(pin.tags) && pin.tags.length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
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
    // 6. Read Existing Achievements to PRESERVE permanent unlocked state!
    const achievementsCol = db.collection('users').doc(userId).collection('achievements');
    const existingAchSnap = await achievementsCol.get();
    const existingMap = new Map();
    existingAchSnap.forEach((d) => existingMap.set(d.id, d.data()));
    const prelimLevel = (0, progressionConfig_1.getProgressForXp)(Math.max(Number(existingSummary?.xp) || 0, historicalLedgerXp)).level;
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
        const calculatedMetric = item.metric(metricContext);
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
        const isUnlocked = Boolean(existing?.isUnlocked) || progressVal >= item.target;
        if (isUnlocked) {
            unlockedCount++;
            const achEventId = (0, progressionConfig_1.getAchievementEventId)(item.id);
            if (!existingEventIds.has(achEventId)) {
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
    const runningTotalXp = Math.max(Number(existingSummary?.xp) || 0, historicalLedgerXp + newlyEarnedXp);
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
    // 7. Final Monotonic XP Calculation
    const totalNewXp = pendingXpEvents.reduce((acc, curr) => acc + (Number(curr.event.xpEarned) || 0), 0);
    const ledgerTotalXp = historicalLedgerXp + totalNewXp;
    const previousXp = Number(existingSummary?.xp) || 0;
    const finalTotalXp = Math.max(previousXp, ledgerTotalXp);
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
    // 8. Write Authoritative State Atomically via Batch
    const batch = db.batch();
    // Summary
    batch.set(summaryRef, summary, { merge: true });
    // Update dynamic pinsCount on user profile (reflects active spots for queries)
    const userProfileRef = db.collection('users').doc(userId);
    batch.set(userProfileRef, { pinsCount: activeSpotsCount, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
    // Achievements
    pendingAchievements.forEach((ach) => {
        const achRef = achievementsCol.doc(ach.id);
        batch.set(achRef, ach, { merge: true });
    });
    // Write new XP events idempotently (never overwrite or delete existing ones)
    pendingXpEvents.forEach(({ id, event }) => {
        batch.set(xpEventsCol.doc(id), event, { merge: true });
    });
    await batch.commit();
    console.log(`[Progression Server] Authoritatively synchronized user ${userId}: Level ${finalLevelInfo.level} (${finalLevelInfo.title}), ${finalTotalXp} XP, ${unlockedCount} achievements.`);
    return summary;
}
/**
 * Helper to safely extract a Cloud Storage object path from a Firebase Storage download URL.
 */
function extractStoragePathFromUrl(url, expectedPrefix) {
    try {
        if (!url || typeof url !== 'string')
            return null;
        if (url.includes('/o/')) {
            const parts = url.split('/o/');
            if (parts.length < 2)
                return null;
            const pathWithParams = parts[1];
            const encodedPath = pathWithParams.split('?')[0];
            const decodedPath = decodeURIComponent(encodedPath);
            if (decodedPath.startsWith(expectedPrefix)) {
                return decodedPath;
            }
        }
    }
    catch (err) {
        console.warn('Failed to parse storage path from url:', url, err);
    }
    return null;
}
// ============================================================================
// 1. PIN LIKE COUNTER (Server-Side Trigger - Idempotent Canonical Count)
// ============================================================================
exports.onPinLikeCreated = (0, firestore_2.onDocumentCreated)({
    document: 'pins/{pinId}/likes/{userId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);
    try {
        // Authoritative, idempotent count of existing like documents
        const likesCountSnap = await pinRef.collection('likes').count().get();
        const canonicalCount = likesCountSnap.data().count;
        let authorId = null;
        await db.runTransaction(async (transaction) => {
            const pinDoc = await transaction.get(pinRef);
            if (!pinDoc.exists)
                return;
            authorId = pinDoc.data()?.userId || null;
            transaction.update(pinRef, {
                likeCount: canonicalCount,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        console.log(`Successfully synchronized likeCount to ${canonicalCount} for pin ${pinId}`);
        if (authorId) {
            await updateUserProgressionServer(authorId);
        }
    }
    catch (err) {
        console.error(`Error synchronizing likeCount for pin ${pinId}:`, err);
        throw err;
    }
});
exports.onPinLikeDeleted = (0, firestore_2.onDocumentDeleted)({
    document: 'pins/{pinId}/likes/{userId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);
    try {
        // Authoritative, idempotent count of existing like documents
        const likesCountSnap = await pinRef.collection('likes').count().get();
        const canonicalCount = likesCountSnap.data().count;
        let authorId = null;
        await db.runTransaction(async (transaction) => {
            const pinDoc = await transaction.get(pinRef);
            if (!pinDoc.exists)
                return;
            authorId = pinDoc.data()?.userId || null;
            transaction.update(pinRef, {
                likeCount: canonicalCount,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        console.log(`Successfully synchronized likeCount to ${canonicalCount} for pin ${pinId}`);
        if (authorId) {
            await updateUserProgressionServer(authorId);
        }
    }
    catch (err) {
        console.error(`Error synchronizing likeCount for pin ${pinId}:`, err);
        throw err;
    }
});
// ============================================================================
// 2. PIN COMMENT COUNTER (Server-Side Trigger - Idempotent Canonical Count)
// ============================================================================
exports.onPinCommentCreated = (0, firestore_2.onDocumentCreated)({
    document: 'pins/{pinId}/comments/{commentId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);
    try {
        // Authoritative, idempotent count of existing comment documents
        const commentsCountSnap = await pinRef.collection('comments').count().get();
        const canonicalCount = commentsCountSnap.data().count;
        await db.runTransaction(async (transaction) => {
            const pinDoc = await transaction.get(pinRef);
            if (!pinDoc.exists)
                return;
            transaction.update(pinRef, {
                commentCount: canonicalCount,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        console.log(`Successfully synchronized commentCount to ${canonicalCount} for pin ${pinId}`);
    }
    catch (err) {
        console.error(`Error synchronizing commentCount for pin ${pinId}:`, err);
        throw err;
    }
});
exports.onPinCommentDeleted = (0, firestore_2.onDocumentDeleted)({
    document: 'pins/{pinId}/comments/{commentId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const pinId = event.params.pinId;
    const pinRef = db.collection('pins').doc(pinId);
    try {
        // Authoritative, idempotent count of existing comment documents
        const commentsCountSnap = await pinRef.collection('comments').count().get();
        const canonicalCount = commentsCountSnap.data().count;
        await db.runTransaction(async (transaction) => {
            const pinDoc = await transaction.get(pinRef);
            if (!pinDoc.exists)
                return;
            transaction.update(pinRef, {
                commentCount: canonicalCount,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        console.log(`Successfully synchronized commentCount to ${canonicalCount} for pin ${pinId}`);
    }
    catch (err) {
        console.error(`Error synchronizing commentCount for pin ${pinId}:`, err);
        throw err;
    }
});
// ============================================================================
// 3. FOLLOWER / FOLLOWING COUNTERS (Server-Side Trigger)
// ============================================================================
exports.onUserFollowerCreated = (0, firestore_2.onDocumentCreated)({
    document: 'users/{targetUserId}/followers/{followerId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const { targetUserId, followerId } = event.params;
    if (targetUserId === followerId)
        return;
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
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            else {
                transaction.set(targetUserRef, {
                    uid: targetUserId,
                    followersCount: 1,
                    followingCount: 0,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            if (followerDoc.exists) {
                const prev = Number(followerDoc.data()?.followingCount) || 0;
                transaction.update(followerRef, {
                    followingCount: prev + 1,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            else {
                transaction.set(followerRef, {
                    uid: followerId,
                    followersCount: 0,
                    followingCount: 1,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
        console.log(`Successfully updated follow counters for ${targetUserId}`);
        await updateUserProgressionServer(targetUserId);
    }
    catch (err) {
        console.error(`Error updating follow counters on create:`, err);
        throw err;
    }
});
exports.onUserFollowerDeleted = (0, firestore_2.onDocumentDeleted)({
    document: 'users/{targetUserId}/followers/{followerId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const { targetUserId, followerId } = event.params;
    if (targetUserId === followerId)
        return;
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
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            if (followerDoc.exists) {
                const prev = Number(followerDoc.data()?.followingCount) || 0;
                transaction.update(followerRef, {
                    followingCount: Math.max(0, prev - 1),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        });
        console.log(`Successfully decremented follow counters for ${targetUserId}`);
        await updateUserProgressionServer(targetUserId);
    }
    catch (err) {
        console.error(`Error updating follow counters on delete:`, err);
        throw err;
    }
});
// ============================================================================
// 4. CASCADE DELETION ON PIN REMOVAL
// ============================================================================
exports.onPinDeleted = (0, firestore_2.onDocumentDeleted)({
    document: 'pins/{pinId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
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
                const storagePath = extractStoragePathFromUrl(url, 'pin-images/');
                if (storagePath) {
                    try {
                        await storage.bucket().file(storagePath).delete();
                    }
                    catch (fileErr) {
                        console.warn(`Could not delete storage file ${storagePath}:`, fileErr);
                    }
                }
            }
        }
        // Synchronize progression for author (preserving permanent milestones)
        if (pinData?.userId) {
            await updateUserProgressionServer(pinData.userId);
        }
    }
    catch (err) {
        console.error(`Error in onPinDeleted cleanup for ${pinId}:`, err);
    }
});
// ============================================================================
// 5. EXPLORER PROGRESSION TRIGGERS
// ============================================================================
exports.onPinCreatedProgression = (0, firestore_2.onDocumentCreated)({
    document: 'pins/{pinId}',
    database: exports.FIRESTORE_DATABASE_ID,
    region: exports.FUNCTION_REGION,
}, async (event) => {
    const pinData = event.data?.data();
    if (!pinData)
        return;
    const userId = pinData.userId;
    if (!userId || userId.startsWith('system_') || userId.startsWith('demo_'))
        return;
    console.log(`[Progression Trigger] Processing pin creation for user: ${userId}`);
    try {
        await updateUserProgressionServer(userId);
    }
    catch (err) {
        console.error(`[Progression Trigger] Error updating progression for user ${userId}:`, err);
    }
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
exports.deleteUserAccount = (0, https_1.onCall)({
    region: exports.FUNCTION_REGION,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be signed in.');
    }
    const userId = request.auth.uid;
    console.log(`Starting account deletion for user: ${userId}`);
    try {
        const userPinsSnapshot = await db.collection('pins').where('userId', '==', userId).get();
        for (const pinDoc of userPinsSnapshot.docs) {
            await pinDoc.ref.delete();
        }
        try {
            await storage.bucket().deleteFiles({
                prefix: `profile-images/${userId}/`,
            });
        }
        catch (stErr) {
            console.warn(`Error deleting avatar files for user ${userId}:`, stErr);
        }
        const userRef = db.collection('users').doc(userId);
        await db.recursiveDelete(userRef);
        return { success: true, message: `Account and associated data deleted for user ${userId}` };
    }
    catch (err) {
        console.error(`Failed to delete account for user ${userId}:`, err);
        throw new https_1.HttpsError('internal', err.message || 'Failed to complete account deletion.');
    }
});
//# sourceMappingURL=index.js.map