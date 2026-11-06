import { Pin } from '../types';

export interface ClusteredPinSummary {
  id: string;
  title: string;
  category: string;
  locationName?: string;
  imageUrl?: string;
  likeCount: number;
  commentCount: number;
}

export interface CityFootprintGroup {
  cityName: string;
  countryName: string;
  spotsCount: number;
  center: { lat: number; lng: number };
  bounds: { north: number; south: number; east: number; west: number };
  pinIds: string[];
}

export interface CountryFootprintGroup {
  countryName: string;
  flag: string;
  spotsCount: number;
  citiesCount: number;
  center: { lat: number; lng: number };
  bounds: { north: number; south: number; east: number; west: number };
  cities: CityFootprintGroup[];
  pinIds: string[];
}

export interface MapDisplayCluster {
  id: string;
  type: 'country' | 'city' | 'spot';
  label: string; // e.g. "NORWAY · 3" or "TROMSØ · 2"
  shortName: string; // e.g. "NORWAY" or "TROMSØ"
  count: number;
  countryName: string;
  cityName?: string;
  flag?: string;
  centroid: { lat: number; lng: number };
  bounds?: { north: number; south: number; east: number; west: number };
  pins: ClusteredPinSummary[];
}

export interface GeographicCluster {
  id: string;
  cityName: string;
  countryName: string;
  displayName: string;
  centroid: {
    lat: number;
    lng: number;
  };
  count: number;
  categoryBreakdown: Record<string, number>;
  pins: ClusteredPinSummary[];
}

export interface FootprintStatsData {
  totalSpots: number;
  citiesCount: number;
  countriesCount: number;
}

export interface DynamicViewportConfig {
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  shouldFitBounds: boolean;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
  minAllowedZoom: number;
  maxAllowedZoom: number;
  scaleDescription: string;
}

// Client-side reverse geocoding memory and persistent localStorage cache
const GEOCODE_CACHE_KEY = 'heyroq_footprint_geocode_cache_v2';
const memoryGeocodeCache = new Map<string, { city: string; country: string }>();

function loadGeocodeCacheFromStorage(): void {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([k, v]) => {
          if (v && typeof v === 'object' && 'city' in v && 'country' in v) {
            memoryGeocodeCache.set(k, v as { city: string; country: string });
          }
        });
      }
    }
  } catch (e) {
    // Ignore local storage parse issues
  }
}

function saveGeocodeCacheToStorage(): void {
  try {
    const obj: Record<string, { city: string; country: string }> = {};
    memoryGeocodeCache.forEach((val, key) => {
      obj[key] = val;
    });
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(obj));
  } catch (e) {
    // Ignore local storage write issues
  }
}

// Initialize on file load
loadGeocodeCacheFromStorage();

/**
 * Haversine formula to calculate great-circle distance between two points in km
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bounding box heuristic for geographic regions and countries worldwide
const REGION_BOUNDS: {
  cityFallback: string;
  country: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}[] = [
  // Norway & Scandinavia
  { cityFallback: 'Tromsø', country: 'Norway', minLat: 69.4, maxLat: 69.9, minLng: 18.5, maxLng: 19.5 },
  { cityFallback: 'Oslo', country: 'Norway', minLat: 59.7, maxLat: 60.1, minLng: 10.4, maxLng: 10.95 },
  { cityFallback: 'Bergen', country: 'Norway', minLat: 60.2, maxLat: 60.6, minLng: 5.1, maxLng: 5.6 },
  { cityFallback: 'Trondheim', country: 'Norway', minLat: 63.3, maxLat: 63.6, minLng: 10.2, maxLng: 10.6 },
  { cityFallback: 'Norway Region', country: 'Norway', minLat: 57.5, maxLat: 71.5, minLng: 4.0, maxLng: 31.5 },

  // Greece & Islands
  { cityFallback: 'Zakynthos', country: 'Greece', minLat: 37.6, maxLat: 37.95, minLng: 20.6, maxLng: 21.05 },
  { cityFallback: 'Athens', country: 'Greece', minLat: 37.8, maxLat: 38.2, minLng: 23.5, maxLng: 24.1 },
  { cityFallback: 'Thessaloniki', country: 'Greece', minLat: 40.5, maxLat: 40.8, minLng: 22.8, maxLng: 23.2 },
  { cityFallback: 'Santorini', country: 'Greece', minLat: 36.3, maxLat: 36.55, minLng: 25.3, maxLng: 25.55 },
  { cityFallback: 'Mykonos', country: 'Greece', minLat: 37.4, maxLat: 37.55, minLng: 25.3, maxLng: 25.45 },
  { cityFallback: 'Crete', country: 'Greece', minLat: 34.8, maxLat: 35.7, minLng: 23.4, maxLng: 26.4 },
  { cityFallback: 'Greece Region', country: 'Greece', minLat: 34.5, maxLat: 42.0, minLng: 19.0, maxLng: 28.5 },

  // France & Western Europe
  { cityFallback: 'Paris', country: 'France', minLat: 48.75, maxLat: 49.0, minLng: 2.15, maxLng: 2.55 },
  { cityFallback: 'Nice', country: 'France', minLat: 43.6, maxLat: 43.8, minLng: 7.15, maxLng: 7.35 },
  { cityFallback: 'France Region', country: 'France', minLat: 42.0, maxLat: 51.5, minLng: -5.0, maxLng: 9.0 },

  // United Kingdom
  { cityFallback: 'London', country: 'United Kingdom', minLat: 51.3, maxLat: 51.7, minLng: -0.5, maxLng: 0.3 },
  { cityFallback: 'Edinburgh', country: 'United Kingdom', minLat: 55.85, maxLat: 56.05, minLng: -3.4, maxLng: -3.05 },
  { cityFallback: 'United Kingdom Region', country: 'United Kingdom', minLat: 49.8, maxLat: 60.8, minLng: -8.5, maxLng: 2.0 },

  // Italy
  { cityFallback: 'Rome', country: 'Italy', minLat: 41.75, maxLat: 42.0, minLng: 12.35, maxLng: 12.65 },
  { cityFallback: 'Florence', country: 'Italy', minLat: 43.7, maxLat: 43.85, minLng: 11.15, maxLng: 11.35 },
  { cityFallback: 'Italy Region', country: 'Italy', minLat: 36.5, maxLat: 47.1, minLng: 6.6, maxLng: 18.6 },

  // Spain
  { cityFallback: 'Barcelona', country: 'Spain', minLat: 41.3, maxLat: 41.5, minLng: 2.05, maxLng: 2.25 },
  { cityFallback: 'Madrid', country: 'Spain', minLat: 40.3, maxLat: 40.55, minLng: -3.85, maxLng: -3.55 },
  { cityFallback: 'Spain Region', country: 'Spain', minLat: 36.0, maxLat: 43.8, minLng: -9.3, maxLng: 4.3 },

  // Germany
  { cityFallback: 'Berlin', country: 'Germany', minLat: 52.35, maxLat: 52.65, minLng: 13.1, maxLng: 13.7 },
  { cityFallback: 'Germany Region', country: 'Germany', minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.1 },

  // Netherlands & Switzerland
  { cityFallback: 'Amsterdam', country: 'Netherlands', minLat: 52.25, maxLat: 52.45, minLng: 4.75, maxLng: 5.05 },
  { cityFallback: 'Zurich', country: 'Switzerland', minLat: 47.3, maxLat: 47.45, minLng: 8.45, maxLng: 8.65 },

  // Japan
  { cityFallback: 'Tokyo', country: 'Japan', minLat: 35.5, maxLat: 35.85, minLng: 139.5, maxLng: 140.0 },
  { cityFallback: 'Kyoto', country: 'Japan', minLat: 34.9, maxLat: 35.15, minLng: 135.6, maxLng: 135.9 },
  { cityFallback: 'Japan Region', country: 'Japan', minLat: 30.0, maxLat: 46.0, minLng: 128.0, maxLng: 146.0 },

  // United States
  { cityFallback: 'New York', country: 'United States', minLat: 40.5, maxLat: 40.95, minLng: -74.15, maxLng: -73.7 },
  { cityFallback: 'San Francisco', country: 'United States', minLat: 37.65, maxLat: 37.85, minLng: -122.55, maxLng: -122.35 },
  { cityFallback: 'Los Angeles', country: 'United States', minLat: 33.7, maxLat: 34.35, minLng: -118.65, maxLng: -118.15 },
  { cityFallback: 'United States Region', country: 'United States', minLat: 24.5, maxLat: 49.5, minLng: -125.0, maxLng: -66.5 },

  // Australia, Canada, Brazil, Indonesia
  { cityFallback: 'Sydney', country: 'Australia', minLat: -34.0, maxLat: -33.6, minLng: 151.0, maxLng: 151.35 },
  { cityFallback: 'Bali', country: 'Indonesia', minLat: -8.9, maxLat: -8.0, minLng: 114.4, maxLng: 115.8 },
  { cityFallback: 'Toronto', country: 'Canada', minLat: 43.55, maxLat: 43.85, minLng: -79.65, maxLng: -79.15 },
  { cityFallback: 'Rio de Janeiro', country: 'Brazil', minLat: -23.1, maxLat: -22.7, minLng: -43.8, maxLng: -43.1 },
];

/**
 * Normalizes city names to prevent duplicate representations of the same place
 * (e.g. "Tromso", "Tromsø", "TROMSØ" -> "Tromsø").
 */
export function normalizeCityName(rawName: string): string {
  if (!rawName) return 'Exploration Spot';
  const trimmed = rawName.trim();
  const lowerWithoutAccents = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const CANONICAL_CITIES: Record<string, string> = {
    tromso: 'Tromsø',
    oslo: 'Oslo',
    bergen: 'Bergen',
    trondheim: 'Trondheim',
    stavanger: 'Stavanger',
    bodo: 'Bodø',
    athens: 'Athens',
    athina: 'Athens',
    santorini: 'Santorini',
    thira: 'Santorini',
    mykonos: 'Mykonos',
    zakynthos: 'Zakynthos',
    zante: 'Zakynthos',
    thessaloniki: 'Thessaloniki',
    salonica: 'Thessaloniki',
    chania: 'Chania',
    hania: 'Chania',
    xania: 'Chania',
    heraklion: 'Heraklion',
    irakleio: 'Heraklion',
    rhodes: 'Rhodes',
    rodos: 'Rhodes',
    corfu: 'Corfu',
    kerkyra: 'Corfu',
    paris: 'Paris',
    montmartre: 'Paris',
    lyon: 'Lyon',
    nice: 'Nice',
    marseille: 'Marseille',
    london: 'London',
    rome: 'Rome',
    roma: 'Rome',
    florence: 'Florence',
    firenze: 'Florence',
    venice: 'Venice',
    venezia: 'Venice',
    milan: 'Milan',
    milano: 'Milan',
    madrid: 'Madrid',
    barcelona: 'Barcelona',
    seville: 'Seville',
    sevilla: 'Seville',
    berlin: 'Berlin',
    munich: 'Munich',
    munchen: 'Munich',
    hamburg: 'Hamburg',
    vienna: 'Vienna',
    wien: 'Vienna',
    prague: 'Prague',
    praha: 'Prague',
    warsaw: 'Warsaw',
    warszawa: 'Warsaw',
    budapest: 'Budapest',
    amsterdam: 'Amsterdam',
    tokyo: 'Tokyo',
    kyoto: 'Kyoto',
    osaka: 'Osaka',
    newyork: 'New York',
    'new york': 'New York',
    sanfrancisco: 'San Francisco',
    'san francisco': 'San Francisco',
    losangeles: 'Los Angeles',
    'los angeles': 'Los Angeles',
    chicago: 'Chicago',
    seattle: 'Seattle',
    sydney: 'Sydney',
    melbourne: 'Melbourne',
    bali: 'Bali',
    canggu: 'Bali',
    ubud: 'Bali',
    seminyak: 'Bali',
  };

  if (CANONICAL_CITIES[lowerWithoutAccents]) {
    return CANONICAL_CITIES[lowerWithoutAccents];
  }

  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export interface CanonicalCountryInfo {
  code: string; // ISO alpha-2
  name: string; // Official display name
}

// Canonical country dictionary mapping names, ISO alpha-2, ISO alpha-3, and aliases to { code, name }
const CANONICAL_COUNTRIES_MAP: Record<string, CanonicalCountryInfo> = {
  // Norway
  norway: { code: 'NO', name: 'Norway' },
  no: { code: 'NO', name: 'Norway' },
  nor: { code: 'NO', name: 'Norway' },
  norge: { code: 'NO', name: 'Norway' },

  // Greece
  greece: { code: 'GR', name: 'Greece' },
  gr: { code: 'GR', name: 'Greece' },
  grc: { code: 'GR', name: 'Greece' },
  hellas: { code: 'GR', name: 'Greece' },
  ellada: { code: 'GR', name: 'Greece' },

  // United States
  'united states': { code: 'US', name: 'United States' },
  'united states of america': { code: 'US', name: 'United States' },
  us: { code: 'US', name: 'United States' },
  usa: { code: 'US', name: 'United States' },

  // United Kingdom
  'united kingdom': { code: 'GB', name: 'United Kingdom' },
  uk: { code: 'GB', name: 'United Kingdom' },
  gb: { code: 'GB', name: 'United Kingdom' },
  gbr: { code: 'GB', name: 'United Kingdom' },
  england: { code: 'GB', name: 'United Kingdom' },
  scotland: { code: 'GB', name: 'United Kingdom' },
  wales: { code: 'GB', name: 'United Kingdom' },

  // France
  france: { code: 'FR', name: 'France' },
  fr: { code: 'FR', name: 'France' },
  fra: { code: 'FR', name: 'France' },

  // Germany
  germany: { code: 'DE', name: 'Germany' },
  de: { code: 'DE', name: 'Germany' },
  deu: { code: 'DE', name: 'Germany' },
  deutschland: { code: 'DE', name: 'Germany' },

  // Italy
  italy: { code: 'IT', name: 'Italy' },
  it: { code: 'IT', name: 'Italy' },
  ita: { code: 'IT', name: 'Italy' },
  italia: { code: 'IT', name: 'Italy' },

  // Spain
  spain: { code: 'ES', name: 'Spain' },
  es: { code: 'ES', name: 'Spain' },
  esp: { code: 'ES', name: 'Spain' },
  espana: { code: 'ES', name: 'Spain' },

  // Japan
  japan: { code: 'JP', name: 'Japan' },
  jp: { code: 'JP', name: 'Japan' },
  jpn: { code: 'JP', name: 'Japan' },
  nippon: { code: 'JP', name: 'Japan' },
  nihon: { code: 'JP', name: 'Japan' },

  // Canada
  canada: { code: 'CA', name: 'Canada' },
  ca: { code: 'CA', name: 'Canada' },
  can: { code: 'CA', name: 'Canada' },

  // Australia
  australia: { code: 'AU', name: 'Australia' },
  au: { code: 'AU', name: 'Australia' },
  aus: { code: 'AU', name: 'Australia' },

  // Netherlands
  netherlands: { code: 'NL', name: 'Netherlands' },
  nl: { code: 'NL', name: 'Netherlands' },
  nld: { code: 'NL', name: 'Netherlands' },
  holland: { code: 'NL', name: 'Netherlands' },

  // Switzerland
  switzerland: { code: 'CH', name: 'Switzerland' },
  ch: { code: 'CH', name: 'Switzerland' },
  che: { code: 'CH', name: 'Switzerland' },

  // Portugal
  portugal: { code: 'PT', name: 'Portugal' },
  pt: { code: 'PT', name: 'Portugal' },
  prt: { code: 'PT', name: 'Portugal' },

  // Sweden
  sweden: { code: 'SE', name: 'Sweden' },
  se: { code: 'SE', name: 'Sweden' },
  swe: { code: 'SE', name: 'Sweden' },
  sverige: { code: 'SE', name: 'Sweden' },

  // Denmark
  denmark: { code: 'DK', name: 'Denmark' },
  dk: { code: 'DK', name: 'Denmark' },
  dnk: { code: 'DK', name: 'Denmark' },

  // Finland
  finland: { code: 'FI', name: 'Finland' },
  fi: { code: 'FI', name: 'Finland' },
  fin: { code: 'FI', name: 'Finland' },
  suomi: { code: 'FI', name: 'Finland' },

  // Iceland
  iceland: { code: 'IS', name: 'Iceland' },
  is: { code: 'IS', name: 'Iceland' },
  isl: { code: 'IS', name: 'Iceland' },

  // Ireland
  ireland: { code: 'IE', name: 'Ireland' },
  ie: { code: 'IE', name: 'Ireland' },
  irl: { code: 'IE', name: 'Ireland' },

  // Austria
  austria: { code: 'AT', name: 'Austria' },
  at: { code: 'AT', name: 'Austria' },
  aut: { code: 'AT', name: 'Austria' },

  // Belgium
  belgium: { code: 'BE', name: 'Belgium' },
  be: { code: 'BE', name: 'Belgium' },
  bel: { code: 'BE', name: 'Belgium' },

  // Poland
  poland: { code: 'PL', name: 'Poland' },
  pl: { code: 'PL', name: 'Poland' },
  pol: { code: 'PL', name: 'Poland' },
  polska: { code: 'PL', name: 'Poland' },

  // Czech Republic
  'czech republic': { code: 'CZ', name: 'Czech Republic' },
  czechia: { code: 'CZ', name: 'Czech Republic' },
  cz: { code: 'CZ', name: 'Czech Republic' },
  cze: { code: 'CZ', name: 'Czech Republic' },

  // Croatia
  croatia: { code: 'HR', name: 'Croatia' },
  hr: { code: 'HR', name: 'Croatia' },
  hrv: { code: 'HR', name: 'Croatia' },

  // Turkey
  turkey: { code: 'TR', name: 'Turkey' },
  turkiye: { code: 'TR', name: 'Turkey' },
  tr: { code: 'TR', name: 'Turkey' },
  tur: { code: 'TR', name: 'Turkey' },

  // Cyprus
  cyprus: { code: 'CY', name: 'Cyprus' },
  cy: { code: 'CY', name: 'Cyprus' },
  cyp: { code: 'CY', name: 'Cyprus' },

  // Thailand
  thailand: { code: 'TH', name: 'Thailand' },
  th: { code: 'TH', name: 'Thailand' },
  tha: { code: 'TH', name: 'Thailand' },

  // Vietnam
  vietnam: { code: 'VN', name: 'Vietnam' },
  vn: { code: 'VN', name: 'Vietnam' },
  vnm: { code: 'VN', name: 'Vietnam' },

  // Mexico
  mexico: { code: 'MX', name: 'Mexico' },
  mx: { code: 'MX', name: 'Mexico' },
  mex: { code: 'MX', name: 'Mexico' },

  // Brazil
  brazil: { code: 'BR', name: 'Brazil' },
  brasil: { code: 'BR', name: 'Brazil' },
  br: { code: 'BR', name: 'Brazil' },
  bra: { code: 'BR', name: 'Brazil' },

  // Indonesia
  indonesia: { code: 'ID', name: 'Indonesia' },
  id: { code: 'ID', name: 'Indonesia' },
  idn: { code: 'ID', name: 'Indonesia' },

  // India
  india: { code: 'IN', name: 'India' },
  in: { code: 'IN', name: 'India' },
  ind: { code: 'IN', name: 'India' },

  // China
  china: { code: 'CN', name: 'China' },
  cn: { code: 'CN', name: 'China' },
  chn: { code: 'CN', name: 'China' },

  // South Korea
  'south korea': { code: 'KR', name: 'South Korea' },
  korea: { code: 'KR', name: 'South Korea' },
  kr: { code: 'KR', name: 'South Korea' },
  kor: { code: 'KR', name: 'South Korea' },

  // New Zealand
  'new zealand': { code: 'NZ', name: 'New Zealand' },
  nz: { code: 'NZ', name: 'New Zealand' },
  nzl: { code: 'NZ', name: 'New Zealand' },

  // Singapore
  singapore: { code: 'SG', name: 'Singapore' },
  sg: { code: 'SG', name: 'Singapore' },
  sgp: { code: 'SG', name: 'Singapore' },
};

/**
 * Resolves a raw country string (name, ISO-2, ISO-3, alias) to canonical ISO code and display name.
 */
export function resolveCountry(rawCountry: string): CanonicalCountryInfo {
  if (!rawCountry) return { code: 'GL', name: 'Global' };
  const trimmed = rawCountry.trim();
  const lower = trimmed.toLowerCase();

  if (CANONICAL_COUNTRIES_MAP[lower]) {
    return CANONICAL_COUNTRIES_MAP[lower];
  }

  // If 2 characters, treat as custom ISO alpha-2
  if (trimmed.length === 2 && /^[A-Za-z]{2}$/.test(trimmed)) {
    const code = trimmed.toUpperCase();
    return { code, name: code };
  }

  const name = trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  const code = name.slice(0, 2).toUpperCase();

  return { code, name };
}

/**
 * Normalizes country names to a consistent, canonical title case format.
 */
export function normalizeCountryName(rawCountry: string): string {
  return resolveCountry(rawCountry).name;
}

/**
 * Extracts normalized City and Country names from a pin using metadata,
 * memory/localStorage cache, keyword detection, and fallback regional boundaries.
 */
export function extractCityAndCountry(pin: Pin): { city: string; country: string; countryCode: string } {
  // Direct structured metadata on pin if available
  if (pin.countryCode || pin.countryName || pin.city) {
    const resolvedCountry = resolveCountry(pin.countryCode || pin.countryName || '');
    return {
      city: normalizeCityName(pin.city || ''),
      country: resolvedCountry.name,
      countryCode: resolvedCountry.code,
    };
  }

  if ((pin as any).country && (pin as any).city) {
    const resolved = resolveCountry(String((pin as any).country));
    return {
      city: normalizeCityName(String((pin as any).city)),
      country: resolved.name,
      countryCode: resolved.code,
    };
  }

  const cacheKey = `${pin.latitude.toFixed(2)},${pin.longitude.toFixed(2)}`;
  const cached = memoryGeocodeCache.get(cacheKey);
  if (cached) {
    const resolved = resolveCountry(cached.country);
    return {
      city: normalizeCityName(cached.city),
      country: resolved.name,
      countryCode: resolved.code,
    };
  }

  const raw = (pin.locationName || '').trim();

  // 1. If locationName has comma format, e.g. "Tromsø, Norway", "Mission District, San Francisco, CA, USA"
  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const countryCandidate = parts[parts.length - 1];
      let cityCandidate = parts[0];

      const usStates = [
        'CA', 'NY', 'TX', 'FL', 'WA', 'IL', 'MA', 'CO', 'OR', 'NV', 'USA', 'United States',
      ];
      const isUS = usStates.includes(countryCandidate.toUpperCase());

      if (parts.length >= 3) {
        // e.g. "Mission District, San Francisco, CA, USA" -> cityCandidate = "San Francisco"
        // e.g. "Montmartre, Paris, France" -> cityCandidate = "Paris"
        if (isUS && parts.length >= 4) {
          cityCandidate = parts[parts.length - 3];
        } else {
          cityCandidate = parts[parts.length - 2];
        }
      }

      const normalizedCountry = isUS ? 'United States' : normalizeCountryName(countryCandidate);
      const normalizedCity = normalizeCityName(cityCandidate);
      return cacheAndReturn(cacheKey, normalizedCity, normalizedCountry);
    }
  }

  // 2. Keyword detection for popular locations
  if (raw) {
    const lower = raw.toLowerCase();
    const lowerNoAccents = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Norway
    if (lowerNoAccents.includes('tromso')) return cacheAndReturn(cacheKey, 'Tromsø', 'Norway');
    if (lower.includes('oslo')) return cacheAndReturn(cacheKey, 'Oslo', 'Norway');
    if (lower.includes('bergen')) return cacheAndReturn(cacheKey, 'Bergen', 'Norway');
    if (lower.includes('trondheim')) return cacheAndReturn(cacheKey, 'Trondheim', 'Norway');
    if (lower.includes('norway')) return cacheAndReturn(cacheKey, 'Norway Spot', 'Norway');

    // Greece
    if (lower.includes('zakynthos') || lower.includes('zante')) {
      return cacheAndReturn(cacheKey, 'Zakynthos', 'Greece');
    }
    if (lower.includes('athens') || lower.includes('athina')) return cacheAndReturn(cacheKey, 'Athens', 'Greece');
    if (lower.includes('santorini') || lower.includes('thira')) return cacheAndReturn(cacheKey, 'Santorini', 'Greece');
    if (lower.includes('mykonos')) return cacheAndReturn(cacheKey, 'Mykonos', 'Greece');
    if (lower.includes('thessaloniki') || lower.includes('salonica')) return cacheAndReturn(cacheKey, 'Thessaloniki', 'Greece');
    if (lower.includes('chania') || lower.includes('hania') || lower.includes('xania')) return cacheAndReturn(cacheKey, 'Chania', 'Greece');
    if (lower.includes('crete') || lower.includes('heraklion')) {
      return cacheAndReturn(cacheKey, 'Crete', 'Greece');
    }

    // Other Global
    if (lower.includes('paris') || lower.includes('montmartre')) {
      return cacheAndReturn(cacheKey, 'Paris', 'France');
    }
    if (lower.includes('london')) return cacheAndReturn(cacheKey, 'London', 'United Kingdom');
    if (lower.includes('rome') || lower.includes('roma')) return cacheAndReturn(cacheKey, 'Rome', 'Italy');
    if (lower.includes('barcelona')) return cacheAndReturn(cacheKey, 'Barcelona', 'Spain');
    if (lower.includes('madrid')) return cacheAndReturn(cacheKey, 'Madrid', 'Spain');
    if (lower.includes('berlin')) return cacheAndReturn(cacheKey, 'Berlin', 'Germany');
    if (lower.includes('tokyo') || lower.includes('shibuya') || lower.includes('shinjuku')) {
      return cacheAndReturn(cacheKey, 'Tokyo', 'Japan');
    }
    if (lower.includes('kyoto')) return cacheAndReturn(cacheKey, 'Kyoto', 'Japan');
    if (lower.includes('new york') || lower.includes('manhattan') || lower.includes('brooklyn')) {
      return cacheAndReturn(cacheKey, 'New York', 'United States');
    }
    if (lower.includes('san francisco') || lower.includes('bay area') || lower.includes('marin')) {
      return cacheAndReturn(cacheKey, 'San Francisco', 'United States');
    }
    if (lower.includes('bali') || lower.includes('canggu') || lower.includes('ubud')) {
      return cacheAndReturn(cacheKey, 'Bali', 'Indonesia');
    }
    if (lower.includes('sydney')) return cacheAndReturn(cacheKey, 'Sydney', 'Australia');
  }

  // 3. Coordinate-based bounding lookup
  for (const b of REGION_BOUNDS) {
    if (
      pin.latitude >= b.minLat &&
      pin.latitude <= b.maxLat &&
      pin.longitude >= b.minLng &&
      pin.longitude <= b.maxLng
    ) {
      return cacheAndReturn(cacheKey, normalizeCityName(raw || b.cityFallback), normalizeCountryName(b.country));
    }
  }

  const fallbackResult = {
    city: normalizeCityName(raw || 'Exploration Spot'),
    country: 'Global',
    countryCode: 'GL',
  };
  memoryGeocodeCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

function cacheAndReturn(cacheKey: string, city: string, country: string) {
  const resolved = resolveCountry(country);
  const res = { city, country: resolved.name, countryCode: resolved.code };
  memoryGeocodeCache.set(cacheKey, res);
  saveGeocodeCacheToStorage();
  return res;
}

/**
 * Aggregates user's pins geographically into city/region clusters.
 *
 * Privacy Guarantees:
 * - Does NOT return individual pin exact coordinates to the map view.
 * - Aggregates pins into cohesive geographic clusters (e.g. "Zakynthos (24)", "Athens (12)").
 * - Obscures centroid coordinates by rounding to 2 decimal places (~1.1 km regional precision).
 * - Filters out invalid coordinates, private pins, unpublished/draft pins, and reported pins.
 */
export function clusterPinsGeographically(
  pins: Pin[],
  maxProximityKm = 45
): GeographicCluster[] {
  if (!pins || pins.length === 0) return [];

  // Filter for valid public pins
  const validPublicPins = pins.filter((pin) => {
    if (!pin) return false;

    // Check coordinate validity
    if (typeof pin.latitude !== 'number' || typeof pin.longitude !== 'number') return false;
    if (isNaN(pin.latitude) || isNaN(pin.longitude)) return false;
    if (pin.latitude < -90 || pin.latitude > 90 || pin.longitude < -180 || pin.longitude > 180) {
      return false;
    }
    // Reject placeholder 0,0 null coordinates
    if (pin.latitude === 0 && pin.longitude === 0) return false;

    // Check privacy and publication status
    if (pin.isPrivate === true || pin.visibility === 'private') return false;
    if (pin.isReported === true || pin.status === 'reported' || pin.status === 'removed') return false;
    if (pin.status === 'draft' || pin.status === 'archived' || pin.isDeleted === true) return false;

    return true;
  });

  if (validPublicPins.length === 0) return [];

  interface MutableCluster {
    cityName: string;
    countryName: string;
    totalLat: number;
    totalLng: number;
    pins: Pin[];
    categoryMap: Record<string, number>;
  }

  const clusters: MutableCluster[] = [];

  for (const pin of validPublicPins) {
    const { city, country } = extractCityAndCountry(pin);
    const normalizedCity = normalizeCityName(city);
    const normalizedCountry = normalizeCountryName(country);

    let matchedCluster: MutableCluster | null = null;

    for (const cluster of clusters) {
      const avgLat = cluster.totalLat / cluster.pins.length;
      const avgLng = cluster.totalLng / cluster.pins.length;
      const distance = haversineDistanceKm(pin.latitude, pin.longitude, avgLat, avgLng);

      const sameCity =
        normalizedCity !== 'Exploration Spot' &&
        cluster.cityName &&
        normalizedCity.toLowerCase() === cluster.cityName.toLowerCase() &&
        distance < 120;

      if (distance <= maxProximityKm || sameCity) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.pins.push(pin);
      matchedCluster.totalLat += pin.latitude;
      matchedCluster.totalLng += pin.longitude;
      matchedCluster.categoryMap[pin.category] =
        (matchedCluster.categoryMap[pin.category] || 0) + 1;

      // Upgrade city name if cluster has generic name but current pin has specific city
      if (
        normalizedCity &&
        normalizedCity !== 'Exploration Spot' &&
        (matchedCluster.cityName === 'Exploration Spot' || matchedCluster.cityName.includes('Region'))
      ) {
        matchedCluster.cityName = normalizedCity;
      }
      if (
        normalizedCountry &&
        normalizedCountry !== 'Global' &&
        matchedCluster.countryName === 'Global'
      ) {
        matchedCluster.countryName = normalizedCountry;
      }
    } else {
      clusters.push({
        cityName: normalizedCity,
        countryName: normalizedCountry,
        totalLat: pin.latitude,
        totalLng: pin.longitude,
        pins: [pin],
        categoryMap: { [pin.category]: 1 },
      });
    }
  }

  // Convert to immutable GeographicCluster with privacy centroid
  return clusters
    .map((c, index) => {
      const count = c.pins.length;
      const rawLat = c.totalLat / count;
      const rawLng = c.totalLng / count;

      // Round centroid to 2 decimal places to protect exact private residences / spots
      const privacyLat = Math.round(rawLat * 100) / 100;
      const privacyLng = Math.round(rawLng * 100) / 100;

      const displayName =
        c.countryName && c.countryName !== 'Global' && !c.cityName.includes(c.countryName)
          ? `${c.cityName}, ${c.countryName}`
          : c.cityName;

      const pinSummaries: ClusteredPinSummary[] = c.pins.map((p) => ({
        id: p.id,
        title: p.title || 'Discovery Spot',
        category: p.category || 'Other',
        locationName: p.locationName,
        imageUrl: p.imageUrls?.[0],
        likeCount: p.likeCount || 0,
        commentCount: p.commentCount || 0,
      }));

      return {
        id: `cluster_${index + 1}_${c.cityName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        cityName: c.cityName,
        countryName: c.countryName,
        displayName,
        centroid: {
          lat: privacyLat,
          lng: privacyLng,
        },
        count,
        categoryBreakdown: c.categoryMap,
        pins: pinSummaries,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculates dynamic statistics: Total spots · Cities · Countries
 */
export function calculateFootprintStats(
  clusters: GeographicCluster[],
  totalValidPins: number
): FootprintStatsData {
  if (totalValidPins === 0 || clusters.length === 0) {
    return {
      totalSpots: 0,
      citiesCount: 0,
      countriesCount: 0,
    };
  }

  const uniqueCities = new Set(
    clusters
      .map((c) => normalizeCityName(c.cityName).toLowerCase())
      .filter((name) => name && name !== 'exploration spot')
  );

  const uniqueCountries = new Set(
    clusters
      .map((c) => normalizeCountryName(c.countryName).toLowerCase())
      .filter((name) => name && name !== 'global')
  );

  return {
    totalSpots: totalValidPins,
    citiesCount: Math.max(1, uniqueCities.size),
    countriesCount: Math.max(1, uniqueCountries.size),
  };
}

/**
 * Computes Dynamic Intelligent Zoom and Bounding logic.
 *
 * Implements strict rules:
 * 1. ONE PIN IN ONE CITY:
 *    -> Zoom to city / surrounding urban area (11.5 - 12.0). Never world or country.
 * 2. MULTIPLE PINS IN ONE CITY:
 *    -> Zoom to city (11.0 - 11.5).
 * 3. MULTIPLE NEARBY CITIES IN SAME REGION:
 *    -> Zoom to relevant region (8.5 - 9.5).
 * 4. MULTIPLE CITIES IN ONE COUNTRY:
 *    -> Zoom to relevant country (6.0 - 7.0). e.g. Zakynthos + Athens + Thessaloniki -> Greece.
 * 5. MULTIPLE COUNTRIES IN ONE CONTINENT:
 *    -> Zoom to continent (4.2 - 5.0). e.g. Athens + Paris + London -> Europe.
 * 6. MULTIPLE CONTINENTS (WORLDWIDE):
 *    -> Global footprint (2.6 - 3.2). Never zoom out so far that gray borders appear!
 */
export function calculateDynamicViewport(
  clusters: GeographicCluster[]
): DynamicViewportConfig {
  // Empty state fallback
  if (clusters.length === 0) {
    return {
      center: { lat: 20, lng: 0 },
      zoom: 2.8,
      shouldFitBounds: false,
      bounds: null,
      minAllowedZoom: 2.6,
      maxAllowedZoom: 16,
      scaleDescription: 'Empty Footprint',
    };
  }

  // RULE 1 & RULE 2: SINGLE CLUSTER (One city / urban area)
  if (clusters.length === 1) {
    const single = clusters[0];
    const isSinglePin = single.count === 1;

    return {
      center: { lat: single.centroid.lat, lng: single.centroid.lng },
      zoom: isSinglePin ? 12 : 11.5,
      shouldFitBounds: false,
      bounds: null,
      minAllowedZoom: 2.6,
      maxAllowedZoom: 16,
      scaleDescription: isSinglePin ? 'Single Spot in City' : 'City Cluster',
    };
  }

  // MULTIPLE CLUSTERS: Compute bounding box and geographic spans
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  clusters.forEach((c) => {
    minLat = Math.min(minLat, c.centroid.lat);
    maxLat = Math.max(maxLat, c.centroid.lat);
    minLng = Math.min(minLng, c.centroid.lng);
    maxLng = Math.max(maxLng, c.centroid.lng);
  });

  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Normalized span taking container width/height aspect ratio into account
  const effectiveSpan = Math.max(latSpan, lngSpan * 0.75);

  const uniqueCountries = new Set(
    clusters
      .map((c) => c.countryName.toLowerCase())
      .filter((c) => c && c !== 'global')
  );

  const bounds = {
    north: maxLat,
    south: minLat,
    east: maxLng,
    west: minLng,
  };

  // RULE 2 (Tight city/metro spread, e.g. < 0.4° span)
  if (effectiveSpan <= 0.4) {
    return {
      center: { lat: centerLat, lng: centerLng },
      zoom: 11,
      shouldFitBounds: true,
      bounds,
      minAllowedZoom: 8,
      maxAllowedZoom: 12,
      scaleDescription: 'Urban Metro Area',
    };
  }

  // RULE 3: MULTIPLE NEARBY CITIES IN SAME REGION (< 1.8° span, e.g. Attica, Riviera, Bay Area)
  if (effectiveSpan <= 1.8) {
    return {
      center: { lat: centerLat, lng: centerLng },
      zoom: 9,
      shouldFitBounds: true,
      bounds,
      minAllowedZoom: 7,
      maxAllowedZoom: 10.5,
      scaleDescription: 'Regional Area',
    };
  }

  // RULE 4: MULTIPLE CITIES IN ONE COUNTRY (effectiveSpan <= 8.5° or single country)
  if (effectiveSpan <= 8.5 || uniqueCountries.size === 1) {
    return {
      center: { lat: centerLat, lng: centerLng },
      zoom: 6.5,
      shouldFitBounds: true,
      bounds,
      minAllowedZoom: 5.5,
      maxAllowedZoom: 8,
      scaleDescription: 'National / Country Scale',
    };
  }

  // RULE 5: MULTIPLE COUNTRIES IN ONE CONTINENT (effectiveSpan <= 35.0°, e.g. Europe)
  if (effectiveSpan <= 35.0) {
    return {
      center: { lat: centerLat, lng: centerLng },
      zoom: 4.5,
      shouldFitBounds: true,
      bounds,
      minAllowedZoom: 3.5,
      maxAllowedZoom: 6,
      scaleDescription: 'Continental Scale',
    };
  }

  // RULE 6: MULTIPLE CONTINENTS (GLOBAL FOOTPRINT)
  // Strictly clamp min zoom to 2.6 to prevent the unrendered gray area problem!
  return {
    center: { lat: centerLat, lng: centerLng },
    zoom: 2.8,
    shouldFitBounds: true,
    bounds,
    minAllowedZoom: 2.6,
    maxAllowedZoom: 4.5,
    scaleDescription: 'Worldwide Footprint',
  };
}

/**
 * Flag Emoji Dictionary for Countries
 */
const COUNTRY_FLAGS: Record<string, string> = {
  norway: '🇳🇴',
  greece: '🇬🇷',
  france: '🇫🇷',
  'united kingdom': '🇬🇧',
  uk: '🇬🇧',
  england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'united states': '🇺🇸',
  usa: '🇺🇸',
  us: '🇺🇸',
  italy: '🇮🇹',
  spain: '🇪🇸',
  germany: '🇩🇪',
  japan: '🇯🇵',
  australia: '🇦🇺',
  canada: '🇨🇦',
  brazil: '🇧🇷',
  indonesia: '🇮🇩',
  netherlands: '🇳🇱',
  holland: '🇳🇱',
  switzerland: '🇨🇭',
  portugal: '🇵🇹',
  sweden: '🇸🇪',
  denmark: '🇩🇰',
  finland: '🇫🇮',
  iceland: '🇮🇸',
  ireland: '🇮🇪',
  austria: '🇦🇹',
  belgium: '🇧🇪',
  poland: '🇵🇱',
  'czech republic': '🇨🇿',
  czechia: '🇨🇿',
  hungary: '🇭🇺',
  croatia: '🇭🇷',
  turkey: '🇹🇷',
  türkiye: '🇹🇷',
  cyprus: '🇨🇾',
  egypt: '🇪🇬',
  morocco: '🇲🇦',
  'south africa': '🇿🇦',
  thailand: '🇹🇭',
  vietnam: '🇻🇳',
  singapore: '🇸🇬',
  malaysia: '🇲🇾',
  philippines: '🇵🇭',
  'south korea': '🇰🇷',
  korea: '🇰🇷',
  'new zealand': '🇳🇿',
  mexico: '🇲🇽',
  argentina: '🇦🇷',
  chile: '🇨🇱',
  colombia: '🇨🇴',
  peru: '🇵🇪',
  india: '🇮🇳',
  'united arab emirates': '🇦🇪',
  uae: '🇦🇪',
  dubai: '🇦🇪',
  israel: '🇮🇱',
  china: '🇨🇳',
  taiwan: '🇹🇼',
  'hong kong': '🇭🇰',
  hongkong: '🇭🇰',
};

/**
 * Returns the country flag emoji for a given country name.
 */
export function getCountryFlagEmoji(countryName: string): string {
  if (!countryName) return '🌍';
  const clean = countryName.trim().toLowerCase();
  if (COUNTRY_FLAGS[clean]) {
    return COUNTRY_FLAGS[clean];
  }
  for (const [key, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return flag;
    }
  }
  // ISO-3166-1 alpha-2 check
  if (clean.length === 2 && /^[a-z]{2}$/.test(clean)) {
    const chars = [...clean.toUpperCase()].map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...chars);
  }
  return '🌍';
}

/**
 * Aggregates pins into Country and City hierarchies for the "Places Discovered" footprint section.
 */
export function aggregatePinsByCountryAndCity(pins: Pin[]): CountryFootprintGroup[] {
  if (!pins || pins.length === 0) return [];

  // Filter valid coordinates & public pins
  const validPins = pins.filter((p) => {
    if (!p) return false;
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return false;
    if (isNaN(p.latitude) || isNaN(p.longitude)) return false;
    if (p.latitude === 0 && p.longitude === 0) return false;
    if (p.isPrivate || p.isReported) return false;
    return true;
  });

  const countryMap = new Map<
    string,
    {
      countryName: string;
      flag: string;
      pins: Pin[];
      totalLat: number;
      totalLng: number;
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
      citiesMap: Map<
        string,
        {
          cityName: string;
          countryName: string;
          pins: Pin[];
          totalLat: number;
          totalLng: number;
          minLat: number;
          maxLat: number;
          minLng: number;
          maxLng: number;
        }
      >;
    }
  >();

  validPins.forEach((pin) => {
    const { city, country } = extractCityAndCountry(pin);
    const normalizedCountry = normalizeCountryName(country || 'Global');
    const normalizedCity = normalizeCityName(city || 'Exploration Spot');

    let cGroup = countryMap.get(normalizedCountry);
    if (!cGroup) {
      cGroup = {
        countryName: normalizedCountry,
        flag: getCountryFlagEmoji(normalizedCountry),
        pins: [],
        totalLat: 0,
        totalLng: 0,
        minLat: pin.latitude,
        maxLat: pin.latitude,
        minLng: pin.longitude,
        maxLng: pin.longitude,
        citiesMap: new Map(),
      };
      countryMap.set(normalizedCountry, cGroup);
    }

    cGroup.pins.push(pin);
    cGroup.totalLat += pin.latitude;
    cGroup.totalLng += pin.longitude;
    cGroup.minLat = Math.min(cGroup.minLat, pin.latitude);
    cGroup.maxLat = Math.max(cGroup.maxLat, pin.latitude);
    cGroup.minLng = Math.min(cGroup.minLng, pin.longitude);
    cGroup.maxLng = Math.max(cGroup.maxLng, pin.longitude);

    // Find matching city group: by normalized name OR geographic proximity (< 40km)
    let cityGroup: any = null;
    if (cGroup.citiesMap.has(normalizedCity)) {
      cityGroup = cGroup.citiesMap.get(normalizedCity);
    } else {
      // Check for proximity or case-insensitive match
      for (const existingGroup of cGroup.citiesMap.values()) {
        if (normalizeCityName(existingGroup.cityName) === normalizedCity) {
          cityGroup = existingGroup;
          break;
        }
        const avgLat = existingGroup.totalLat / existingGroup.pins.length;
        const avgLng = existingGroup.totalLng / existingGroup.pins.length;
        // Haversine distance
        const dLat = ((pin.latitude - avgLat) * Math.PI) / 180;
        const dLng = ((pin.longitude - avgLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((avgLat * Math.PI) / 180) *
            Math.cos((pin.latitude * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (distKm <= 40) {
          cityGroup = existingGroup;
          // If existing group was generic name and this pin has a specific city name, upgrade it
          if (
            (existingGroup.cityName === 'Exploration Spot' || existingGroup.cityName.endsWith('Region')) &&
            normalizedCity !== 'Exploration Spot'
          ) {
            existingGroup.cityName = normalizedCity;
          }
          break;
        }
      }
    }

    if (!cityGroup) {
      cityGroup = {
        cityName: normalizedCity,
        countryName: normalizedCountry,
        pins: [],
        totalLat: 0,
        totalLng: 0,
        minLat: pin.latitude,
        maxLat: pin.latitude,
        minLng: pin.longitude,
        maxLng: pin.longitude,
      };
      cGroup.citiesMap.set(normalizedCity, cityGroup);
    }

    cityGroup.pins.push(pin);
    cityGroup.totalLat += pin.latitude;
    cityGroup.totalLng += pin.longitude;
    cityGroup.minLat = Math.min(cityGroup.minLat, pin.latitude);
    cityGroup.maxLat = Math.max(cityGroup.maxLat, pin.latitude);
    cityGroup.minLng = Math.min(cityGroup.minLng, pin.longitude);
    cityGroup.maxLng = Math.max(cityGroup.maxLng, pin.longitude);
  });

  const result: CountryFootprintGroup[] = [];

  countryMap.forEach((cGroup) => {
    const cities: CityFootprintGroup[] = [];

    cGroup.citiesMap.forEach((cityGroup) => {
      const cCount = cityGroup.pins.length;
      cities.push({
        cityName: cityGroup.cityName,
        countryName: cityGroup.countryName,
        spotsCount: cCount,
        center: {
          lat: Math.round((cityGroup.totalLat / cCount) * 100) / 100,
          lng: Math.round((cityGroup.totalLng / cCount) * 100) / 100,
        },
        bounds: {
          north: cityGroup.maxLat + 0.05,
          south: cityGroup.minLat - 0.05,
          east: cityGroup.maxLng + 0.05,
          west: cityGroup.minLng - 0.05,
        },
        pinIds: cityGroup.pins.map((p) => p.id),
      });
    });

    // Sort cities by spotsCount desc, then alphabetical
    cities.sort((a, b) => b.spotsCount - a.spotsCount || a.cityName.localeCompare(b.cityName));

    const totalCountryPins = cGroup.pins.length;
    result.push({
      countryName: cGroup.countryName,
      flag: cGroup.flag,
      spotsCount: totalCountryPins,
      citiesCount: cities.length,
      center: {
        lat: Math.round((cGroup.totalLat / totalCountryPins) * 100) / 100,
        lng: Math.round((cGroup.totalLng / totalCountryPins) * 100) / 100,
      },
      bounds: {
        north: cGroup.maxLat + 0.5,
        south: cGroup.minLat - 0.5,
        east: cGroup.maxLng + 0.5,
        west: cGroup.minLng - 0.5,
      },
      cities,
      pinIds: cGroup.pins.map((p) => p.id),
    });
  });

  // Sort countries by spotsCount desc, then alphabetical
  result.sort((a, b) => b.spotsCount - a.spotsCount || a.countryName.localeCompare(b.countryName));

  return result;
}

/**
 * Creates Country-level Display Clusters for wider zoom levels.
 * (e.g. "NORWAY · 6" or "GREECE · 5")
 */
export function getCountryDisplayClusters(
  countries: CountryFootprintGroup[],
  clusters: GeographicCluster[]
): MapDisplayCluster[] {
  return countries.map((country) => {
    // Collect pin summaries from corresponding geographic clusters
    const matchingClusters = clusters.filter(
      (c) => c.countryName.toLowerCase() === country.countryName.toLowerCase()
    );
    const pins: ClusteredPinSummary[] = matchingClusters.flatMap((c) => c.pins);

    return {
      id: `country_${country.countryName.toLowerCase().replace(/\s+/g, '_')}`,
      type: 'country',
      label: `${country.countryName.toUpperCase()} · ${country.spotsCount}`,
      shortName: country.countryName.toUpperCase(),
      count: country.spotsCount,
      countryName: country.countryName,
      flag: country.flag,
      centroid: country.center,
      bounds: country.bounds,
      pins,
    };
  });
}

/**
 * Creates City-level Display Clusters for closer zoom levels.
 * (e.g. "TROMSØ · 2" or "ATHENS · 3")
 */
export function getCityDisplayClusters(clusters: GeographicCluster[]): MapDisplayCluster[] {
  return clusters.map((c) => ({
    id: c.id,
    type: 'city',
    label: `${c.cityName.toUpperCase()} · ${c.count}`,
    shortName: c.cityName.toUpperCase(),
    count: c.count,
    countryName: c.countryName,
    cityName: c.cityName,
    centroid: c.centroid,
    pins: c.pins,
  }));
}

