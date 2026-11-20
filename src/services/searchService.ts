import { Pin } from '../types';
import { PublicUserProfile } from '../types';
import { searchPins } from './pinService';
import { getSpotSearchTags, hasSpotSearchQuery, normalizeSearchTag, normalizeSearchText } from '../utils/spotSearch';
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
  spotsUnavailable?: boolean;
}

export const EMPTY_SEARCH_RESULTS: CategorizedSearchResults = {
  spots: [],
  people: [],
  cities: [],
  tags: [],
  totalCount: 0,
};

export async function executeGlobalSearch(
  rawQuery: string
): Promise<CategorizedSearchResults> {
  if (!hasSpotSearchQuery(rawQuery)) return EMPTY_SEARCH_RESULTS;

  const isTagQuery = rawQuery.trimStart().startsWith('#');
  const term = normalizeSearchTag(rawQuery);
  const [pins, users] = await Promise.all([
    searchPins(rawQuery).catch(error => {
      console.warn('Spot search unavailable:', error);
      return null;
    }),
    isTagQuery ? Promise.resolve([]) : searchUsers(rawQuery.trim(), 6),
  ]);

  const matchedSpots: GlobalSearchResultItem[] = (pins ?? []).map(pin => ({
    id: `spot_${pin.id}`,
    type: 'spot',
    title: pin.title,
    subtitle: pin.locationName || pin.city || pin.category,
    category: pin.category,
    latitude: pin.latitude,
    longitude: pin.longitude,
    pin,
  }));

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

  (isTagQuery ? [] : pins ?? []).forEach((p) => {
    const cityName = typeof p.city === 'string' && p.city.trim() ? p.city : p.locationName;
    const cleanCityName = typeof cityName === 'string' ? cityName.trim() : '';
    const cityKey = normalizeSearchText(cleanCityName);
    if (!cleanCityName || !cityKey.includes(term)) return;

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
  });

  const tagCounts = new Map<string, number>();
  for (const pin of pins ?? []) {
    for (const tag of getSpotSearchTags(pin)) {
      if (tag.includes(term)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const matchedTags: GlobalSearchResultItem[] = Array.from(tagCounts, ([tag, count]) => ({
    id: `tag_${tag}`,
    type: 'tag',
    title: `#${tag}`,
    subtitle: `${count} ${count === 1 ? 'spot' : 'spots'} tagged`,
    tag,
    spotCount: count,
  }));

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
    spotsUnavailable: pins === null,
  };
}
