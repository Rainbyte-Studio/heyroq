import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PublicUserProfile } from '../types';
import { checkIfFollowing, toggleFollow } from './pinService';
import { resolveCustomAvatarUrl } from '../utils/avatarUtils';

const USERS_COLLECTION = 'users';

// In-memory LRU-like profile cache to prevent N+1 Firestore reads
const profileCache = new Map<string, PublicUserProfile>();

/**
 * Invalidates cached public profile(s) after profile or avatar updates.
 */
export function invalidateUserProfileCache(userId?: string): void {
  if (userId) {
    profileCache.delete(userId);
  } else {
    profileCache.clear();
  }
}

/**
 * Strips private PII (email, role, admin flags) from user data
 * and produces a safe PublicUserProfile.
 */
export function toPublicUserProfile(data: Record<string, any>, id: string): PublicUserProfile {
  const safeId = id || data.uid || data.id || '';
  const username = data.username || (data.email ? data.email.split('@')[0] : `user_${safeId.slice(0, 5)}`);
  const displayName = data.displayName || username || 'Explorer';
  const avatar = resolveCustomAvatarUrl(data.avatarUrl, data.photoURL) || '';

  return {
    id: safeId,
    uid: safeId,
    username: username.replace(/^@/, ''),
    displayName,
    usernameLower: (data.usernameLower || username).toLowerCase(),
    displayNameLower: (data.displayNameLower || displayName).toLowerCase(),
    photoURL: avatar,
    avatarUrl: avatar,
    bio: data.bio || 'Heyroq explorer finding unique spots.',
    followersCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
    followingCount: typeof data.followingCount === 'number' ? data.followingCount : 0,
    pinsCount: typeof data.pinsCount === 'number' ? data.pinsCount : 0,
    countriesCount: typeof data.countriesCount === 'number' ? data.countriesCount : undefined,
    citiesCount: typeof data.citiesCount === 'number' ? data.citiesCount : undefined,
  };
}

/**
 * Retrieves a single public user profile, checking the in-memory cache first.
 */
export async function getPublicUserProfile(userId: string): Promise<PublicUserProfile | null> {
  if (!userId) return null;

  if (profileCache.has(userId)) {
    return profileCache.get(userId)!;
  }

  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const publicProfile = toPublicUserProfile(snap.data(), snap.id);
      profileCache.set(userId, publicProfile);
      return publicProfile;
    }
  } catch (err) {
    console.warn('[Heyroq People] Notice getting user profile from Firestore:', err);
  }

  return null;
}

/**
 * Batch resolves public user profiles for a list of user IDs.
 * Uses cache and parallel getDoc to avoid N+1 queries.
 */
export async function getPublicUserProfilesBatch(userIds: string[]): Promise<PublicUserProfile[]> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const results: PublicUserProfile[] = [];
  const missingIds: string[] = [];

  for (const id of uniqueIds) {
    if (profileCache.has(id)) {
      results.push(profileCache.get(id)!);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    // Fetch missing profiles in parallel chunks of 10
    const chunkSize = 10;
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
          if (snap.exists()) {
            const pub = toPublicUserProfile(snap.data(), snap.id);
            profileCache.set(uid, pub);
            return pub;
          }
        } catch (err) {
          console.warn('[Heyroq People] Notice batch resolving uid:', uid, err);
        }
        return null;
      });
      const resolved = await Promise.all(chunkPromises);
      resolved.forEach((item) => {
        if (item) results.push(item);
      });
    }
  }

  return results;
}

/**
 * Scalable Firestore User Search.
 * Queries `users` collection by prefix on `usernameLower` and `displayNameLower`.
 * Does not download the entire collection.
 */
export async function searchUsers(
  queryText: string,
  limitCount = 20
): Promise<PublicUserProfile[]> {
  const clean = queryText.trim().toLowerCase().replace(/^@/, '');
  if (!clean || clean.length < 2) return [];

  const resultMap = new Map<string, PublicUserProfile>();

  try {
    const usersRef = collection(db, USERS_COLLECTION);

    // 1. Query by usernameLower prefix
    const usernameQuery = query(
      usersRef,
      where('usernameLower', '>=', clean),
      where('usernameLower', '<=', clean + '\uf8ff'),
      limit(limitCount)
    );

    // 2. Query by displayNameLower prefix
    const displayNameQuery = query(
      usersRef,
      where('displayNameLower', '>=', clean),
      where('displayNameLower', '<=', clean + '\uf8ff'),
      limit(limitCount)
    );

    // 3. Query by exact search token (e.g. last names or individual words)
    const tokensQuery = query(
      usersRef,
      where('searchTokens', 'array-contains', clean),
      limit(limitCount)
    );

    const [userSnap, displaySnap, tokensSnap] = await Promise.all([
      getDocs(usernameQuery).catch(() => null),
      getDocs(displayNameQuery).catch(() => null),
      getDocs(tokensQuery).catch(() => null),
    ]);

    if (userSnap) {
      userSnap.docs.forEach((d) => {
        const pub = toPublicUserProfile(d.data(), d.id);
        profileCache.set(pub.id, pub);
        resultMap.set(pub.id, pub);
      });
    }

    if (displaySnap) {
      displaySnap.docs.forEach((d) => {
        const pub = toPublicUserProfile(d.data(), d.id);
        profileCache.set(pub.id, pub);
        resultMap.set(pub.id, pub);
      });
    }

    if (tokensSnap) {
      tokensSnap.docs.forEach((d) => {
        const pub = toPublicUserProfile(d.data(), d.id);
        profileCache.set(pub.id, pub);
        resultMap.set(pub.id, pub);
      });
    }
  } catch (err) {
    console.warn('[Heyroq People] Notice executing Firestore user prefix search:', err);
  }

  return Array.from(resultMap.values()).slice(0, limitCount);
}

/**
 * Suggestions for People Discovery when there is no active query.
 * Shows active explorers and community guides.
 * Excludes currentUserId.
 */
export async function getSuggestedUsers(
  currentUserId?: string,
  limitCount = 8
): Promise<PublicUserProfile[]> {
  const resultMap = new Map<string, PublicUserProfile>();

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    // Fetch active users ordered by pinsCount or followersCount
    const q = query(usersRef, orderBy('followersCount', 'desc'), limit(15));
    const snap = await getDocs(q);

    snap.docs.forEach((d) => {
      if (d.id !== currentUserId) {
        const pub = toPublicUserProfile(d.data(), d.id);
        pub.suggestionReason = `Active Explorer • ${pub.pinsCount || 0} spots shared`;
        profileCache.set(pub.id, pub);
        resultMap.set(pub.id, pub);
      }
    });
  } catch (err) {
    console.warn('[Heyroq People] Notice fetching suggested users from Firestore:', err);
  }

  return Array.from(resultMap.values()).slice(0, limitCount);
}

export interface FollowListResponse {
  users: PublicUserProfile[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Paged fetching of users/{targetUserId}/followers.
 * Resolves each followerId to a safe public profile.
 */
export async function fetchUserFollowers(
  targetUserId: string,
  pageSize = 25,
  lastVisibleDoc: DocumentSnapshot | null = null
): Promise<FollowListResponse> {
  if (!targetUserId) {
    return { users: [], lastDoc: null, hasMore: false };
  }

  try {
    const followersRef = collection(db, USERS_COLLECTION, targetUserId, 'followers');
    let q = query(followersRef, orderBy('createdAt', 'desc'), limit(pageSize));

    if (lastVisibleDoc) {
      q = query(followersRef, orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(pageSize));
    }

    const snap = await getDocs(q);
    if (!snap.empty) {
      const followerIds: string[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const fid = data.followerId || d.id;
        if (fid) followerIds.push(fid);
      });

      const profiles = await getPublicUserProfilesBatch(followerIds);
      const newLastDoc = snap.docs[snap.docs.length - 1] || null;
      const hasMore = snap.docs.length === pageSize;

      return {
        users: profiles,
        lastDoc: newLastDoc,
        hasMore,
      };
    }
  } catch (err) {
    console.warn('[Heyroq People] Notice querying followers subcollection from Firestore:', err);
  }

  return {
    users: [],
    lastDoc: null,
    hasMore: false,
  };
}

/**
 * Paged fetching of users/{targetUserId}/following.
 * Resolves each targetUserId to a safe public profile.
 */
export async function fetchUserFollowing(
  targetUserId: string,
  pageSize = 25,
  lastVisibleDoc: DocumentSnapshot | null = null
): Promise<FollowListResponse> {
  if (!targetUserId) {
    return { users: [], lastDoc: null, hasMore: false };
  }

  try {
    const followingRef = collection(db, USERS_COLLECTION, targetUserId, 'following');
    let q = query(followingRef, orderBy('createdAt', 'desc'), limit(pageSize));

    if (lastVisibleDoc) {
      q = query(followingRef, orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(pageSize));
    }

    const snap = await getDocs(q);
    if (!snap.empty) {
      const followingIds: string[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const fid = data.targetUserId || d.id;
        if (fid) followingIds.push(fid);
      });

      const profiles = await getPublicUserProfilesBatch(followingIds);
      const newLastDoc = snap.docs[snap.docs.length - 1] || null;
      const hasMore = snap.docs.length === pageSize;

      return {
        users: profiles,
        lastDoc: newLastDoc,
        hasMore,
      };
    }
  } catch (err) {
    console.warn('[Heyroq People] Notice querying following subcollection from Firestore:', err);
  }

  return {
    users: [],
    lastDoc: null,
    hasMore: false,
  };
}

/**
 * Efficiently checks follow status for a list of target user IDs against current user.
 * Returns a dictionary of targetUserId -> boolean.
 */
export async function checkFollowingStatusBatch(
  currentUserId: string,
  targetUserIds: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (!currentUserId || targetUserIds.length === 0) return result;

  const checks = targetUserIds.map(async (tid) => {
    if (tid === currentUserId) {
      result[tid] = false;
      return;
    }
    const isFollowing = await checkIfFollowing(currentUserId, tid);
    result[tid] = isFollowing;
  });

  await Promise.all(checks);
  return result;
}
