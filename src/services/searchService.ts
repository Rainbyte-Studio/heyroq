import { Pin } from '../types';
import { PublicUserProfile } from '../types';
import { getAllKnownPins } from './pinService';
import { searchUsers } from './userService';

export interface GlobalSearchResultItem {
  id: string;
  type: 'spot' | 'person' | 'city' | 'tag';
  title: string;
  subtitle?: string;
  category?: string;
  avatarUrl?: string;
  latitude?: number;
  longitude?: number;
  pin?: Pin;
  user?: PublicUserProfile;
  tag?: string;
  city?: string;
  spotCount?: number;
}

export interface CategorizedSearchResults {
  spots: GlobalSearchResultItem[];
  people: GlobalSearchResultItem[];
  cities: GlobalSearchResultItem[];
  tags: GlobalSearchResultItem[];
  totalCount: number;
}

/**
 * Normalizes city names for fuzzy/diacritic-friendly comparisons
 * (e.g. Tromsø -> tromso, Zakynthos -> zakynthos)
 */
function normalizeString(val: string): string {
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Unified Global Search Engine for Heyroq.
 * Returns grouped and categorized results: SPOTS, PEOPLE, CITIES, TAGS.
 * Uses normalized queries and real Firestore / Curated data.
 */
export async function executeGlobalSearch(
  rawQuery: string
): Promise<CategorizedSearchResults> {
  const clean = rawQuery.trim().toLowerCase();
  const normClean = normalizeString(clean);
  const tagClean = clean.replace(/^#/, '').trim();
  const normTagClean = normalizeString(tagClean);

  if (!clean || clean.length < 2) {
    return {
      spots: [],
      people: [],
      cities: [],
      tags: [],
      totalCount: 0,
    };
  }

  // 1. Fetch Pins & Users concurrently
  const [allPins, users] = await Promise.all([
    getAllKnownPins().catch(() => [] as Pin[]),
    searchUsers(clean, 6).catch(() => [] as PublicUserProfile[]),
  ]);

  // 2. Spots Categorization
  const matchedSpots: GlobalSearchResultItem[] = [];
  allPins.forEach((p) => {
    const titleNorm = normalizeString(p.title);
    const descNorm = normalizeString(p.description || '');
    const locNorm = normalizeString(p.locationName || '');
    const catNorm = normalizeString(p.category || '');

    const matchTitle = titleNorm.includes(normClean) || (normTagClean && titleNorm.includes(normTagClean));
    const matchDesc = descNorm.includes(normClean) || (normTagClean && descNorm.includes(normTagClean));
    const matchLocation = locNorm.includes(normClean) || (normTagClean && locNorm.includes(normTagClean));
    const matchCat = catNorm.includes(normClean) || (normTagClean && catNorm.includes(normTagClean));
    const matchTag = p.tags?.some((t) => {
      const tNorm = normalizeString(t.replace(/^#/, ''));
      return tNorm.includes(normTagClean) || tNorm.includes(normClean);
    });

    if (matchTitle || matchDesc || matchLocation || matchCat || matchTag) {
      matchedSpots.push({
        id: `spot_${p.id}`,
        type: 'spot',
        title: p.title,
        subtitle: p.locationName || p.category,
        category: p.category,
        latitude: p.latitude,
        longitude: p.longitude,
        pin: p,
      });
    }
  });

  // 3. Cities Categorization (Derived dynamically from real pins)
  const cityBuckets = new Map<
    string,
    {
      cityName: string;
      lat: number;
      lng: number;
      count: number;
    }
  >();

  allPins.forEach((p) => {
    if (!p.locationName) return;
    const cleanCityName = p.locationName.trim();
    const cityKey = normalizeString(cleanCityName);

    if (!cityBuckets.has(cityKey)) {
      cityBuckets.set(cityKey, {
        cityName: cleanCityName,
        lat: p.latitude,
        lng: p.longitude,
        count: 1,
      });
    } else {
      cityBuckets.get(cityKey)!.count += 1;
    }
  });

  const matchedCities: GlobalSearchResultItem[] = [];
  cityBuckets.forEach((c, key) => {
    if (
      key.includes(normClean) ||
      (normTagClean && key.includes(normTagClean))
    ) {
      matchedCities.push({
        id: `city_${key}`,
        type: 'city',
        title: c.cityName,
        subtitle: `${c.count} ${c.count === 1 ? 'spot' : 'spots'} on map`,
        city: c.cityName,
        latitude: c.lat,
        longitude: c.lng,
        spotCount: c.count,
      });
    }
  });

  // 4. Tags Categorization
  const tagBuckets = new Map<string, { tag: string; count: number }>();
  allPins.forEach((p) => {
    p.tags?.forEach((rawTag) => {
      const cleanTag = rawTag.toLowerCase().replace(/^#/, '').trim();
      if (!cleanTag) return;
      const normT = normalizeString(cleanTag);
      if (!tagBuckets.has(normT)) {
        tagBuckets.set(normT, { tag: cleanTag, count: 1 });
      } else {
        tagBuckets.get(normT)!.count += 1;
      }
    });
  });

  const matchedTags: GlobalSearchResultItem[] = [];
  tagBuckets.forEach((entry, key) => {
    if (
      key.includes(normTagClean) ||
      key.includes(normClean)
    ) {
      matchedTags.push({
        id: `tag_${key}`,
        type: 'tag',
        title: `#${entry.tag}`,
        subtitle: `${entry.count} ${entry.count === 1 ? 'spot' : 'spots'} tagged`,
        tag: entry.tag,
        spotCount: entry.count,
      });
    }
  });

  // 5. People Categorization
  const matchedPeople: GlobalSearchResultItem[] = users.map((u) => ({
    id: `person_${u.id}`,
    type: 'person',
    title: u.displayName,
    subtitle: `@${u.username}`,
    avatarUrl: u.avatarUrl || u.photoURL,
    user: u,
  }));

  const spots = matchedSpots.slice(0, 6);
  const people = matchedPeople.slice(0, 4);
  const cities = matchedCities.slice(0, 4);
  const tags = matchedTags.slice(0, 4);

  return {
    spots,
    people,
    cities,
    tags,
    totalCount: spots.length + people.length + cities.length + tags.length,
  };
}
