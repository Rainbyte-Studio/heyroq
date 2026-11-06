import { PinCategory } from '../types';

export const CANONICAL_CATEGORIES: readonly PinCategory[] = [
  'Hidden Gems',
  'Food',
  'Travel',
  'Nature',
  'Photography',
  'Events',
  'Activities',
  'Other',
] as const;

/**
 * Normalizes any category string (e.g. 'FOOD', 'food', 'hidden_gems', 'Hidden Gems')
 * into the project's canonical PinCategory value.
 */
export function normalizeCategory(category?: string | null): PinCategory | null {
  if (!category) return null;
  const clean = category.trim().toLowerCase().replace(/[_\s-]+/g, ' ');

  if (
    clean === 'hidden gems' ||
    clean === 'hidden gem' ||
    clean === 'hiddengems' ||
    clean === 'gem' ||
    clean === 'gems'
  ) {
    return 'Hidden Gems';
  }
  if (
    clean === 'food' ||
    clean === 'foods' ||
    clean === 'dining' ||
    clean === 'restaurant' ||
    clean === 'cafe'
  ) {
    return 'Food';
  }
  if (
    clean === 'travel' ||
    clean === 'travels' ||
    clean === 'attraction' ||
    clean === 'tourism'
  ) {
    return 'Travel';
  }
  if (
    clean === 'nature' ||
    clean === 'outdoor' ||
    clean === 'outdoors' ||
    clean === 'park'
  ) {
    return 'Nature';
  }
  if (
    clean === 'photography' ||
    clean === 'photo' ||
    clean === 'photos' ||
    clean === 'photogenic'
  ) {
    return 'Photography';
  }
  if (clean === 'events' || clean === 'event' || clean === 'festival') {
    return 'Events';
  }
  if (
    clean === 'activities' ||
    clean === 'activity' ||
    clean === 'adventure' ||
    clean === 'experience'
  ) {
    return 'Activities';
  }
  if (clean === 'other' || clean === 'misc' || clean === 'general') {
    return 'Other';
  }

  // Fallback to match case-insensitively against canonical list
  const matched = CANONICAL_CATEGORIES.find(
    (c) => c.toLowerCase() === clean
  );
  return matched || 'Other';
}

/**
 * Checks whether two category values match after canonical normalization.
 */
export function isSameCategory(
  catA?: string | null,
  catB?: string | null
): boolean {
  const normA = normalizeCategory(catA);
  const normB = normalizeCategory(catB);
  if (!normA || !normB) return false;
  return normA === normB;
}

/**
 * Checks whether a pin's category satisfies an active category filter.
 * If activeFilter is null, any pin matches.
 */
export function matchesCategoryFilter(
  pinCategory?: string | null,
  activeFilter?: string | null
): boolean {
  if (!activeFilter) return true;
  const normFilter = normalizeCategory(activeFilter);
  if (!normFilter) return true;
  const normPin = normalizeCategory(pinCategory);
  return normPin === normFilter;
}

/**
 * Generates Firestore query variants to ensure queries match stored records
 * regardless of casing or formatting differences.
 */
export function getCategoryQueryVariants(category: PinCategory | string): string[] {
  const norm = normalizeCategory(category);
  if (!norm) return [];

  switch (norm) {
    case 'Hidden Gems':
      return [
        'Hidden Gems',
        'hidden_gems',
        'hidden gems',
        'Hidden gems',
        'HIDDEN GEMS',
        'hidden-gems',
      ];
    case 'Food':
      return ['Food', 'food', 'FOOD'];
    case 'Travel':
      return ['Travel', 'travel', 'TRAVEL'];
    case 'Nature':
      return ['Nature', 'nature', 'NATURE'];
    case 'Photography':
      return ['Photography', 'photography', 'PHOTOGRAPHY', 'photo', 'Photo'];
    case 'Events':
      return ['Events', 'events', 'EVENTS', 'event', 'Event'];
    case 'Activities':
      return ['Activities', 'activities', 'ACTIVITIES', 'activity', 'Activity'];
    case 'Other':
      return ['Other', 'other', 'OTHER'];
    default:
      return [norm];
  }
}
