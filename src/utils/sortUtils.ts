import { Pin, DiscoveryFilter } from '../types';

/**
 * Parses any supported timestamp representation into a millisecond epoch value.
 */
export function parsePinCreatedAt(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof (val as { seconds?: number }).seconds === 'number') {
    return (val as { seconds: number }).seconds * 1000;
  }
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Calculates lifetime popularity score based on denormalized Pin metrics:
 * POPULAR_SCORE = (likeCount * 3) + (commentCount * 2)
 */
export function calculatePopularScore(pin: Partial<Pin>): number {
  const likes = typeof pin.likeCount === 'number' && !isNaN(pin.likeCount) ? Math.max(0, pin.likeCount) : 0;
  const comments = typeof pin.commentCount === 'number' && !isNaN(pin.commentCount) ? Math.max(0, pin.commentCount) : 0;
  return likes * 3 + comments * 2;
}

/**
 * Calculates time-decayed trending momentum score:
 * engagement = (likeCount * 3) + (commentCount * 2)
 * ageHours = max(0, (now - createdAt) / 3600000)
 * trendingScore = (engagement + 1) / pow(ageHours + 2, 1.5)
 *
 * The +1 baseline allows new spots with zero engagement to participate based on freshness
 * without overpowering genuinely engaging spots.
 */
export function calculateTrendingScore(pin: Partial<Pin>, now: number): number {
  const engagement = calculatePopularScore(pin);
  const createdAtMs = parsePinCreatedAt(pin.createdAt);
  const ageHours = Math.max(0, (now - createdAtMs) / 3600000);
  return (engagement + 1) / Math.pow(ageHours + 2, 1.5);
}

/**
 * Pure, non-mutating, deterministic sorting utility for Heyroq Discovery Pins.
 *
 * Current candidate set limitation:
 * Operates against the Pins currently loaded in memory/candidate set.
 * Does not perform global database queries.
 *
 * Sorting modes:
 * - 'recent': createdAt DESC, tie-break: pin.id ASC
 * - 'popular': popularScore DESC, createdAt DESC, tie-break: pin.id ASC
 * - 'trending': trendingScore DESC, createdAt DESC, tie-break: pin.id ASC
 * - 'all' / 'nearby' / other: defaults to 'recent'
 */
export function sortPins(
  pins: readonly Pin[],
  mode: DiscoveryFilter | 'recent' | 'popular' | 'trending' | 'all',
  nowTimestamp?: number
): Pin[] {
  if (!pins || pins.length === 0) return [];

  // Capture "now" once per sort operation to ensure stable comparisons
  const now = typeof nowTimestamp === 'number' ? nowTimestamp : Date.now();
  const copy = [...pins];

  if (mode === 'popular') {
    return copy.sort((a, b) => {
      const scoreA = calculatePopularScore(a);
      const scoreB = calculatePopularScore(b);
      const scoreDiff = scoreB - scoreA;
      if (scoreDiff !== 0) return scoreDiff;

      const timeA = parsePinCreatedAt(a.createdAt);
      const timeB = parsePinCreatedAt(b.createdAt);
      const timeDiff = timeB - timeA;
      if (timeDiff !== 0) return timeDiff;

      return (a.id || '').localeCompare(b.id || '');
    });
  }

  if (mode === 'trending') {
    return copy.sort((a, b) => {
      const scoreA = calculateTrendingScore(a, now);
      const scoreB = calculateTrendingScore(b, now);
      const scoreDiff = scoreB - scoreA;
      if (scoreDiff !== 0) return scoreDiff;

      const timeA = parsePinCreatedAt(a.createdAt);
      const timeB = parsePinCreatedAt(b.createdAt);
      const timeDiff = timeB - timeA;
      if (timeDiff !== 0) return timeDiff;

      return (a.id || '').localeCompare(b.id || '');
    });
  }

  // Default / 'recent': createdAt DESC, tie-break: pin.id ASC
  return copy.sort((a, b) => {
    const timeA = parsePinCreatedAt(a.createdAt);
    const timeB = parsePinCreatedAt(b.createdAt);
    const timeDiff = timeB - timeA;
    if (timeDiff !== 0) return timeDiff;

    return (a.id || '').localeCompare(b.id || '');
  });
}
