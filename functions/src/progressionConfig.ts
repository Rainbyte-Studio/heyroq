export type ProgressionTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementCategory =
  | 'Exploration'
  | 'Geography'
  | 'Discovery'
  | 'Community'
  | 'Special';

export interface ExplorerLevelDef {
  level: number;
  title: string;
  minXp: number;
  maxXp: number;
  badgeColor: string;
}

export const EXPLORER_LEVELS: ExplorerLevelDef[] = [
  { level: 1, title: 'New Explorer', minXp: 0, maxXp: 299, badgeColor: '#9CA3AF' },
  { level: 2, title: 'Wanderer', minXp: 300, maxXp: 749, badgeColor: '#34D399' },
  { level: 3, title: 'Scout', minXp: 750, maxXp: 1499, badgeColor: '#60A5FA' },
  { level: 4, title: 'Trail Seeker', minXp: 1500, maxXp: 2999, badgeColor: '#F59E0B' },
  { level: 5, title: 'Pathfinder', minXp: 3000, maxXp: 5499, badgeColor: '#EC4899' },
  { level: 6, title: 'Wayfinder', minXp: 5500, maxXp: 8999, badgeColor: '#8B5CF6' },
  { level: 7, title: 'Adventurer', minXp: 9000, maxXp: 13999, badgeColor: '#3B82F6' },
  { level: 8, title: 'Voyager', minXp: 14000, maxXp: 21999, badgeColor: '#10B981' },
  { level: 9, title: 'Globetrotter', minXp: 22000, maxXp: 34999, badgeColor: '#F97316' },
  { level: 10, title: 'Master Explorer', minXp: 35000, maxXp: Infinity, badgeColor: '#FF5F40' },
];

export const PROGRESSION_CONSTANTS = {
  BASE_DISCOVERY_XP: 50,
  FIRST_DISCOVERY_BONUS_XP: 100,
  UNIQUE_CITY_BONUS_XP: 25,
  UNIQUE_COUNTRY_BONUS_XP: 150,
  RICH_DISCOVERY_BONUS_XP: 25,
  RICH_DISCOVERY_MIN_DESC_LEN: 80,
  RICH_DISCOVERY_MIN_TAGS: 2,
} as const;

export interface LikeMilestone {
  count: number;
  xp: number;
  eventId: string;
}

export const LIKE_MILESTONES: LikeMilestone[] = [
  { count: 10, xp: 25, eventId: 'likes_received:10' },
  { count: 25, xp: 50, eventId: 'likes_received:25' },
  { count: 50, xp: 75, eventId: 'likes_received:50' },
  { count: 100, xp: 125, eventId: 'likes_received:100' },
  { count: 250, xp: 200, eventId: 'likes_received:250' },
  { count: 500, xp: 300, eventId: 'likes_received:500' },
  { count: 1000, xp: 500, eventId: 'likes_received:1000' },
];

export interface FollowerMilestone {
  count: number;
  xp: number;
  eventId: string;
}

export const FOLLOWER_MILESTONES: FollowerMilestone[] = [
  { count: 5, xp: 25, eventId: 'followers:5' },
  { count: 10, xp: 50, eventId: 'followers:10' },
  { count: 25, xp: 75, eventId: 'followers:25' },
  { count: 50, xp: 125, eventId: 'followers:50' },
  { count: 100, xp: 200, eventId: 'followers:100' },
  { count: 250, xp: 300, eventId: 'followers:250' },
  { count: 500, xp: 450, eventId: 'followers:500' },
  { count: 1000, xp: 700, eventId: 'followers:1000' },
];

export interface MetricContext {
  totalSpots: number;
  citiesCount: number;
  countriesCount: number;
  likesReceived: number;
  followersCount: number;
  hiddenGemsCount: number;
  foodCount: number;
  natureCount: number;
  photoSpotsCount: number;
  profileCompletePoints: number;
  level: number;
}

export interface AchievementBlueprint {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  iconName: string;
  tier: ProgressionTier;
  xpReward: number;
  target: number;
  metric: (data: MetricContext) => number;
}

export const ACHIEVEMENTS_CATALOG: AchievementBlueprint[] = [
  // --- Exploration ---
  {
    id: 'first_discovery',
    title: 'First Step',
    description: 'Publish your very first discovery spot on Heyroq.',
    category: 'Exploration',
    iconName: 'Compass',
    tier: 'bronze',
    xpReward: 25,
    target: 1,
    metric: (c) => c.totalSpots,
  },
  {
    id: 'curator_5',
    title: 'Field Observer',
    description: 'Publish 5 discovery spots across any destination.',
    category: 'Exploration',
    iconName: 'MapPin',
    tier: 'bronze',
    xpReward: 35,
    target: 5,
    metric: (c) => c.totalSpots,
  },
  {
    id: 'curator_15',
    title: 'Seasoned Explorer',
    description: 'Build an archive of 15 unique discovery locations.',
    category: 'Exploration',
    iconName: 'Navigation',
    tier: 'silver',
    xpReward: 75,
    target: 15,
    metric: (c) => c.totalSpots,
  },
  {
    id: 'curator_30',
    title: 'Grand Archivist',
    description: 'Curate a master collection of 30 discovered spots.',
    category: 'Exploration',
    iconName: 'Award',
    tier: 'gold',
    xpReward: 150,
    target: 30,
    metric: (c) => c.totalSpots,
  },

  // --- Geography ---
  {
    id: 'city_scout',
    title: 'Urban Scout',
    description: 'Publish discoveries across 2 different cities.',
    category: 'Geography',
    iconName: 'Building',
    tier: 'bronze',
    xpReward: 30,
    target: 2,
    metric: (c) => c.citiesCount,
  },
  {
    id: 'metro_hopper',
    title: 'Metro Nomad',
    description: 'Drop pins and share spots in 5 different cities.',
    category: 'Geography',
    iconName: 'Milestone',
    tier: 'silver',
    xpReward: 75,
    target: 5,
    metric: (c) => c.citiesCount,
  },
  {
    id: 'border_crosser',
    title: 'Cross Borders',
    description: 'Expand your explorer footprint into 2 different countries.',
    category: 'Geography',
    iconName: 'Globe',
    tier: 'silver',
    xpReward: 75,
    target: 2,
    metric: (c) => c.countriesCount,
  },
  {
    id: 'world_citizen',
    title: 'World Citizen',
    description: 'Publish authentic spots across 4 different nations.',
    category: 'Geography',
    iconName: 'Plane',
    tier: 'gold',
    xpReward: 150,
    target: 4,
    metric: (c) => c.countriesCount,
  },

  // --- Discovery & Categories ---
  {
    id: 'hidden_gems',
    title: 'Off the Beaten Path',
    description: 'Unearth 3 secret spots categorized as Hidden Gems.',
    category: 'Discovery',
    iconName: 'Sparkles',
    tier: 'bronze',
    xpReward: 40,
    target: 3,
    metric: (c) => c.hiddenGemsCount,
  },
  {
    id: 'culinary_guide',
    title: 'Foodie Connoisseur',
    description: 'Share 3 outstanding culinary and dining recommendations.',
    category: 'Discovery',
    iconName: 'Utensils',
    tier: 'bronze',
    xpReward: 40,
    target: 3,
    metric: (c) => c.foodCount,
  },
  {
    id: 'into_the_wild',
    title: 'Into the Wild',
    description: 'Document 3 tranquil nature and outdoor viewpoints.',
    category: 'Discovery',
    iconName: 'Trees',
    tier: 'bronze',
    xpReward: 40,
    target: 3,
    metric: (c) => c.natureCount,
  },
  {
    id: 'visual_storyteller',
    title: 'Visual Storyteller',
    description: 'Publish 5 spots with authentic photography or photo tags.',
    category: 'Discovery',
    iconName: 'Camera',
    tier: 'bronze',
    xpReward: 50,
    target: 5,
    metric: (c) => c.photoSpotsCount,
  },

  // --- Community ---
  {
    id: 'spark_inspiration',
    title: 'Spark of Inspiration',
    description: 'Receive your first like from a fellow explorer.',
    category: 'Community',
    iconName: 'Heart',
    tier: 'bronze',
    xpReward: 25,
    target: 1,
    metric: (c) => c.likesReceived,
  },
  {
    id: 'crowd_favorite',
    title: 'Crowd Favorite',
    description: 'Earn 10 likes across your shared discoveries.',
    category: 'Community',
    iconName: 'Flame',
    tier: 'silver',
    xpReward: 60,
    target: 10,
    metric: (c) => c.likesReceived,
  },
  {
    id: 'beloved_guide',
    title: 'Beloved Guide',
    description: 'Gather 25 total likes from the global explorer community.',
    category: 'Community',
    iconName: 'Star',
    tier: 'gold',
    xpReward: 125,
    target: 25,
    metric: (c) => c.likesReceived,
  },
  {
    id: 'wayfarer_fellowship',
    title: 'Wayfarer Fellowship',
    description: 'Connect with 3 explorers following your travel profile.',
    category: 'Community',
    iconName: 'Users',
    tier: 'silver',
    xpReward: 60,
    target: 3,
    metric: (c) => c.followersCount,
  },

  // --- Special ---
  {
    id: 'complete_profile',
    title: 'Distinguished Identity',
    description: 'Personalize your explorer profile with custom avatar, bio, and first pin.',
    category: 'Special',
    iconName: 'ShieldCheck',
    tier: 'bronze',
    xpReward: 25,
    target: 3,
    metric: (c) => c.profileCompletePoints,
  },
  {
    id: 'pioneer_voyager',
    title: 'Pioneer Voyager',
    description: 'Reach Level 5 (Pathfinder) in Explorer Progression.',
    category: 'Special',
    iconName: 'Crown',
    tier: 'platinum',
    xpReward: 250,
    target: 5,
    metric: (c) => c.level,
  },
];

export function getProgressForXp(xp: number): {
  level: number;
  title: string;
  currentLevelBaseXp: number;
  nextLevelXp: number;
  progressPercent: number;
  badgeColor: string;
} {
  const safeXp = Math.max(0, Math.floor(xp || 0));

  let currentDef = EXPLORER_LEVELS[0];
  for (let i = EXPLORER_LEVELS.length - 1; i >= 0; i--) {
    if (safeXp >= EXPLORER_LEVELS[i].minXp) {
      currentDef = EXPLORER_LEVELS[i];
      break;
    }
  }

  const currentLevelBaseXp = currentDef.minXp;
  const isMaxLevel = currentDef.maxXp === Infinity;
  const nextLevelXp = isMaxLevel ? currentDef.minXp : currentDef.maxXp + 1;

  let progressPercent = 100;
  if (!isMaxLevel) {
    const range = nextLevelXp - currentLevelBaseXp;
    const gained = safeXp - currentLevelBaseXp;
    progressPercent = Math.min(100, Math.max(0, Math.round((gained / range) * 100)));
  }

  return {
    level: currentDef.level,
    title: currentDef.title,
    currentLevelBaseXp,
    nextLevelXp,
    progressPercent,
    badgeColor: currentDef.badgeColor,
  };
}

export function getPinCreatedEventId(pinId: string): string {
  return `pin_created:${pinId}`;
}

export function getFirstDiscoveryEventId(): string {
  return 'first_discovery';
}

export function getCityFirstEventId(canonicalCity: string, countryCode?: string): string {
  const cleanCity = canonicalCity
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9]/g, '');
  if (countryCode && countryCode !== 'GL') {
    return `city_first:${countryCode.toUpperCase().trim()}:${cleanCity}`;
  }
  return `city_first:${cleanCity}`;
}

export function getCountryFirstEventId(countryCode: string): string {
  return `country_first:${countryCode.toUpperCase().trim()}`;
}

export function getRichDiscoveryEventId(pinId: string): string {
  return `rich_discovery:${pinId}`;
}

export function getAchievementEventId(achievementId: string): string {
  return `achievement:${achievementId}`;
}

export function getLikeMilestoneEventId(count: number): string {
  return `likes_received:${count}`;
}

export function getFollowerMilestoneEventId(count: number): string {
  return `followers:${count}`;
}
