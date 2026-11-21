import { countTrustedLikes, getDiscoveryBadgeMetrics, isPublishedDiscovery } from './progressionEvidence';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { cleanupPinImages, reconcilePinImages } from './pinImageCleanup';
import { handlePinImageUpload, matchesImageSignature } from './pinImageUpload';
import { discoveryLocationKey, eligibleDiscoveryIds } from './progressionLocation';
import {
  configuredGeographicPolicy, geographicReceiptForPin, MAX_GEOGRAPHY_PINS_PER_UTC_DAY,
  type GeographicPolicy,
} from './geographicProgression';
import {
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
  MetricContext,
} from './progressionConfig';

// Initialize Firebase Admin SDK
initializeApp();

export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';

const db = getFirestore(FIRESTORE_DATABASE_ID);
const storage = getStorage();
const progressionControl = db.doc('progressionMaintenance/writers');
const progressionReset = db.doc('progressionMaintenance/geography-v11-reset');
const progressionGeneration = db.collection('progressionV11');

function progressionWritesEnabled(control: FirebaseFirestore.DocumentSnapshot): boolean {
  const cutoff = control.get('progressionStartsAtMs');
  return control.get('schemaVersion') === 1 && control.get('mode') === 'running' &&
    control.get('generation') === progressionGeneration.id && Number.isSafeInteger(cutoff) && cutoff > 0;
}

export const FUNCTION_REGION = 'europe-west2';

const avatarBucketName = 'rainbyte-studio.firebasestorage.app';
const avatarContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);
const maxAvatarBytes = 10 * 1024 * 1024;

function getAvatarBucket() {
  return process.env.FIREBASE_STORAGE_EMULATOR_HOST ? storage.bucket() : storage.bucket(avatarBucketName);
}

function isExactAvatarGeneration(generation: string) {
  // The Storage SDK converts the scoped generation to a JS number.
  return /^[1-9][0-9]*$/.test(generation) && Number.isSafeInteger(Number(generation));
}

async function deleteAvatarGeneration(name: string, generation: string, metageneration?: string) {
  if (!isExactAvatarGeneration(generation)) {
    throw new Error('Avatar generation cannot be represented exactly.');
  }
  const preconditionOpts = {
    ifGenerationMatch: generation,
    ...(metageneration === undefined ? {} : { ifMetagenerationMatch: metageneration }),
  };
  await getAvatarBucket().file(name, { generation, preconditionOpts }).delete({ ignoreNotFound: true });
}

function parseAvatarReference(value: unknown, uid: string, bucket: string) {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    const prefix = '/v0/b/' + bucket + '/o/';
    if (url.origin !== 'https://firebasestorage.googleapis.com' ||
        url.username || url.password || !url.pathname.startsWith(prefix)) return;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const parts = path.split('/');
    if (parts.length !== 3 || parts[0] !== 'profile-images' || parts[1] !== uid ||
        !parts[2] || parts[2] === '.' || parts[2] === '..') return;
    const generation = /^#generation=([1-9][0-9]*)$/.exec(url.hash)?.[1];
    const tokens = url.searchParams.getAll('token');
    return { path, generation, token: tokens.length === 1 ? tokens[0] : undefined };
  } catch {
    return;
  }
}

export const onUserProfileUpdated = onDocumentUpdated(
  { document: 'users/{userId}', database: FIRESTORE_DATABASE_ID, region: FUNCTION_REGION,
    retry: false, timeoutSeconds: 60, preserveExternalChanges: true },
  async event => {
    const change = event.data;
    if (!change) return;
    const uid = event.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    if (before?.photoURL === after?.photoURL && before?.avatarUrl === after?.avatarUrl) return;

    const bucket = getAvatarBucket();
    const parse = (value: unknown) => parseAvatarReference(value, uid, bucket.name);
    const afterPaths = new Set([parse(after?.photoURL)?.path, parse(after?.avatarUrl)?.path]);
    const replaced = [...new Set([before?.photoURL, before?.avatarUrl])]
      .map(parse)
      .filter(ref => ref && !afterPaths.has(ref.path));
    if (!replaced.length) return;

    // A later profile update may have selected the previous path again.
    const current = (await change.after.ref.get()).data();
    if (!current || current.deletionStatus === 'deleting') return;
    const currentPaths = new Set([parse(current.photoURL)?.path, parse(current.avatarUrl)?.path]);
    for (const ref of replaced) {
      if (!ref || currentPaths.has(ref.path)) continue;
      const unresolved = (reason: string) => console.warn('avatar_cleanup_unresolved', {
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
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code !== 404) {
          unresolved(code === 412 ? 'precondition_changed' : 'storage_operation_failed');
          if (code !== 412) throw error;
        }
      }
    }
  },
);

async function assertAvatarUploadAllowed(uid: string) {
  const [profile, lock] = await db.getAll(
    db.collection('users').doc(uid),
    db.collection('accountDeletionLocks').doc(uid),
  );
  if (!profile.exists || lock.exists || profile.get('deletionStatus') === 'deleting') {
    throw new HttpsError('permission-denied', 'An active profile is required.');
  }
}

export const uploadProfileAvatar = onCall(
  { region: FUNCTION_REGION, timeoutSeconds: 60, memory: '512MiB', concurrency: 2, maxInstances: 8 },
  async request => {
    const uid = request.auth?.uid;
    if (!uid || uid.includes('/') || uid === '.' || uid === '..' ||
        request.auth?.token.firebase?.tenant || request.auth?.token.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'Sign in to upload a profile photo.');
    }
    const { userId, content, contentType } = request.data ?? {};
    if (userId !== uid) {
      throw new HttpsError('permission-denied', 'The signed-in account changed.');
    }
    if (typeof contentType !== 'string' || !avatarContentTypes.has(contentType) ||
        typeof content !== 'string' || !content.length || content.length % 4 !== 0 ||
        content.length > Math.ceil(maxAvatarBytes / 3) * 4) {
      throw new HttpsError('invalid-argument', 'Supply a valid profile image.');
    }
    const bytes = Buffer.from(content, 'base64');
    if (bytes.length > maxAvatarBytes || bytes.toString('base64') !== content ||
        !matchesImageSignature(bytes, contentType)) {
      throw new HttpsError('invalid-argument', 'Invalid profile image data.');
    }

    const bucket = getAvatarBucket();
    const path = 'profile-images/' + uid + '/' + randomUUID();
    const file = bucket.file(path);
    const token = randomUUID();
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
      throw new HttpsError('internal', 'The avatar upload did not return an exact generation.');
    }
    try {
      await assertAvatarUploadAllowed(uid);
    } catch (error) {
      // The finalize trigger and deletion worker cover transport failure or process death.
      await deleteAvatarGeneration(path, generation);
      throw error;
    }
    return {
      downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name +
        '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token + '#generation=' + generation,
    };
  },
);

export const onAccountAvatarFinalized = onObjectFinalized(
  { bucket: avatarBucketName, region: 'us-west1', retry: true, timeoutSeconds: 60 },
  async event => {
    const match = /^profile-images\/([^/]+)\//.exec(event.data.name);
    if (!match || match[1] === '.' || match[1] === '..') return;
    const lock = await db.collection('accountDeletionLocks').doc(match[1]).get();
    if (!lock.exists) return;
    await deleteAvatarGeneration(event.data.name, String(event.data.generation));
  },
);

export const pinImageUpload = onCall(
  { region: FUNCTION_REGION, timeoutSeconds: 60, memory: '512MiB', concurrency: 2, maxInstances: 8 },
  request => handlePinImageUpload(db, () => storage.bucket(), request.auth, request.data),
);

function isActivePin(data: FirebaseFirestore.DocumentData): boolean {
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
export async function updateUserProgressionServer(userId: string) {
  return syncUserProgression(userId);
}

// The policy is supplied by the server or injected directly by emulator tests.
export async function updateProgressionForCreatedPin(
  pin: FirebaseFirestore.DocumentSnapshot, policy?: GeographicPolicy,
) {
  const userId = pin.get('userId');
  if (typeof userId !== 'string' || !userId || userId.startsWith('system_') || userId.startsWith('demo_')) return null;
  return syncUserProgression(userId, { pin, policy });
}

interface PinPublication {
  pin: FirebaseFirestore.DocumentSnapshot;
  policy?: GeographicPolicy;
}

async function syncUserProgression(
  userId: string, publication?: PinPublication, concurrencyRetry = 0,
  originalControlVersion?: FirebaseFirestore.Timestamp,
): Promise<unknown> {
  if (!userId || userId.startsWith('system_') || userId.startsWith('demo_')) return null;

  const control = await progressionControl.get();
  if (!progressionWritesEnabled(control) ||
      (originalControlVersion && !control.updateTime?.isEqual(originalControlVersion))) return null;

  const startsAt: number = control.get('progressionStartsAtMs');

  const configuredPolicy = configuredGeographicPolicy(control.get('geographyStartsAtMs'));
  const policy = publication?.policy ??
    (configuredPolicy && configuredPolicy.startsAtMs >= startsAt ? configuredPolicy : undefined);
  const pin = publication?.pin;
  const receipt = pin && policy && pin.updateTime && pin.createTime?.isEqual(pin.updateTime)
    ? geographicReceiptForPin(pin, userId, policy)
    : undefined;
  const requiresResetProof = !publication?.policy;
  const reset = receipt && requiresResetProof ? await progressionReset.get() : undefined;
  const resetVerified = reset?.createTime && policy &&
    reset.createTime.toMillis() < policy.startsAtMs &&
    reset.get('resetVersion') === 1 && reset.get('generation') === progressionGeneration.id;
  const geographic = pin && receipt && policy && (!requiresResetProof || resetVerified)
    ? { pin, receipt, policy }
    : undefined;

  // Do not rebuild deleted users' profiles when delayed Firestore triggers arrive.
  const deletionLockRef = db.collection('accountDeletionLocks').doc(userId);
  if ((await deletionLockRef.get()).exists) return null;
  if (!(await db.collection('users').doc(userId).get()).exists) return null;

  // Establish the version before reading the metrics it protects.
  const generation = progressionGeneration.doc(userId);
  const summaryRef = generation.collection('state').doc('summary');
  const summarySnap = await summaryRef.get();
  const existingSummary = summarySnap.exists ? summarySnap.data() : null;

  // 1. Fetch user's active pins (excluding deleted or reported)
  const pinsSnap = await db.collection('pins').where('userId', '==', userId).get();
  const validPins: any[] = [];
  let profilePinsCount = 0;
  pinsSnap.forEach((doc) => {
    const data = doc.data();
    if (isActivePin(data)) {
      profilePinsCount++;
      if (doc.createTime.toMillis() < startsAt) return;
      const tags = Array.isArray(data.tags)
        ? data.tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        : [];
      validPins.push({ ...data, id: doc.id, tags });
    }
  });

  const activeSpotsCount = validPins.length;

  // Shared counters can have been updated by a legacy revision. For rewards,
  // count actual relationship records created after the generation cutoff.
  const userRef = db.collection('users').doc(userId);
  const [userDoc, followers] = await Promise.all([
    userRef.get(), userRef.collection('followers').get(),
  ]);
  const userData = userDoc.exists ? userDoc.data() : null;
  const followersCount = followers.docs.filter(doc => doc.createTime.toMillis() >= startsAt).length;

  let likesReceived = 0;
  const generationPins = pinsSnap.docs.filter(doc => doc.createTime.toMillis() >= startsAt && isActivePin(doc.data()));
  for (const published of generationPins) {
    const likes = await published.ref.collection('likes').get();
    likesReceived += likes.docs.filter(doc => doc.createTime.valueOf() >= published.createTime.valueOf()).length;
  }

  // Category metrics across current active spots
  let hiddenGemsCount = 0;
  let foodCount = 0;
  let natureCount = 0;

  validPins.forEach((pin) => {
    const cat = typeof pin.category === 'string' ? pin.category.toLowerCase() : '';
    if (cat.includes('hidden') || cat.includes('gem')) hiddenGemsCount++;
    if (cat.includes('food')) foodCount++;
    if (cat.includes('nature')) natureCount++;
  });

  // Profile completeness (avatar, bio >= 10 chars, at least 1 spot)
  let profileCompletePoints = 0;
  if (userData?.avatarUrl || userData?.photoURL) profileCompletePoints++;
  if (typeof userData?.bio === 'string' && userData.bio.trim().length >= 10) profileCompletePoints++;

  const xpEventsCol = generation.collection('xpEvents');
  const existingEventsSnap = await xpEventsCol.get();
  const existingEventIds = new Set<string>();
  const richLocations = new Set<string>();
  const richDescriptions = new Set<string>();
  const { richCandidates, ...discoveryMetrics } = getDiscoveryBadgeMetrics(validPins);
  const earnedAchievementEvents = new Map<string, FirebaseFirestore.DocumentData>();
  let historicalLedgerXp = 0;
  let historicalSpotsCount = 0;
  const historicalCitiesSet = new Set<string>();
  const historicalCountriesSet = new Set<string>();
  const verifiedCities = new Set<string>();
  const verifiedCountries = new Set<string>();
  const awardedGeographicPinsToday = new Set<string>();

  existingEventsSnap.forEach((doc) => {
    existingEventIds.add(doc.id);
    const data = doc.data();
    historicalLedgerXp += Number(data?.xpEarned) || 0;
    if (doc.id.startsWith('achievement:')) earnedAchievementEvents.set(doc.id, data);
    if (doc.id.startsWith('rich_discovery:')) {
      const current = richCandidates.get(doc.id.slice('rich_discovery:'.length));
      const locationKey = data?.locationKey ?? current?.locationKey;
      const descriptionKey = data?.descriptionKey ?? current?.descriptionKey;
      if (typeof locationKey === 'string') richLocations.add(locationKey);
      if (typeof descriptionKey === 'string') richDescriptions.add(descriptionKey);
    }

    if (doc.id.startsWith('pin_created:')) {
      historicalSpotsCount++;
    } else if (doc.id.startsWith('geo_v1:city:') || doc.id.startsWith('geo_v1:country:')) {
      const verified = doc.id.startsWith('geo_v1:city:') ? verifiedCities : verifiedCountries;
      verified.add(doc.id);
      const receipt = data.geographicReceipt;
      if (geographic && receipt?.schemaVersion === 2 && receipt.publishedDay === geographic.receipt.publishedDay &&
          typeof receipt.pinId === 'string') {
        awardedGeographicPinsToday.add(receipt.pinId);
      }
    } else if (doc.id.startsWith('city_first:')) {
      const cityRef = (typeof data.referenceId === 'string' && data.referenceId.trim() ||
        doc.id.slice('city_first:'.length)).trim().toLowerCase();
      historicalCitiesSet.add(cityRef);
    } else if (doc.id.startsWith('country_first:')) {
      const countryRef = (typeof data.referenceId === 'string' && data.referenceId.trim() ||
        doc.id.slice('country_first:'.length)).trim().toUpperCase();
      historicalCountriesSet.add(countryRef);
    }
  });

  const pendingXpEvents: { id: string; event: any }[] = [];
  // Geography high-water marks survive deletes and historical partial ledgers.
  // HISTORICAL MONOTONIC METRICS: Must never decrease!
  const prevSpots = Number(existingSummary?.totalSpotsCount) || 0;
  const lifetimeSpotsCount = Math.max(prevSpots, historicalSpotsCount, activeSpotsCount);

  const prevCities = Number(existingSummary?.citiesCount) || 0;
  const prevCountries = Number(existingSummary?.countriesCount) || 0;

  // Legacy labels and summary-only counts cannot safely be mapped to canonical
  // places. Keep that dimension frozen for affected accounts.
  const qualifyCities = !historicalCitiesSet.size && prevCities <= verifiedCities.size;
  const qualifyCountries = !historicalCountriesSet.size && prevCountries <= verifiedCountries.size;
  const canRewardPin = geographic && !awardedGeographicPinsToday.has(geographic.receipt.pinId) &&
    awardedGeographicPinsToday.size < MAX_GEOGRAPHY_PINS_PER_UTC_DAY;
  if (geographic && canRewardPin) {
    const { receipt } = geographic;
    const addGeographicReward = (id: string, referenceId: string, city: boolean, earned: Set<string>) => {
      if (existingEventIds.has(id)) return;
      earned.add(id);
      pendingXpEvents.push({
        id,
        event: {
          id, userId, referenceId,
          action: city ? 'UNIQUE_CITY' : 'UNIQUE_COUNTRY',
          xpEarned: city ? PROGRESSION_CONSTANTS.UNIQUE_CITY_BONUS_XP : PROGRESSION_CONSTANTS.UNIQUE_COUNTRY_BONUS_XP,
          description: city ? 'First catalog city' : 'First catalog country',
          createdAt: new Date().toISOString(),
          geographicReceipt: receipt,
        },
      });
    };
    if (qualifyCities && receipt.cityId) {
      const id = `${receipt.countryCode}:${receipt.cityId}`;
      addGeographicReward(`geo_v1:city:${id}`, id, true, verifiedCities);
    }
    if (qualifyCountries) {
      addGeographicReward(`geo_v1:country:${receipt.countryCode}`, receipt.countryCode, false, verifiedCountries);
    }
  }
  const lifetimeCitiesCount = Math.max(prevCities, historicalCitiesSet.size, verifiedCities.size);
  const lifetimeCountriesCount = Math.max(prevCountries, historicalCountriesSet.size, verifiedCountries.size);

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

  // Pay for rich discoveries once per location and normalized description.
  for (const pin of validPins) {
    const evidence = richCandidates.get(pin.id);
    if (!evidence) continue;
    const eventId = getRichDiscoveryEventId(pin.id);
    if (existingEventIds.has(eventId) ||
        richLocations.has(evidence.locationKey) || richDescriptions.has(evidence.descriptionKey)) continue;
    pendingXpEvents.push({
      id: eventId,
      event: {
        id: eventId,
        userId,
        action: 'RICH_DISCOVERY',
        referenceId: pin.id,
        ...evidence,
        xpEarned: PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP,
        description: `Detailed guide bonus for: ${pin.title || 'Spot'}`,
        createdAt: pin.createdAt || new Date().toISOString(),
      },
    });
    richLocations.add(evidence.locationKey);
    richDescriptions.add(evidence.descriptionKey);
  }

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
  const achievementsCol = generation.collection('achievements');
  const existingAchSnap = await achievementsCol.get();
  const existingMap = new Map<string, any>();
  existingAchSnap.forEach((d) => existingMap.set(d.id, d.data()));

  // Some historical summaries contain earned XP that predates the ledger.
  const earnedXpBefore = Math.max(Number(existingSummary?.xp) || 0, historicalLedgerXp);
  const trustedVoice = ACHIEVEMENTS_CATALOG.find(item => item.id === 'trusted_voice')!;
  const trustedLikeCount = existingMap.get(trustedVoice.id)?.isUnlocked ||
    earnedAchievementEvents.has(getAchievementEventId(trustedVoice.id))
    ? trustedVoice.target
    : await countTrustedLikes(db, userId, generationPins, trustedVoice.target);
  const metricContext: MetricContext = {
    totalSpots: lifetimeSpotsCount,       // Historical lifetime spots
    citiesCount: verifiedCities.size,
    countriesCount: verifiedCountries.size,
    likesReceived,                       // Dynamic live likes
    followersCount,                      // Dynamic live followers
    hiddenGemsCount,
    foodCount,
    natureCount,
    ...discoveryMetrics,
    trustedLikeCount,
    profileCompletePoints,
    level: getProgressForXp(earnedXpBefore).level,
  };

  let unlockedCount = 0;
  const pendingAchievements: any[] = [];

  const awardAchievement = (item: (typeof ACHIEVEMENTS_CATALOG)[number]) => {
    const existing = existingMap.get(item.id);
    const achEventId = getAchievementEventId(item.id);
    const earnedEvent = earnedAchievementEvents.get(achEventId);
    const alreadyUnlocked = Boolean(existing?.isUnlocked || earnedEvent);
    const isGeography = item.category === 'Geography';
    const canAwardGeography = Boolean(canRewardPin && (
      item.geographicDimension === 'city' ? qualifyCities :
        item.geographicDimension === 'country' && qualifyCountries
    ));
    const calculatedMetric = isGeography && !canAwardGeography ? 0 : item.metric(metricContext);
    const isPhoto = item.id === 'visual_storyteller';
    const previousProgress = Number(existing?.progress) || 0;
    const legacyPhotoProgress = isPhoto
      ? Number(existing?.legacyPhotoProgress ?? previousProgress) || 0
      : 0;
    const qualifiedPrevious = isPhoto ? Number(existing?.qualifiedPhotoProgress) || 0 : previousProgress;
    const preservedProgress = item.category === 'Community' ? 0 : qualifiedPrevious;
    const progress = Math.min(item.target, Math.max(preservedProgress, calculatedMetric));
    const isUnlocked = alreadyUnlocked || (isGeography
      ? canAwardGeography && calculatedMetric >= item.target
      : progress >= item.target);
    const now = new Date().toISOString();
    const unlockedAt = isUnlocked ? (existing?.unlockedAt || earnedEvent?.createdAt || now) : null;
    const tier = alreadyUnlocked
      ? existing?.tier ?? earnedEvent?.achievementTier ?? (item.id === 'pioneer_voyager' ? 'platinum' : item.tier)
      : item.tier;
    const xpReward = alreadyUnlocked ? (earnedEvent?.xpEarned ?? existing?.xpReward ?? item.xpReward) : item.xpReward;

    if (isUnlocked) unlockedCount++;
    if (isUnlocked && !alreadyUnlocked) {
      pendingXpEvents.push({
        id: achEventId,
        event: {
          id: achEventId,
          userId,
          action: 'ACHIEVEMENT_UNLOCKED',
          referenceId: item.id,
          xpEarned: xpReward,
          achievementTier: tier,
          description: `Unlocked achievement: ${item.title}`,
          createdAt: unlockedAt,
        },
      });
    }

    pendingAchievements.push({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      iconName: item.iconName,
      tier,
      xpReward,
      progress: isUnlocked ? item.target : progress,
      ...(isPhoto ? { legacyPhotoProgress, qualifiedPhotoProgress: progress } : {}),
      target: item.target,
      isUnlocked,
      unlockedAt,
      updatedAt: now,
    });
  };

  const levelBadges = ACHIEVEMENTS_CATALOG.filter(item => item.requiresLevel).sort((a, b) => a.target - b.target);
  for (const item of ACHIEVEMENTS_CATALOG) {
    if (!item.requiresLevel) awardAchievement(item);
  }
  // Assess each level award against earned XP plus eligible awards already queued.
  for (const item of levelBadges) {
    const pendingXp = pendingXpEvents.reduce((xp, { event }) => xp + Number(event.xpEarned), 0);
    metricContext.level = getProgressForXp(earnedXpBefore + pendingXp).level;
    awardAchievement(item);
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
  let result: 'written' | 'skip';
  try {
    result = await db.runTransaction(async (transaction) => {
      const [lockSnap, profileSnap, latestSummarySnap, latestControl] = await transaction.getAll(
        deletionLockRef, userProfileRef, summaryRef, progressionControl,
      );
      // An invocation started before the freeze cannot commit after a freeze/resume cycle.
      if (!progressionWritesEnabled(latestControl) ||
          !latestControl.updateTime?.isEqual(control.updateTime!)) return 'skip';
      if (lockSnap.exists || !profileSnap.exists) return 'skip';

      // The XP ledger and summary were calculated outside the transaction.
      // If another trigger committed a progression update in the meantime,
      // abort and recalculate from the fresh ledger rather than overwrite it.
      const expectedVersion = summarySnap.updateTime;
      const currentVersion = latestSummarySnap.updateTime;
      if (expectedVersion ? !currentVersion?.isEqual(expectedVersion) : currentVersion) {
        throw new Error('PROGRESSION_STALE_SNAPSHOT');
      }
      if (geographic && canRewardPin) {
        if (reset) {
          const latestReset = await transaction.get(progressionReset);
          if (!latestReset.updateTime?.isEqual(reset.updateTime!)) return 'skip';
        }
        const { pin, policy, receipt } = geographic;
        const incarnation = pin.get('imageIncarnation');
        const [currentPin, publishReceipt, imageClaim] = await transaction.getAll(
          pin.ref,
          userProfileRef.collection('pinPublishReceipts').doc(pin.id),
          db.collection('pinImageClaims').doc(incarnation),
        );
        const currentReceipt = geographicReceiptForPin(currentPin, userId, policy);
        if (!currentPin.createTime?.isEqual(pin.createTime!) ||
            !publishReceipt.createTime?.isEqual(pin.createTime!) ||
            currentReceipt?.cityId !== receipt.cityId || currentReceipt.countryCode !== receipt.countryCode ||
            currentPin.get('imageIncarnation') !== incarnation ||
            imageClaim.get('protocol') !== 'server-v1' || imageClaim.get('pinId') !== pin.id ||
            imageClaim.get('userId') !== userId ||
            JSON.stringify(imageClaim.get('imageUrls')) !== JSON.stringify(currentPin.get('imageUrls'))) {
          throw new Error('PROGRESSION_GEOGRAPHIC_PIN_CHANGED');
        }
      }

      transaction.set(summaryRef, summary, { merge: true });
      transaction.update(userProfileRef, {
        pinsCount: profilePinsCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const achievement of pendingAchievements) {
        transaction.set(achievementsCol.doc(achievement.id), achievement, { merge: true });
      }
      for (const { id, event } of pendingXpEvents) {
        transaction.create(xpEventsCol.doc(id), event);
      }
      return 'written';
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PROGRESSION_STALE_SNAPSHOT' && concurrencyRetry < 5) {
      return syncUserProgression(userId, publication, concurrencyRetry + 1, control.updateTime);
    }
    if (error instanceof Error && error.message === 'PROGRESSION_GEOGRAPHIC_PIN_CHANGED') {
      return syncUserProgression(userId, undefined, concurrencyRetry, control.updateTime);
    }
    throw error;
  }
  if (result === 'skip') return null;
  console.log(`[Progression Server] Authoritatively synchronized user ${userId}: Level ${finalLevelInfo.level} (${finalLevelInfo.title}), ${finalTotalXp} XP, ${unlockedCount} achievements.`);
  return summary;
}

// ============================================================================
// 1–3. SOCIAL COUNTERS
// ============================================================================

async function syncPinCounter(pinId: string, collection: 'likes' | 'comments') {
  const pinRef = db.collection('pins').doc(pinId);
  const field = collection === 'likes' ? 'likeCount' : 'commentCount';
  const authorId = await db.runTransaction(async transaction => {
    const pin = await transaction.get(pinRef);
    if (!pin.exists) return;
    const count = await transaction.get(pinRef.collection(collection).count());
    const canonicalCount = count.data().count;
    if (pin.get(field) !== canonicalCount) {
      transaction.update(pinRef, { [field]: canonicalCount, updatedAt: FieldValue.serverTimestamp() });
    }
    return pin.get('userId');
  });
  if (collection === 'likes' && typeof authorId === 'string' && authorId) {
    await updateUserProgressionServer(authorId);
  }
}

const likesTrigger = {
  document: 'pins/{pinId}/likes/{userId}',
  database: FIRESTORE_DATABASE_ID,
  region: FUNCTION_REGION,
  retry: false,
} as const;

export const onPinLikeCreated = onDocumentCreated(likesTrigger, event => syncPinCounter(event.params.pinId, 'likes'));
export const onPinLikeDeleted = onDocumentDeleted(likesTrigger, event => syncPinCounter(event.params.pinId, 'likes'));

const commentsTrigger = {
  document: 'pins/{pinId}/comments/{commentId}',
  database: FIRESTORE_DATABASE_ID,
  region: FUNCTION_REGION,
  retry: false,
} as const;

export const onPinCommentCreated = onDocumentCreated(commentsTrigger, event => syncPinCounter(event.params.pinId, 'comments'));
export const onPinCommentDeleted = onDocumentDeleted(commentsTrigger, event => syncPinCounter(event.params.pinId, 'comments'));

async function syncFollowCounters(targetUserId: string, followerId: string) {
  if (targetUserId === followerId) return;
  const targetRef = db.collection('users').doc(targetUserId);
  const followerRef = db.collection('users').doc(followerId);
  await db.runTransaction(async transaction => {
    const [target, follower] = await transaction.getAll(targetRef, followerRef);
    const [followers, following] = await Promise.all([
      target.exists ? transaction.get(targetRef.collection('followers').count()) : undefined,
      follower.exists ? transaction.get(followerRef.collection('following').count()) : undefined,
    ]);
    if (followers && target.get('followersCount') !== followers.data().count) {
      transaction.update(targetRef, { followersCount: followers.data().count, updatedAt: FieldValue.serverTimestamp() });
    }
    if (following && follower.get('followingCount') !== following.data().count) {
      transaction.update(followerRef, { followingCount: following.data().count, updatedAt: FieldValue.serverTimestamp() });
    }
  });
  await updateUserProgressionServer(targetUserId);
}

const followersTrigger = {
  document: 'users/{targetUserId}/followers/{followerId}',
  database: FIRESTORE_DATABASE_ID,
  region: FUNCTION_REGION,
  retry: false,
} as const;

export const onUserFollowerCreated = onDocumentCreated(followersTrigger, event =>
  syncFollowCounters(event.params.targetUserId, event.params.followerId));
export const onUserFollowerDeleted = onDocumentDeleted(followersTrigger, event =>
  syncFollowCounters(event.params.targetUserId, event.params.followerId));

// ============================================================================
// 4. CASCADE DELETION ON PIN REMOVAL
// ============================================================================

function scheduledWorker(timeoutSeconds: number, run: () => Promise<void>) {
  // Cloud Run IAM authenticates the Scheduler OIDC identity. Headers are not credentials.
  return onRequest({
    region: FUNCTION_REGION, timeoutSeconds, concurrency: 1, maxInstances: 1, invoker: 'private',
  }, async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').sendStatus(405);
      return;
    }
    try {
      await run();
      res.status(204).end();
    } catch (error) {
      console.error('Scheduled worker failed', { error });
      res.sendStatus(500);
    }
  });
}

export const reconcilePinImageCleanup = scheduledWorker(
  60, () => reconcilePinImages(db, () => storage.bucket()),
);

export const onPinDeleted = onDocumentDeleted(
  {
    document: 'pins/{pinId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
    retry: false,
  },
  async (event) => {
    const pinId = event.params.pinId;
    const deletedPin = event.data;
    const authorId = deletedPin?.data()?.userId;
    const pinRef = db.collection('pins').doc(pinId);
    const createdAt = deletedPin?.createTime;
    const lastUpdatedAt = deletedPin?.updateTime;

    const cleanup = async () => {
      if (!createdAt || !lastUpdatedAt) return;
      for (const name of ['likes', 'comments']) {
        const children = await pinRef.collection(name).get();
        for (let offset = 0; offset < children.docs.length; offset += 200) {
          const group = children.docs.slice(offset, offset + 200);
          const recreated = await db.runTransaction(async transaction => {
            if ((await transaction.get(pinRef)).exists) return true;
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
          if (recreated) return;
        }
      }
    };

    const results = await Promise.allSettled([
      cleanup(),
      deletedPin ? cleanupPinImages(db, () => storage.bucket(), deletedPin, event.id) : Promise.resolve(),
      typeof authorId === 'string' ? updateUserProgressionServer(authorId) : Promise.resolve(),
    ]);
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Pin deletion processing failed for ' + pinId);
  }
);

// ============================================================================
// 5. EXPLORER PROGRESSION TRIGGERS
// ============================================================================

export const onPinCreatedProgression = onDocumentCreated(
  {
    document: 'pins/{pinId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
    retry: false,
  },
  async (event) => {
    if (event.data) await updateProgressionForCreatedPin(event.data);
  }
);

export const onPinUpdatedProgression = onDocumentUpdated(
  {
    document: 'pins/{pinId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
    retry: false,
  },
  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || typeof after.userId !== 'string') return;
    const wasPublished = isPublishedDiscovery(before);
    const isPublished = isPublishedDiscovery(after);
    if (wasPublished !== isPublished || (isPublished && (
      before.title !== after.title || before.category !== after.category ||
      before.description !== after.description ||
      JSON.stringify(before.tags) !== JSON.stringify(after.tags) ||
      JSON.stringify(before.imageUrls) !== JSON.stringify(after.imageUrls)
    ))) {
      await updateUserProgressionServer(after.userId);
    }
  },
);

export const onUserProfileUpdatedProgression = onDocumentUpdated(
  {
    document: 'users/{userId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
    retry: false,
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

type DeletionPhase = 'likes' | 'comments' | 'legacyLikes' | 'following' | 'followers' |
  'reporterReports' | 'targetReports' | 'pins' | 'avatars' | 'profile' | 'auth' | 'verifyAvatars';

const deletionPhases: DeletionPhase[] = [
  'likes', 'comments', 'legacyLikes', 'following', 'followers',
  'reporterReports', 'targetReports', 'pins', 'avatars', 'profile', 'auth', 'verifyAvatars',
];

async function updateAccountReportPage(
  userId: string,
  mode: 'reporterReports' | 'targetReports',
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
) {
  await db.runTransaction(async transaction => {
    const reports = await transaction.getAll(...docs.map(report => report.ref));
    for (const report of reports) {
      if (mode === 'reporterReports' && report.get('reporterId') === userId &&
          (report.get('reporterEmail') !== undefined || !report.get('reporterDeletedAt'))) {
        transaction.update(report.ref, {
          reporterEmail: FieldValue.delete(),
          reporterDeletedAt: FieldValue.serverTimestamp(),
        });
      }
      if (mode === 'targetReports' && report.get('targetId') === userId &&
          report.get('targetType') === 'user' && report.get('status') === 'pending') {
        transaction.update(report.ref, {
          status: 'resolved',
          resolvedReason: 'target_account_deleted',
          resolvedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  });
}

export async function cleanAccountReports(userId: string) {
  const reports = db.collection('reports');
  await forEachAccountDeletionPage(reports.where('reporterId', '==', userId),
    docs => updateAccountReportPage(userId, 'reporterReports', docs));
  await forEachAccountDeletionPage(reports.where('targetId', '==', userId),
    docs => updateAccountReportPage(userId, 'targetReports', docs));
}

// Each phase advances only after the side effects succeed. A missing cursor means
// the phase is drained. Destructive pages re-read from the front after a retry.
async function deleteAccountPage(userId: string, phase: DeletionPhase, cursor?: string): Promise<string | null> {
  const user = db.collection('users').doc(userId);
  const pins = db.collection('pins');
  switch (phase) {
    case 'likes':
    case 'comments': {
      const page = await db.collectionGroup(phase).where('userId', '==', userId).limit(100).get();
      if (page.empty) return null;
      const batch = db.batch();
      for (const entry of page.docs) batch.delete(entry.ref, { lastUpdateTime: entry.updateTime });
      await batch.commit();
      return '';
    }
    case 'legacyLikes': {
      const query = pins.orderBy('__name__').limit(100);
      const page = await (cursor ? query.startAfter(cursor) : query).get();
      if (page.empty) return null;
      await db.runTransaction(async tx => {
        const likes = await tx.getAll(...page.docs.map(pin => pin.ref.collection('likes').doc(userId)));
        for (const like of likes) {
          if (like.exists && (!like.get('userId') || like.get('userId') === userId)) tx.delete(like.ref);
        }
      });
      return page.docs.at(-1)!.id;
    }
    case 'following':
    case 'followers': {
      const page = await user.collection(phase).limit(100).get();
      if (page.empty) return null;
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
      if (page.empty) return null;
      await updateAccountReportPage(userId, phase, page.docs);
      return page.docs.at(-1)!.id;
    }
    case 'pins': {
      const page = await pins.where('userId', '==', userId).limit(1).get();
      if (page.empty) return null;
      const pin = page.docs[0].ref;
      await db.runTransaction(async tx => {
        const current = await tx.get(pin);
        if (current.get('userId') !== userId) return;
        const [likes, comments] = await Promise.all([
          tx.get(pin.collection('likes').limit(100)),
          tx.get(pin.collection('comments').limit(100)),
        ]);
        if (likes.empty && comments.empty) {
          tx.delete(pin);
          return;
        }
        for (const child of [...likes.docs, ...comments.docs]) tx.delete(child.ref);
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
      if (!files.length) return null;
      for (const file of files) {
        const generation = file.metadata.generation;
        if (!generation) throw new Error('Avatar object generation is missing.');
        await deleteAvatarGeneration(file.name, String(generation));
      }
      return '';
    }
    case 'profile':
      // The tombstone remains present even if recursiveDelete only partly succeeds.
      await db.recursiveDelete(progressionGeneration.doc(userId));
      await db.recursiveDelete(user);
      return null;
    case 'auth':
      try {
        await getAuth().deleteUser(userId);
      } catch (error) {
        if ((error as { code?: string })?.code !== 'auth/user-not-found') throw error;
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

function initializeDeletionJob(now: number) {
  return {
    phase: 'likes',
    readyAt: Timestamp.fromMillis(now),
    avatarDrainUntil: Timestamp.fromMillis(now + avatarDrainMs),
    leaseOwner: FieldValue.delete(),
    cursor: FieldValue.delete(),
    progressedAt: FieldValue.serverTimestamp(),
  };
}

async function adoptLegacyDeletionJobs(stopAt: number) {
  // An ordered readyAt query cannot see older records that lack the field.
  // Paginate by document ID independently of queue ordering.
  const checkpoint = db.collection('_maintenance').doc('accountDeletionLegacyScan');
  const cursor = (await checkpoint.get()).get('cursor');
  const scan = deletionLocks.where('status', '==', 'deleting').orderBy('__name__').limit(25);
  const page = await (typeof cursor === 'string' ? scan.startAfter(cursor) : scan).get();
  let lastScanned: string | null = null;
  for (const candidate of page.docs) {
    if (Date.now() >= stopAt) break;
    lastScanned = candidate.id;
    if (candidate.get('phase') !== undefined || candidate.get('readyAt') !== undefined) continue;
    await db.runTransaction(async tx => {
      const lock = await tx.get(candidate.ref);
      if (lock.get('status') !== 'deleting' || lock.get('phase') !== undefined ||
          lock.get('readyAt') !== undefined || lock.get('leaseOwner') !== undefined) return;
      tx.update(lock.ref, initializeDeletionJob(Date.now()));
    });
  }
  // Keep the scan monotonic even if a scheduler delivery overlaps a retry.
  await db.runTransaction(async tx => {
    const state = await tx.get(checkpoint);
    if (state.get('cursor') !== cursor) return;
    const reachedEnd = page.empty || lastScanned === page.docs[page.size - 1].id;
    if (!reachedEnd && lastScanned === null) return;
    tx.set(checkpoint, { cursor: reachedEnd && page.size < 25 ? null : lastScanned });
  });
}

async function resumeAccountDeletion(ref: FirebaseFirestore.DocumentReference, stopAt: number) {
  const owner = randomUUID();
  const leased = await db.runTransaction(async tx => {
    const [current, control] = await tx.getAll(ref, progressionControl);
    if (!progressionWritesEnabled(control)) return false;
    const now = Date.now();
    const due = current.get('readyAt');
    if (current.get('status') !== 'deleting' || !current.get('phase') ||
        !(due instanceof Timestamp) || due.toMillis() > now) return false;
    const drain = current.get('avatarDrainUntil');
    const drainUntil = drain instanceof Timestamp ? drain : Timestamp.fromMillis(now + avatarDrainMs);
    if (current.get('phase') === 'verifyAvatars' && drainUntil.toMillis() > now) {
      tx.update(ref, { readyAt: drainUntil, avatarDrainUntil: drainUntil, leaseOwner: FieldValue.delete() });
      return false;
    }
    // A crashed invocation becomes eligible only after its execution window.
    tx.update(ref, {
      leaseOwner: owner,
      readyAt: Timestamp.fromMillis(now + deletionLeaseMs),
      avatarDrainUntil: drainUntil,
    });
    return true;
  });
  if (!leased) return;

  let retryDelay = 0;
  try {
    while (Date.now() < stopAt) {
      const current = await ref.get();
      if (current.get('leaseOwner') !== owner || current.get('readyAt').toMillis() <= Date.now()) return;
      const phase = current.get('phase') as DeletionPhase;
      const index = deletionPhases.indexOf(phase);
      if (index === -1) throw new Error('Unknown account deletion phase.');
      const nextCursor = await deleteAccountPage(ref.id, phase, current.get('cursor'));
      const done = phase === 'verifyAvatars' && nextCursor === null;
      const drainUntil = current.get('avatarDrainUntil') as Timestamp;
      const park = phase === 'auth' && drainUntil.toMillis() > Date.now();
      const advanced = await db.runTransaction(async tx => {
        const lock = await tx.get(ref);
        if (lock.get('leaseOwner') !== owner || lock.get('readyAt').toMillis() <= Date.now()) return false;
        tx.update(ref, done ? {
          status: 'deleted',
          completedAt: FieldValue.serverTimestamp(),
          progressedAt: FieldValue.serverTimestamp(),
          phase: FieldValue.delete(),
          cursor: FieldValue.delete(),
          readyAt: FieldValue.delete(),
          leaseOwner: FieldValue.delete(),
        } : {
          phase: nextCursor === null ? deletionPhases[index + 1] : phase,
          cursor: nextCursor || FieldValue.delete(),
          ...(park ? { readyAt: drainUntil, leaseOwner: FieldValue.delete() } : {}),
          progressedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!advanced || done || park) return;
    }
  } catch (error) {
    retryDelay = 5 * 60_000;
    console.error('Account deletion worker failed', { userId: ref.id, error });
  } finally {
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).get('leaseOwner') !== owner) return;
      tx.update(ref, {
        leaseOwner: FieldValue.delete(),
        readyAt: Timestamp.fromMillis(Date.now() + retryDelay),
      });
    });
  }
}

export const reconcileAccountDeletion = scheduledWorker(
  deletionWorkerTimeoutSeconds,
  async () => {
    if (!progressionWritesEnabled(await progressionControl.get())) return;
    const stopAt = Date.now() + 40_000;
    // Enable only after the synchronous legacy writer and its invocations drain.
    if (process.env.ACCOUNT_DELETION_LEGACY_ADOPTION === 'true') {
      try {
        await adoptLegacyDeletionJobs(Date.now() + 5_000);
      } catch (error) {
        console.error('Account deletion legacy scan failed', error);
      }
    }
    const ready = deletionLocks.where('readyAt', '<=', Timestamp.now()).orderBy('readyAt').limit(10);
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (Date.now() < stopAt) {
      const page = await (cursor ? ready.startAfter(cursor) : ready).get();
      for (const job of page.docs) {
        if (Date.now() >= stopAt) return;
        if (job.get('status') !== 'deleting' || !job.get('phase') ||
            !(job.get('readyAt') instanceof Timestamp)) continue;
        try {
          await resumeAccountDeletion(job.ref, Math.min(stopAt, Date.now() + 5_000));
        } catch (error) {
          console.error('Account deletion lease operation failed', { userId: job.id, error });
        }
      }
      if (page.size < 10) return;
      cursor = page.docs.at(-1);
    }
  },
);

export const deleteUserAccount = onCall(
  {
    region: FUNCTION_REGION,
    preserveExternalChanges: true,
  },
  async (request) => {
    if (!request.auth || request.auth.token.firebase?.tenant) {
      throw new HttpsError('unauthenticated', 'A Heyroq account must be signed in.');
    }

    const userId = request.auth.uid;
    if (!userId || userId.includes('/') || userId === '.' || userId === '..') {
      throw new HttpsError('permission-denied', 'Invalid account.');
    }

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
    if (!Number.isFinite(authTimeSec) || authTimeSec <= 0 || authTimeSec > nowSec ||
        nowSec - authTimeSec > MAX_RECENT_AUTH_AGE_SEC) {
      throw new HttpsError(
        'failed-precondition',
        'RECENT_LOGIN_REQUIRED: Please reauthenticate before deleting your account.'
      );
    }

    const ref = deletionLocks.doc(userId);
    const status = await db.runTransaction(async tx => {
      const [lock, control] = await tx.getAll(ref, progressionControl);
      if (lock.get('status') === 'deleted') return 'deleted';
      if (lock.get('status') === 'deleting') return 'deleting';
      if (!progressionWritesEnabled(control)) {
        throw new HttpsError('unavailable', 'Account deletion is temporarily paused for maintenance.');
      }
      if (lock.exists) throw new HttpsError('failed-precondition', 'Deletion state requires support.');
      tx.set(ref, {
        status: 'deleting',
        startedAt: FieldValue.serverTimestamp(),
        ...initializeDeletionJob(Date.now()),
      }, { merge: true });
      return 'deleting';
    });
    return { success: status === 'deleted', status };
  }
);
