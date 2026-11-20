import type { Pin } from '../types';

export function normalizeSearchText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
    : '';
}

export function normalizeSearchTag(value: unknown): string {
  return normalizeSearchText(value).replace(/^#+\s*/, '');
}

export function hasSpotSearchQuery(query: string): boolean {
  return normalizeSearchTag(query).length >= 2;
}

export function getSpotSearchTags(pin: Pin): string[] {
  if (!Array.isArray(pin.tags)) return [];
  return Array.from(new Set(pin.tags.map(normalizeSearchTag).filter(Boolean)));
}

export function createSpotSearchMatcher(query: string): (pin: Pin) => boolean {
  const term = normalizeSearchTag(query);
  const tagsOnly = query.trimStart().startsWith('#');

  return pin => {
    if (term.length < 2 || pin.isPrivate || pin.isDeleted ||
        (pin.visibility && pin.visibility !== 'public') ||
        pin.status === 'draft' || pin.status === 'archived' || pin.status === 'removed') {
      return false;
    }

    const tags = getSpotSearchTags(pin);
    if (tagsOnly) return tags.some(tag => tag.includes(term));

    return [pin.title, pin.description, pin.locationName, pin.city, pin.countryName, pin.category]
      .some(value => normalizeSearchText(value).includes(term)) ||
      tags.some(tag => tag.includes(term));
  };
}
