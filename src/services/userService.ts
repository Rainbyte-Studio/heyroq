import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  getDocsFromServer,
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
import { normalizeSearchText } from '../utils/spotSearch';
import { createSearchReadCache } from './searchReadCache';

const USERS_COLLECTION = 'users';

// In-memory LRU-like profile cache to prevent N+1 Firestore reads
const profileCache = new Map<string, PublicUserProfile>();
const peopleSearchRead = createSearchReadCache(readPublicSearchProfiles, 60_000);

/**
 * Invalidates cached public profile(s) after profile or avatar updates.
 */
export function invalidateUserProfileCache(userId?: string): void {
  peopleSearchRead.invalidate();
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

function normalizePeopleSearch(value: unknown): string {
  return normalizeSearchText(value).replace(/ς/g, 'σ').replace(/\s+/g, ' ');
}

async function readPublicSearchProfiles() {
  const pageSize = 150;
  const orderedUsers = query(collection(db, USERS_COLLECTION), orderBy(documentId()), limit(pageSize));
  const profiles: { profile: PublicUserProfile; username: string; name: string; nameWords: string[] }[] = [];
  let page = await getDocsFromServer(orderedUsers);

  while (true) {
    for (const snapshot of page.docs) {
      const data = snapshot.data();
      if (data.deletionStatus === 'deleting') continue;
      const rawUsername = typeof data.username === 'string' ? data.username : '';
      const rawName = typeof data.displayName === 'string' ? data.displayName : '';
      const username = normalizePeopleSearch(rawUsername).replace(/^@/, '');
      const name = normalizePeopleSearch(rawName);
      if (!username && !name) continue;

      // Match only the public name and handle, including on older profiles.
      const profile = toPublicUserProfile({
        ...data, username: rawUsername, displayName: rawName, email: undefined,
        usernameLower: username, displayNameLower: name,
      }, snapshot.id);
      profiles.push({ profile, username, name, nameWords: name.match(/[\p{L}\p{N}]+/gu) ?? [] });
    }
    if (page.size < pageSize) return profiles;
    page = await getDocsFromServer(query(orderedUsers, startAfter(page.docs[page.docs.length - 1])));
  }
}

export async function searchUsers(queryText: string, limitCount = 20): Promise<PublicUserProfile[]> {
  const handleOnly = queryText.trimStart().startsWith('@');
  const term = normalizePeopleSearch(queryText).replace(/^@\s*/, '');
  if (term.length < 2 || limitCount <= 0) return [];
  const nameTerms = term.match(/[\p{L}\p{N}]+/gu) ?? [];

  try {
    const candidates = await peopleSearchRead.read();
    const ranked: { profile: PublicUserProfile; rank: number }[] = [];
    for (const { profile, username, name, nameWords } of candidates) {
      if (username === term) ranked.push({ profile, rank: 0 });
      else if (!handleOnly && name === term) ranked.push({ profile, rank: 1 });
      else if (username.startsWith(term)) ranked.push({ profile, rank: 2 });
      else if (!handleOnly && name.startsWith(term)) ranked.push({ profile, rank: 3 });
      else if (!handleOnly && nameTerms.length && nameTerms.every(word => nameWords.some(part => part.startsWith(word)))) {
        ranked.push({ profile, rank: 4 });
      }
    }

    return ranked.sort((a, b) => a.rank - b.rank).slice(0, limitCount).map(({ profile }) => {
      profileCache.set(profile.id, profile);
      return profile;
    });
  } catch (error) {
    console.warn('[Heyroq People] Could not search public profiles:', error);
    return [];
  }
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
