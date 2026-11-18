import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  getCountFromServer,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Pin, Comment, Report, LatLngBounds, PinCategory } from '../types';
import {
  normalizeCategory,
  getCategoryQueryVariants,
} from '../utils/categoryUtils';
import { deletePinImages } from './storageService';
import {
  computeGeohash,
  getBoundsCenterAndRadius,
  getGeohashRanges,
  isPointInBounds,
} from '../utils/geo';
import { sortPins } from '../utils/sortUtils';

export function formatDocDate(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val.seconds) return new Date(val.seconds * 1000).toISOString();
  return new Date().toISOString();
}

const PINS_COLLECTION = 'pins';
const USERS_COLLECTION = 'users';
const REPORTS_COLLECTION = 'reports';

// Production Heyroq: SEED_PINS removed. All pins are derived strictly from real Firestore data.
export const SEED_PINS_WITH_IDS: Pin[] = [];

// Optional memory cache for offline exploration/smooth rendering
let cachedPinsSnapshot: Pin[] = [];

// Session-level cache of queried geohash ranges and discovered pin records
const queriedGeohashRanges = new Set<string>();
const sessionMemoryPinMap = new Map<string, Pin>();
let activeViewportRequestId = 0;

/**
 * Seeds session memory pin map with authoritative pins from any source
 * (e.g. discovery listener, user pins, or search).
 */
export function seedSessionPins(pins: Pin[]): void {
  if (!pins || !Array.isArray(pins)) return;
  pins.forEach((p) => {
    if (p && p.id) {
      sessionMemoryPinMap.set(p.id, p);
    }
  });
}

/**
 * Authoritatively evicts a pin from all session-level and in-memory caches.
 */
export function evictSessionPin(pinId: string): void {
  if (!pinId) return;
  sessionMemoryPinMap.delete(pinId);
  cachedPinsSnapshot = cachedPinsSnapshot.filter((p) => p.id !== pinId);
  hydratedCommentCountPinIds.delete(pinId);
}

// No-op for production: pins are created organically by real users
export async function seedInitialPinsIfEmpty(_currentUserId?: string): Promise<void> {
  // Production safe: No seed data injected
}

// 1. Viewport-based geographic querying using Geohashing with Range Deduplication
export async function fetchPinsInViewport(bounds: LatLngBounds): Promise<Pin[]> {
  const reqId = ++activeViewportRequestId;
  let unqueriedRanges: [string, string][] = [];

  try {
    const { center, radiusInMeters } = getBoundsCenterAndRadius(bounds);
    const ranges = getGeohashRanges(center, radiusInMeters);

    // Only query geohash ranges that have not yet been queried in this session (unless session cache is empty)
    const isCacheEmpty = sessionMemoryPinMap.size === 0;
    unqueriedRanges = ranges.filter(
      ([start, end]) => isCacheEmpty || !queriedGeohashRanges.has(`${start}:${end}`)
    );

    if (unqueriedRanges.length > 0) {
      const promises = unqueriedRanges.map(([start, end]) => {
        const q = query(
          collection(db, PINS_COLLECTION),
          orderBy('geohash'),
          where('geohash', '>=', start),
          where('geohash', '<=', end),
          limit(50)
        );
        return getDocs(q);
      });

      const snapshots = await Promise.all(promises);

      snapshots.forEach((snap) => {
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          sessionMemoryPinMap.set(d.id, {
            id: d.id,
            ...(data as Omit<Pin, 'id'>),
            category: normalizeCategory(data.category) || 'Other',
            commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
            likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
            createdAt: formatDocDate(data.createdAt),
          });
        });
      });

      // Record ranges only after successful query resolution
      unqueriedRanges.forEach(([start, end]) => {
        queriedGeohashRanges.add(`${start}:${end}`);
      });
    }
  } catch (err) {
    console.warn('Viewport fetch query note:', err);
  }

  // Filter all known valid session pins currently within the requested bounds
  const visiblePins = Array.from(sessionMemoryPinMap.values()).filter((p) =>
    isPointInBounds(p.latitude, p.longitude, bounds)
  );

  if (visiblePins.length > 0) {
    cachedPinsSnapshot = visiblePins;
  }
  return visiblePins;
}

// 2. Discovery Queries: Recent, Popular, Trending, Category
export async function fetchPinsByDiscovery(
  type: 'recent' | 'popular' | 'trending' | 'all',
  category?: PinCategory | null,
  limitCount = 50
): Promise<Pin[]> {
  const canonicalCategory = normalizeCategory(category);
  try {
    const pinsRef = collection(db, PINS_COLLECTION);
    let q;

    if (canonicalCategory) {
      const variants = getCategoryQueryVariants(canonicalCategory);
      if (variants.length === 1) {
        q = query(pinsRef, where('category', '==', variants[0]), limit(limitCount));
      } else {
        q = query(pinsRef, where('category', 'in', variants.slice(0, 10)), limit(limitCount));
      }
    } else if (type === 'popular') {
      q = query(pinsRef, orderBy('likeCount', 'desc'), limit(limitCount));
    } else {
      q = query(pinsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    }

    const snap = await getDocs(q);
    let serverPins: Pin[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, any>;
      return {
        id: d.id,
        ...(data as Omit<Pin, 'id'>),
        category: normalizeCategory(data.category) || 'Other',
        commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
        likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
        createdAt: formatDocDate(data.createdAt),
      };
    });

    if (canonicalCategory) {
      serverPins = serverPins.filter(
        (p) => normalizeCategory(p.category) === canonicalCategory
      );
    }

    serverPins = sortPins(serverPins, type);

    cachedPinsSnapshot = serverPins;
    return serverPins.slice(0, limitCount);
  } catch (err) {
    console.warn('Firestore discovery query notice:', err);
    return [];
  }
}

/**
 * Real-time subscription to discovery pins. Reads pin.commentCount and pin.likeCount
 * directly from the pin documents without querying comments subcollections.
 */
export function subscribeToDiscoveryPins(
  type: 'recent' | 'popular' | 'trending' | 'all',
  category: PinCategory | null | undefined,
  onUpdate: (pins: Pin[]) => void,
  onError?: (err: any) => void,
  limitCount = 50
): () => void {
  const canonicalCategory = normalizeCategory(category);
  try {
    const pinsRef = collection(db, PINS_COLLECTION);
    let q;

    if (canonicalCategory) {
      const variants = getCategoryQueryVariants(canonicalCategory);
      if (variants.length === 1) {
        q = query(pinsRef, where('category', '==', variants[0]), limit(limitCount));
      } else {
        q = query(pinsRef, where('category', 'in', variants.slice(0, 10)), limit(limitCount));
      }
    } else if (type === 'popular') {
      q = query(pinsRef, orderBy('likeCount', 'desc'), limit(limitCount));
    } else {
      q = query(pinsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    }

    return onSnapshot(
      q,
      (snap) => {
        let serverPins: Pin[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(data as Omit<Pin, 'id'>),
            category: normalizeCategory(data.category) || 'Other',
            commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
            likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
            createdAt: formatDocDate(data.createdAt),
          };
        });

        if (canonicalCategory) {
          serverPins = serverPins.filter(
            (p) => normalizeCategory(p.category) === canonicalCategory
          );
        }

        serverPins = sortPins(serverPins, type);

        // Live Firestore snapshot is canonical; seed session memory cache
        cachedPinsSnapshot = serverPins;
        seedSessionPins(serverPins);

        onUpdate(serverPins.slice(0, limitCount));
      },
      (err) => {
        console.warn('Firestore discovery pins onSnapshot notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('Firestore discovery pins subscription error:', err);
    if (onError) onError(err);
    return () => {};
  }
}

// 3. Search pins by keyword, tags, or location
export async function getAllKnownPins(): Promise<Pin[]> {
  const combinedMap = new Map<string, Pin>();

  // 1. Memory cache if present
  if (cachedPinsSnapshot && cachedPinsSnapshot.length > 0) {
    cachedPinsSnapshot.forEach((cp) => {
      combinedMap.set(cp.id, cp);
    });
  }

  // 2. Live Firestore pins
  try {
    const pinsRef = collection(db, PINS_COLLECTION);
    const snap = await getDocs(query(pinsRef, limit(150)));
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, any>;
      combinedMap.set(d.id, {
        id: d.id,
        ...(data as Omit<Pin, 'id'>),
        category: normalizeCategory(data.category) || 'Other',
        commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
        likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
        createdAt: formatDocDate(data.createdAt),
      });
    });
  } catch (err) {
    console.warn('getAllKnownPins notice:', err);
  }

  return Array.from(combinedMap.values());
}

export async function searchPins(keyword: string): Promise<Pin[]> {
  const clean = keyword.trim().toLowerCase();
  if (!clean) return [];
  const tagClean = clean.replace(/^#/, '').trim();

  const candidates = await getAllKnownPins();

  return candidates.filter((p) => {
    const matchTitle =
      p.title.toLowerCase().includes(clean) ||
      (tagClean.length > 0 && p.title.toLowerCase().includes(tagClean));

    const matchDesc =
      p.description.toLowerCase().includes(clean) ||
      (tagClean.length > 0 && p.description.toLowerCase().includes(tagClean));

    const matchLocation =
      p.locationName?.toLowerCase().includes(clean) ||
      (tagClean.length > 0 && p.locationName?.toLowerCase().includes(tagClean));

    const matchCategory =
      p.category.toLowerCase().includes(clean) ||
      (tagClean.length > 0 && p.category.toLowerCase().includes(tagClean));

    const matchTags = p.tags?.some((t) => {
      const normTag = t.toLowerCase().replace(/^#/, '').trim();
      return normTag.includes(tagClean) || normTag.includes(clean);
    });

    return matchTitle || matchDesc || matchLocation || matchCategory || matchTags;
  });
}

// 4. Fetch single pin by ID
export async function fetchPinById(pinId: string): Promise<Pin | null> {
  if (!pinId) return null;
  try {
    const ref = doc(db, PINS_COLLECTION, pinId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      return {
        id: snap.id,
        ...(data as Omit<Pin, 'id'>),
        category: normalizeCategory(data.category) || 'Other',
        commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
        likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
        createdAt: formatDocDate(data.createdAt),
      };
    }
  } catch (err) {
    console.warn('Fetch pin by id notice:', err);
  }

  return null;
}

/**
 * Resolves the signed-in author's public display identity from their Firestore profile.
 * Pins and comments must store exactly these values; Firestore rules reject any other
 * name/avatar so users cannot publish under someone else's identity.
 */
async function resolveCanonicalAuthorIdentity(
  userId: string,
  action: string
): Promise<{ userName: string; userAvatar: string }> {
  const authorUid = auth.currentUser?.uid;
  if (!authorUid || authorUid !== userId) {
    throw new Error(`The author must match the signed-in account to ${action}.`);
  }
  const authorSnap = await getDoc(doc(db, 'users', authorUid));
  if (!authorSnap.exists()) throw new Error(`Complete your profile before you ${action}.`);
  const authorData = authorSnap.data();
  const userName = authorData.displayName;
  if (typeof userName !== 'string' || !userName.trim()) {
    throw new Error(`A profile display name is required to ${action}.`);
  }
  const userAvatar =
    typeof authorData.avatarUrl === 'string'
      ? authorData.avatarUrl
      : typeof authorData.photoURL === 'string'
        ? authorData.photoURL
        : '';
  return { userName, userAvatar };
}

// 5. Create Pin directly in Firestore
export async function createPin(
  pinData: Omit<Pin, 'id' | 'geohash' | 'likeCount' | 'commentCount' | 'createdAt'>
): Promise<string> {
  const geohash = computeGeohash(pinData.latitude, pinData.longitude);
  const now = new Date().toISOString();

  // Author name/avatar come from the authenticated profile, never from caller input.
  const { userName, userAvatar } = await resolveCanonicalAuthorIdentity(pinData.userId, 'publish a spot');

  const firestorePin = {
    userId: pinData.userId,
    userName,
    userAvatar,
    title: pinData.title,
    description: pinData.description,
    latitude: pinData.latitude,
    longitude: pinData.longitude,
    geohash,
    locationName: pinData.locationName || '',
    city: pinData.city || '',
    countryCode: pinData.countryCode || '',
    countryName: pinData.countryName || '',
    category: pinData.category,
    tags: pinData.tags || [],
    imageUrls: pinData.imageUrls || [],
    likeCount: 0,
    commentCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = await addDoc(collection(db, PINS_COLLECTION), firestorePin);
    return docRef.id;
  } catch (err) {
    console.error('Firestore createPin error:', err);
    handleFirestoreError(err, OperationType.CREATE, PINS_COLLECTION);
    throw err;
  }
}

// 6. Delete Pin directly in Firestore
export async function deletePin(pinId: string, userId: string): Promise<void> {
  const authUid = auth.currentUser?.uid || userId;
  if (!authUid) {
    throw new Error('Authentication required to delete a spot.');
  }
  if (!pinId) {
    throw new Error('Spot ID is required.');
  }

  const pinRef = doc(db, PINS_COLLECTION, pinId);

  try {
    // 1. Read existing pin data safely so storage image URLs and actual owner UID are known
    let pinImages: string[] = [];
    let pinOwnerId: string = userId;
    try {
      const snap = await getDoc(pinRef);
      if (snap.exists()) {
        const pinData = snap.data() as Pin;
        pinOwnerId = pinData.userId || userId;
        if (pinData.imageUrls && Array.isArray(pinData.imageUrls)) {
          pinImages = pinData.imageUrls;
        }
      }
    } catch (readErr) {
      console.warn('[Heyroq Pin Delete] Notice fetching pin data before delete:', readErr);
    }

    // 2. Perform authoritative Firestore deletion FIRST
    await deleteDoc(pinRef);
    console.log('[Heyroq Pin Delete] Successfully deleted pin doc from Firestore:', { pinId, authUid });

    // 3. Immediately evict from all in-memory caches so map/discovery do not re-render deleted pin
    evictSessionPin(pinId);

    // 4. Safely clean up associated Storage images in the background (non-blocking)
    if (pinImages.length > 0) {
      deletePinImages(pinImages, pinOwnerId).catch((imgErr) => {
        console.warn('[Heyroq Pin Delete] Storage image cleanup notice:', imgErr);
      });
    }
  } catch (err: any) {
    console.error('[Heyroq Pin Delete] Error deleting pin from Firestore:', {
      pinId,
      authUid,
      err,
    });
    handleFirestoreError(err, OperationType.DELETE, `${PINS_COLLECTION}/${pinId}`);
    throw err;
  }
}

// 7. Check if user liked pin in Firestore
export async function checkIfLiked(pinId: string, userId: string): Promise<boolean> {
  if (!userId || !pinId) return false;

  try {
    const authUid = auth.currentUser?.uid || userId;
    const likeRef = doc(db, PINS_COLLECTION, pinId, 'likes', authUid);
    const snap = await getDoc(likeRef);
    return snap.exists();
  } catch (err) {
    console.warn('[Heyroq Like] Error checking like status in Firestore:', err);
    return false;
  }
}

// Real-time authoritative subscription to a pin's like status
export function subscribeToPinLike(
  pinId: string,
  userId: string,
  onUpdate: (isLiked: boolean) => void
): () => void {
  if (!pinId || !userId) {
    onUpdate(false);
    return () => {};
  }

  const authUid = auth.currentUser?.uid || userId;
  const likeRef = doc(db, PINS_COLLECTION, pinId, 'likes', authUid);

  return onSnapshot(
    likeRef,
    (snap) => {
      onUpdate(snap.exists());
    },
    (err) => {
      console.warn('[Heyroq Like] onSnapshot error on likeRef:', err);
      onUpdate(false);
    }
  );
}

// 8. Toggle Like on a Pin in Firestore
export async function toggleLike(pinId: string, userId: string): Promise<boolean> {
  if (!userId) {
    throw new Error('You must be signed in to like a pin.');
  }

  const authUid = auth.currentUser?.uid || userId;
  const likeRef = doc(db, PINS_COLLECTION, pinId, 'likes', authUid);

  try {
    const existingSnap = await getDoc(likeRef);
    const isCurrentlyLiked = existingSnap.exists();

    if (isCurrentlyLiked) {
      await deleteDoc(likeRef);
      console.log('[Heyroq Like] Successfully deleted like in Firestore:', { pinId, authUid });
      return false;
    } else {
      await setDoc(likeRef, {
        userId: authUid,
        createdAt: serverTimestamp(),
      });
      console.log('[Heyroq Like] Successfully created like in Firestore:', { pinId, authUid });
      return true;
    }
  } catch (err) {
    console.error('[Heyroq Like] Error toggling like in Firestore:', err);
    handleFirestoreError(err, OperationType.WRITE, `${PINS_COLLECTION}/${pinId}/likes/${authUid}`);
    throw err;
  }
}

// 9. Comments in Firestore
export async function fetchComments(pinId: string): Promise<Comment[]> {
  if (!pinId) return [];

  try {
    const commentsRef = collection(db, PINS_COLLECTION, pinId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, any>;
      return {
        id: d.id,
        pinId,
        userId: data.userId || '',
        userName: data.userName || 'Explorer',
        userAvatar: data.userAvatar || '',
        text: data.text || '',
        createdAt: formatDocDate(data.createdAt),
      };
    });
  } catch (err: any) {
    console.warn('[Heyroq Comments] Notice fetching comments from Firestore:', {
      errorCode: err?.code,
      errorMessage: err?.message,
      pinId,
    });
    return [];
  }
}

/**
 * Real-time authoritative subscription to a pin's comments subcollection.
 * Synchronizes new and deleted comments across users without page reloads.
 */
export function subscribeToComments(
  pinId: string,
  onUpdate: (comments: Comment[]) => void
): () => void {
  if (!pinId) {
    onUpdate([]);
    return () => {};
  }

  try {
    const commentsRef = collection(db, PINS_COLLECTION, pinId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        const commentsList: Comment[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            pinId,
            userId: data.userId || '',
            userName: data.userName || 'Explorer',
            userAvatar: data.userAvatar || '',
            text: data.text || '',
            createdAt: formatDocDate(data.createdAt),
          };
        });
        onUpdate(commentsList);
      },
      (err) => {
        console.warn('[Heyroq Comments] onSnapshot notice for comments:', err);
      }
    );
  } catch (err) {
    console.warn('[Heyroq Comments] Error establishing comments subscription:', err);
    return () => {};
  }
}

/**
 * Real-time authoritative subscription to a pin document's metadata (including commentCount and likeCount).
 * Strictly listens to the pins/{pinId} document directly without querying the comments subcollection.
 */
export function subscribeToPinDocument(
  pinId: string,
  onUpdate: (data: { commentCount?: number; likeCount?: number }) => void
): () => void {
  if (!pinId) return () => {};

  const pinDocRef = doc(db, PINS_COLLECTION, pinId);
  return onSnapshot(
    pinDocRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onUpdate({
          commentCount: typeof data.commentCount === 'number' ? data.commentCount : undefined,
          likeCount: typeof data.likeCount === 'number' ? data.likeCount : undefined,
        });
      }
    },
    (err) => {
      console.warn('[Heyroq Pin] onSnapshot notice for pin document:', err);
    }
  );
}

/**
 * Backward compatible helper that synchronizes pin commentCount without querying comments subcollection.
 */
export function subscribeToPinCommentCount(
  pinId: string,
  onUpdate: (count: number) => void
): () => void {
  return subscribeToPinDocument(pinId, ({ commentCount }) => {
    if (typeof commentCount === 'number') {
      onUpdate(commentCount);
    }
  });
}

/**
 * Synchronizes the memory cache snapshot so subsequent viewport queries or fallbacks
 * do not overwrite pins with stale comment counts.
 */
export function updateCachedPinCommentCount(pinId: string, count: number): void {
  cachedPinsSnapshot = cachedPinsSnapshot.map((p) => {
    if (p.id !== pinId) return p;
    return { ...p, commentCount: count };
  });
}

/**
 * Synchronizes the memory cache snapshot so subsequent viewport queries or fallbacks
 * do not overwrite pins with stale like counts.
 */
export function updateCachedPinLikeCount(pinId: string, count: number): void {
  cachedPinsSnapshot = cachedPinsSnapshot.map((p) => {
    if (p.id !== pinId) return p;
    return { ...p, likeCount: count };
  });
}

/**
 * Hydrates authoritative comment counts for loaded pins using Firestore server-side
 * count aggregation (getCountFromServer) without downloading comment payloads or threads.
 */
const hydratedCommentCountPinIds = new Set<string>();

export async function hydratePinCommentCounts(
  pins: Pin[],
  onCountUpdated: (pinId: string, count: number) => void,
  force = false
): Promise<void> {
  if (!pins || pins.length === 0) return;

  const uniqueMap = new Map<string, Pin>();
  pins.forEach((p) => {
    if (p && p.id) {
      if (force || !hydratedCommentCountPinIds.has(p.id)) {
        uniqueMap.set(p.id, p);
      }
    }
  });

  const pinList = Array.from(uniqueMap.values());
  if (pinList.length === 0) return;

  await Promise.allSettled(
    pinList.map(async (pin) => {
      try {
        const commentsColl = collection(db, PINS_COLLECTION, pin.id, 'comments');
        const countSnap = await getCountFromServer(commentsColl);
        const actualCount = countSnap.data().count;
        hydratedCommentCountPinIds.add(pin.id);

        if (actualCount !== pin.commentCount) {
          console.log(
            `[Heyroq Comment Count Hydration] Reconciled pin ${pin.id} commentCount: ${pin.commentCount} -> ${actualCount}`
          );
          updateCachedPinCommentCount(pin.id, actualCount);
          onCountUpdated(pin.id, actualCount);
        }
      } catch (err) {
        console.warn(`[Heyroq] Count hydration note for pin ${pin.id}:`, err);
      }
    })
  );
}

// Comments collection write operations
export async function addComment(
  pinId: string,
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  text: string
): Promise<Comment> {
  if (!userId) {
    throw new Error('You must be signed in to post a comment.');
  }
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('Comment cannot be empty.');
  }
  if (cleanText.length > 1000) {
    throw new Error('Comment cannot exceed 1000 characters.');
  }

  // Resolve the authenticated author's identity from Firestore, not caller input.
  const { userName: canonicalName, userAvatar: canonicalAvatar } =
    await resolveCanonicalAuthorIdentity(userId, 'comment');

  const now = new Date().toISOString();

  const commentPayload = {
    pinId,
    userId,
    userName: canonicalName,
    userAvatar: canonicalAvatar,
    text: cleanText,
    createdAt: serverTimestamp(),
  };

  const commentPath = `${PINS_COLLECTION}/${pinId}/comments`;
  try {
    const commentsRef = collection(db, PINS_COLLECTION, pinId, 'comments');
    const docRef = await addDoc(commentsRef, commentPayload);

    console.log('[Heyroq Comments] Successfully posted comment in Firestore:', {
      pinId,
      commentId: docRef.id,
      userId,
      path: `${commentPath}/${docRef.id}`,
    });

    return {
      id: docRef.id,
      pinId,
      userId,
      userName: commentPayload.userName,
      userAvatar: commentPayload.userAvatar,
      text: cleanText,
      createdAt: now,
    };
  } catch (err: any) {
    const errorCode = err?.code || 'unknown';
    console.error('[Heyroq Comments] Error adding comment in Firestore:', {
      errorCode,
      errorMessage: err?.message,
      pinId,
      userId,
      path: commentPath,
    });
    handleFirestoreError(err, OperationType.CREATE, commentPath);
    throw err;
  }
}

/**
 * Deletes a comment from a pin:
 * pins/{pinId}/comments/{commentId}
 */
export async function deleteComment(
  pinId: string,
  commentId: string,
  userId: string,
  commentUserId?: string
): Promise<void> {
  const authUid = auth.currentUser?.uid || userId;
  if (!authUid) {
    throw new Error('You must be signed in to delete a comment.');
  }
  if (!pinId || !commentId) {
    throw new Error('Pin ID and Comment ID are required.');
  }

  const isPlatformAdmin =
    auth.currentUser?.uid === '1XUiIYnfOWTG7uFU736I25CskZU2' &&
    auth.currentUser?.email === 'n.kalogerogiannis@gmail.com';
  if (commentUserId && commentUserId !== authUid && !isPlatformAdmin) {
    console.warn('[Heyroq Comments] Unauthorized delete attempt rejected:', {
      authenticatedUid: authUid,
      commentOwnerUid: commentUserId,
      pinId,
      commentId,
    });
    throw new Error('Permission denied: You can only delete your own comments.');
  }

  const commentPath = `${PINS_COLLECTION}/${pinId}/comments/${commentId}`;
  try {
    const commentRef = doc(db, PINS_COLLECTION, pinId, 'comments', commentId);
    await deleteDoc(commentRef);

    console.log('[Heyroq Comments] Successfully deleted comment in Firestore:', {
      authenticatedUid: authUid,
      commentOwnerUid: commentUserId || authUid,
      pinId,
      commentId,
      path: commentPath,
    });
  } catch (err: any) {
    const errorCode = err?.code || 'unknown';
    console.error('[Heyroq Comments] Error deleting comment in Firestore:', {
      authenticatedUid: authUid,
      commentOwnerUid: commentUserId || 'unknown',
      pinId,
      commentId,
      path: commentPath,
      errorCode,
      errorMessage: err?.message,
    });
    handleFirestoreError(err, OperationType.DELETE, commentPath);
    throw err;
  }
}

export function isDemoSession(_userId?: string): boolean {
  return false;
}

export async function checkIfFollowing(currentUserId: string, targetUserId: string): Promise<boolean> {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return false;

  const followerPath = `${USERS_COLLECTION}/${targetUserId}/followers/${currentUserId}`;
  try {
    const followerRef = doc(db, USERS_COLLECTION, targetUserId, 'followers', currentUserId);
    const snap = await getDoc(followerRef);
    return snap.exists();
  } catch (err: any) {
    const errorCode = err?.code || 'unknown';
    console.warn('[Heyroq Follow] Error checking follow status in Firestore:', {
      errorCode,
      errorMessage: err?.message,
      authenticatedUid: currentUserId,
      targetUid: targetUserId,
      path: followerPath,
    });
    return false;
  }
}

/**
 * Atomically follows a user:
 * Creates BOTH:
 * - users/{targetUserId}/followers/{currentUserId}
 * - users/{currentUserId}/following/{targetUserId}
 * in a single atomic Firestore writeBatch.
 */
export async function followUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (!currentUserId) {
    throw new Error('You must be signed in to follow users.');
  }
  if (currentUserId === targetUserId) {
    throw new Error('Users cannot follow themselves.');
  }

  const followerPath = `${USERS_COLLECTION}/${targetUserId}/followers/${currentUserId}`;
  const followingPath = `${USERS_COLLECTION}/${currentUserId}/following/${targetUserId}`;

  try {
    const followerRef = doc(db, USERS_COLLECTION, targetUserId, 'followers', currentUserId);
    const followingRef = doc(db, USERS_COLLECTION, currentUserId, 'following', targetUserId);

    const now = new Date().toISOString();
    const batch = writeBatch(db);
    batch.set(followerRef, { followerId: currentUserId, createdAt: now });
    batch.set(followingRef, { targetUserId: targetUserId, createdAt: now });
    await batch.commit();

    console.log('[Heyroq Follow] Successfully followed user (atomic batch committed):', {
      authenticatedUid: currentUserId,
      targetUid: targetUserId,
      paths: [followerPath, followingPath],
    });
  } catch (err: any) {
    const errorCode = err?.code || 'unknown';
    console.error('[Heyroq Follow] Error following user:', {
      errorCode,
      errorMessage: err?.message,
      authenticatedUid: currentUserId,
      targetUid: targetUserId,
      paths: [followerPath, followingPath],
    });
    handleFirestoreError(err, OperationType.WRITE, followerPath);
    throw err;
  }
}

/**
 * Atomically unfollows a user:
 * Deletes BOTH:
 * - users/{targetUserId}/followers/{currentUserId}
 * - users/{currentUserId}/following/{targetUserId}
 * in a single atomic Firestore writeBatch.
 */
export async function unfollowUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (!currentUserId) {
    throw new Error('You must be signed in to unfollow users.');
  }
  if (currentUserId === targetUserId) {
    return;
  }

  const followerPath = `${USERS_COLLECTION}/${targetUserId}/followers/${currentUserId}`;
  const followingPath = `${USERS_COLLECTION}/${currentUserId}/following/${targetUserId}`;

  try {
    const followerRef = doc(db, USERS_COLLECTION, targetUserId, 'followers', currentUserId);
    const followingRef = doc(db, USERS_COLLECTION, currentUserId, 'following', targetUserId);

    const batch = writeBatch(db);
    batch.delete(followerRef);
    batch.delete(followingRef);
    await batch.commit();

    console.log('[Heyroq Follow] Successfully unfollowed user (atomic batch committed):', {
      authenticatedUid: currentUserId,
      targetUid: targetUserId,
      paths: [followerPath, followingPath],
    });
  } catch (err: any) {
    const errorCode = err?.code || 'unknown';
    console.error('[Heyroq Follow] Error unfollowing user:', {
      errorCode,
      errorMessage: err?.message,
      authenticatedUid: currentUserId,
      targetUid: targetUserId,
      paths: [followerPath, followingPath],
    });
    handleFirestoreError(err, OperationType.WRITE, followerPath);
    throw err;
  }
}

/**
 * Toggles follow state using atomic writeBatch.
 * Returns true if user is now followed, false if unfollowed.
 */
export async function toggleFollow(currentUserId: string, targetUserId: string): Promise<boolean> {
  if (!currentUserId) {
    throw new Error('You must be signed in to follow users.');
  }
  if (currentUserId === targetUserId) return false;

  const isCurrentlyFollowing = await checkIfFollowing(currentUserId, targetUserId);
  if (isCurrentlyFollowing) {
    await unfollowUser(currentUserId, targetUserId);
    return false;
  } else {
    await followUser(currentUserId, targetUserId);
    return true;
  }
}

// 11. User Pins
export async function fetchUserPins(userId: string): Promise<Pin[]> {
  if (!userId) return [];
  try {
    const q = query(
      collection(db, PINS_COLLECTION),
      where('userId', '==', userId),
      limit(50)
    );
    const snap = await getDocs(q);
    const serverPins = snap.docs.map((d) => {
      const data = d.data() as Record<string, any>;
      return {
        id: d.id,
        ...(data as Omit<Pin, 'id'>),
        category: normalizeCategory(data.category) || 'Other',
        commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
        likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
        createdAt: formatDocDate(data.createdAt),
      };
    });
    return serverPins.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (err) {
    console.warn('Notice fetching user pins from Firestore:', err);
    return [];
  }
}

/**
 * Real-time subscription to pins published by a specific user.
 * Automatically synchronizes authoritative likeCount and commentCount in real time.
 */
export function subscribeToUserPins(
  userId: string,
  onUpdate: (pins: Pin[]) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, PINS_COLLECTION),
    where('userId', '==', userId),
    limit(50)
  );

  return onSnapshot(
    q,
    (snap) => {
      const serverPins = snap.docs.map((d) => {
        const data = d.data() as Record<string, any>;
        return {
          id: d.id,
          ...(data as Omit<Pin, 'id'>),
          category: normalizeCategory(data.category) || 'Other',
          likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
          commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
          createdAt: formatDocDate(data.createdAt),
        };
      });
      serverPins.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      onUpdate(serverPins);
    },
    (err) => {
      console.warn('Notice subscribing to user pins from Firestore:', err);
    }
  );
}

// 12. Moderation Reports in Firestore
export async function submitReport(
  reporterId: string,
  targetType: 'pin' | 'comment' | 'user',
  targetId: string,
  reason: string,
  details?: string,
  pinId?: string
): Promise<string> {
  const reportData: Omit<Report, 'id'> = {
    reporterId,
    targetType,
    targetId,
    reason,
    details: details || '',
    pinId: pinId || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(collection(db, REPORTS_COLLECTION), reportData);
    return docRef.id;
  } catch (err) {
    console.error('Firestore submitReport error:', err);
    handleFirestoreError(err, OperationType.CREATE, REPORTS_COLLECTION);
    throw err;
  }
}

export async function fetchAllReports(): Promise<Report[]> {
  try {
    const q = query(collection(db, REPORTS_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, 'id'>) }));
  } catch (err) {
    console.warn('Notice fetching reports from Firestore:', err);
    return [];
  }
}

export async function updateReportStatus(
  reportId: string,
  status: 'resolved' | 'dismissed'
): Promise<void> {
  try {
    const ref = doc(db, REPORTS_COLLECTION, reportId);
    await updateDoc(ref, { status });
  } catch (err) {
    console.error('Firestore updateReportStatus error:', err);
    handleFirestoreError(err, OperationType.UPDATE, `${REPORTS_COLLECTION}/${reportId}`);
    throw err;
  }
}
