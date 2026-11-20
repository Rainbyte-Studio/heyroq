"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACHIEVEMENTS_CATALOG = exports.FOLLOWER_MILESTONES = exports.LIKE_MILESTONES = exports.PROGRESSION_CONSTANTS = exports.EXPLORER_LEVELS = void 0;
exports.getProgressForXp = getProgressForXp;
exports.getPinCreatedEventId = getPinCreatedEventId;
exports.getFirstDiscoveryEventId = getFirstDiscoveryEventId;
exports.getCityFirstEventId = getCityFirstEventId;
exports.getCountryFirstEventId = getCountryFirstEventId;
exports.getRichDiscoveryEventId = getRichDiscoveryEventId;
exports.getAchievementEventId = getAchievementEventId;
exports.getLikeMilestoneEventId = getLikeMilestoneEventId;
exports.getFollowerMilestoneEventId = getFollowerMilestoneEventId;
exports.EXPLORER_LEVELS = [
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
exports.PROGRESSION_CONSTANTS = {
    BASE_DISCOVERY_XP: 50,
    FIRST_DISCOVERY_BONUS_XP: 100,
    UNIQUE_CITY_BONUS_XP: 25,
    UNIQUE_COUNTRY_BONUS_XP: 150,
    RICH_DISCOVERY_BONUS_XP: 25,
    RICH_DISCOVERY_MIN_DESC_LEN: 80,
    RICH_DISCOVERY_MIN_TAGS: 2,
};
exports.LIKE_MILESTONES = [
    { count: 10, xp: 25, eventId: 'likes_received:10' },
    { count: 25, xp: 50, eventId: 'likes_received:25' },
    { count: 50, xp: 75, eventId: 'likes_received:50' },
    { count: 100, xp: 125, eventId: 'likes_received:100' },
    { count: 250, xp: 200, eventId: 'likes_received:250' },
    { count: 500, xp: 300, eventId: 'likes_received:500' },
    { count: 1000, xp: 500, eventId: 'likes_received:1000' },
];
exports.FOLLOWER_MILESTONES = [
    { count: 5, xp: 25, eventId: 'followers:5' },
    { count: 10, xp: 50, eventId: 'followers:10' },
    { count: 25, xp: 75, eventId: 'followers:25' },
    { count: 50, xp: 125, eventId: 'followers:50' },
    { count: 100, xp: 200, eventId: 'followers:100' },
    { count: 250, xp: 300, eventId: 'followers:250' },
    { count: 500, xp: 450, eventId: 'followers:500' },
    { count: 1000, xp: 700, eventId: 'followers:1000' },
];
exports.ACHIEVEMENTS_CATALOG = [
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
    {
        id: 'master_curator',
        title: 'Master Curator',
        description: 'Publish qualifying discoveries at 50 distinct locations.',
        category: 'Exploration',
        iconName: 'Award',
        tier: 'platinum',
        xpReward: 250,
        target: 50,
        metric: (c) => c.distinctDiscoveryCount,
    },
    // --- Geography ---
    {
        id: 'local_explorer',
        geographicDimension: 'city',
        title: 'Local Explorer',
        description: 'Publish a discovery in 1 verified city.',
        category: 'Geography',
        iconName: 'Building',
        tier: 'bronze',
        xpReward: 25,
        target: 1,
        metric: (c) => c.citiesCount,
    },
    {
        id: 'city_scout',
        geographicDimension: 'city',
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
        geographicDimension: 'city',
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
        id: 'city_pathfinder',
        geographicDimension: 'city',
        title: 'City Pathfinder',
        description: 'Publish discoveries in 10 verified cities.',
        category: 'Geography',
        iconName: 'Milestone',
        tier: 'gold',
        xpReward: 150,
        target: 10,
        metric: (c) => c.citiesCount,
    },
    {
        id: 'border_crosser',
        geographicDimension: 'country',
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
        geographicDimension: 'country',
        title: 'World Citizen',
        description: 'Publish authentic spots across 4 different nations.',
        category: 'Geography',
        iconName: 'Plane',
        tier: 'gold',
        xpReward: 150,
        target: 4,
        metric: (c) => c.countriesCount,
    },
    {
        id: 'global_voyager',
        geographicDimension: 'country',
        title: 'Global Voyager',
        description: 'Publish discoveries in 8 verified countries.',
        category: 'Geography',
        iconName: 'Globe',
        tier: 'platinum',
        xpReward: 250,
        target: 8,
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
        description: 'Publish 5 spots with a published photo.',
        category: 'Discovery',
        iconName: 'Camera',
        tier: 'bronze',
        xpReward: 50,
        target: 5,
        metric: (c) => c.photoSpotsCount,
    },
    {
        id: 'versatile_explorer',
        title: 'Versatile Explorer',
        description: 'Publish distinct discoveries across 4 spot categories.',
        category: 'Discovery',
        iconName: 'Compass',
        tier: 'silver',
        xpReward: 75,
        target: 4,
        metric: (c) => c.distinctCategoryCount,
    },
    {
        id: 'detailed_guide',
        title: 'Detailed Guide',
        description: 'Publish 5 distinct discoveries with original descriptions of at least 80 characters and 2 different tags.',
        category: 'Discovery',
        iconName: 'Navigation',
        tier: 'silver',
        xpReward: 75,
        target: 5,
        metric: (c) => c.qualifyingRichCount,
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
        id: 'trusted_voice',
        title: 'Trusted Voice',
        description: 'Receive likes from 50 distinct eligible explorers on your published discoveries.',
        category: 'Community',
        iconName: 'Star',
        tier: 'gold',
        xpReward: 150,
        target: 50,
        metric: (c) => c.trustedLikeCount,
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
        tier: 'gold',
        xpReward: 250,
        target: 5,
        requiresLevel: true,
        metric: (c) => c.level,
    },
    {
        id: 'heyroq_legend',
        title: 'Heyroq Legend',
        description: 'Reach Level 10 (Master Explorer) in Explorer Progression.',
        category: 'Special',
        iconName: 'Crown',
        tier: 'platinum',
        xpReward: 500,
        target: 10,
        requiresLevel: true,
        metric: (c) => c.level,
    },
];
function getProgressForXp(xp) {
    const safeXp = Math.max(0, Math.floor(xp || 0));
    let currentDef = exports.EXPLORER_LEVELS[0];
    for (let i = exports.EXPLORER_LEVELS.length - 1; i >= 0; i--) {
        if (safeXp >= exports.EXPLORER_LEVELS[i].minXp) {
            currentDef = exports.EXPLORER_LEVELS[i];
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
function getPinCreatedEventId(pinId) {
    return `pin_created:${pinId}`;
}
function getFirstDiscoveryEventId() {
    return 'first_discovery';
}
function getCityFirstEventId(canonicalCity, countryCode) {
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
function getCountryFirstEventId(countryCode) {
    return `country_first:${countryCode.toUpperCase().trim()}`;
}
function getRichDiscoveryEventId(pinId) {
    return `rich_discovery:${pinId}`;
}
function getAchievementEventId(achievementId) {
    return `achievement:${achievementId}`;
}
function getLikeMilestoneEventId(count) {
    return `likes_received:${count}`;
}
function getFollowerMilestoneEventId(count) {
    return `followers:${count}`;
}
//# sourceMappingURL=progressionConfig.js.map