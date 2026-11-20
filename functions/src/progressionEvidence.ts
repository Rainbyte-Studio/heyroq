import { PROGRESSION_CONSTANTS } from './progressionConfig';
import { createHash } from 'node:crypto';
import { discoveryLocationKey, eligibleDiscoveryIds } from './progressionLocation';

const SPOT_CATEGORIES = new Set([
  'food', 'travel', 'nature', 'events', 'activities', 'hidden gems', 'photography', 'other',
]);

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function spotCategory(data: FirebaseFirestore.DocumentData): string {
  return typeof data.category === 'string' ? normalizeText(data.category) : '';
}

export function isPublishedDiscovery(data: FirebaseFirestore.DocumentData): boolean {
  return !data.isDeleted && (data.status === 'published' || data.status == null);
}

function hasPublishedPhoto(data: FirebaseFirestore.DocumentData): boolean {
  return Array.isArray(data.imageUrls) && data.imageUrls.some((value: unknown) => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.pathname.length > 1;
    } catch {
      return false;
    }
  });
}

interface DiscoveryPin extends FirebaseFirestore.DocumentData {
  id: string;
  tags: string[];
}

export function getDiscoveryBadgeMetrics(pins: DiscoveryPin[]) {
  const candidates = pins.filter(pin =>
    isPublishedDiscovery(pin) && typeof pin.title === 'string' && pin.title.trim().length > 0 &&
    SPOT_CATEGORIES.has(spotCategory(pin)),
  );
  const distinctIds = new Set(eligibleDiscoveryIds(candidates, new Set()));
  const categories = new Set<string>();
  const richCandidates = new Map<string, { locationKey: string; descriptionKey: string }>();
  const richDescriptions = new Set<string>();
  let photoSpotsCount = 0;

  for (const pin of candidates) {
    if (!distinctIds.has(pin.id)) continue;
    categories.add(spotCategory(pin));
    if (hasPublishedPhoto(pin)) photoSpotsCount++;

    const description = typeof pin.description === 'string' ? normalizeText(pin.description) : '';
    const tags = new Set(pin.tags.map(normalizeText).filter(Boolean));
    if (description.length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN &&
        tags.size >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS) {
      const locationKey = discoveryLocationKey(pin.latitude, pin.longitude)!;
      const descriptionKey = createHash('sha256').update(description).digest('hex');
      richCandidates.set(pin.id, { locationKey, descriptionKey });
      richDescriptions.add(descriptionKey);
    }
  }

  return {
    distinctDiscoveryCount: distinctIds.size,
    distinctCategoryCount: categories.size,
    qualifyingRichCount: richDescriptions.size,
    photoSpotsCount,
    richCandidates,
  };
}

/** Canonical likes are keyed by authenticated UID. Count each eligible account once per author. */
export async function countTrustedLikes(
  db: FirebaseFirestore.Firestore,
  authorId: string,
  pins: FirebaseFirestore.QueryDocumentSnapshot[],
  target: number,
): Promise<number> {
  const checked = new Set<string>();
  let count = 0;
  for (const pin of pins) {
    if (!isPublishedDiscovery(pin.data()) || !(Number(pin.get('likeCount')) > 0)) continue;
    const likes = pin.ref.collection('likes').orderBy('__name__').limit(50);
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    do {
      const page = await (cursor ? likes.startAfter(cursor) : likes).get();
      const actorIds = [];
      for (const like of page.docs) {
        const actorId = like.id;
        const storedUid = like.get('userId');
        if (actorId === authorId || checked.has(actorId) ||
            actorId.startsWith('system_') || actorId.startsWith('demo_') ||
            (storedUid !== undefined && storedUid !== actorId) ||
            like.createTime.valueOf() < pin.createTime.valueOf()) continue;
        checked.add(actorId);
        actorIds.push(actorId);
      }
      if (actorIds.length > 0) {
        const people = await db.getAll(
          ...actorIds.map(id => db.collection('users').doc(id)),
          ...actorIds.map(id => db.collection('accountDeletionLocks').doc(id)),
        );
        actorIds.forEach((_, index) => {
          const profile = people[index];
          if (profile.exists && profile.get('deletionStatus') !== 'deleting' &&
              !people[index + actorIds.length].exists) count++;
        });
        if (count >= target) return target;
      }
      cursor = page.size === 50 ? page.docs.at(-1) : undefined;
    } while (cursor);
  }
  return count;
}
