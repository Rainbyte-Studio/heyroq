export type PinCategory =
  | 'Food'
  | 'Travel'
  | 'Nature'
  | 'Events'
  | 'Activities'
  | 'Hidden Gems'
  | 'Photography'
  | 'Other';

export interface UserProfile {
  id: string;
  uid?: string;
  username: string;
  displayName: string;
  email: string;
  photoURL?: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  updatedAt?: string;
  followersCount: number;
  followingCount: number;
  pinsCount: number;
  role?: 'user' | 'admin';
  usernameLower?: string;
  displayNameLower?: string;
  countriesCount?: number;
  citiesCount?: number;
}

export interface PublicUserProfile {
  id: string;
  uid?: string;
  username: string;
  displayName: string;
  photoURL?: string;
  avatarUrl?: string;
  bio?: string;
  followersCount: number;
  followingCount: number;
  pinsCount: number;
  countriesCount?: number;
  citiesCount?: number;
  usernameLower?: string;
  displayNameLower?: string;
  suggestionReason?: string;
}

export interface Pin {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  geohash?: string;
  locationName?: string;
  countryCode?: string;
  countryName?: string;
  city?: string;
  category: PinCategory;
  tags: string[];
  imageUrls: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt?: string;
  visibility?: 'public' | 'private' | 'unlisted';
  isPrivate?: boolean;
  status?: 'published' | 'draft' | 'archived' | 'reported' | 'removed';
  isReported?: boolean;
  isDeleted?: boolean;
  isDemo?: boolean;
}

export interface Comment {
  id: string;
  pinId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterEmail?: string;
  targetType: 'pin' | 'comment' | 'user';
  targetId: string;
  pinId?: string;
  reason: string;
  details?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface LatLngBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type DiscoveryFilter = 'all' | 'recent' | 'popular' | 'trending' | 'nearby';

export type ProgressionTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementCategory =
  | 'Exploration'
  | 'Geography'
  | 'Discovery'
  | 'Community'
  | 'Special';

export interface UserProgressionSummary {
  userId: string;
  xp: number;
  level: number;
  title: string;
  nextLevelXp: number;
  currentLevelBaseXp: number;
  progressPercent: number;
  totalSpotsCount: number;
  citiesCount: number;
  countriesCount: number;
  likesReceivedCount: number;
  followersCount: number;
  unlockedAchievementsCount: number;
  totalAchievementsCount: number;
  updatedAt: string;
}

export interface UserAchievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  iconName: string;
  tier: ProgressionTier;
  xpReward: number;
  progress: number;
  target: number;
  isUnlocked: boolean;
  unlockedAt?: string | null;
  qualifiedPhotoProgress?: number;
  /** Server-recorded progress supported by verified geographic evidence. */
  verifiedGeographicProgress?: number;
  updatedAt: string;
}

export interface XpEvent {
  id: string;
  userId: string;
  action: string;
  referenceId?: string;
  xpEarned: number;
  description: string;
  createdAt: string;
}
