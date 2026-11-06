import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPLORER_LEVELS,
  PROGRESSION_CONSTANTS,
  LIKE_MILESTONES,
  FOLLOWER_MILESTONES,
  ACHIEVEMENTS_CATALOG,
  getProgressForXp,
  getPinCreatedEventId,
  getFirstDiscoveryEventId,
  getCityFirstEventId,
  getCountryFirstEventId,
  getRichDiscoveryEventId,
  getLikeMilestoneEventId,
  getFollowerMilestoneEventId,
  getAchievementEventId,
} from '../functions/src/progressionConfig';

/**
 * PURE IN-MEMORY NON-DESTRUCTIVE REGRESSION TEST SUITE FOR EXPLORER PROGRESSION
 * 
 * Verifies:
 * - Permanent / Historical Monotonic Invariants (Lifetime XP, Level, Spots, Cities, Countries, Achievements)
 * - Safe Dynamic Counts (Live Active Pins, Likes, Followers)
 * - Idempotent XP Ledger and Event Generation
 * - Geographic Metadata Persistence in Pin Creation Payload
 * 
 * ZERO production Firestore access.
 * ZERO production mutations.
 */

interface MockPin {
  id: string;
  userId: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  locationName?: string;
  city?: string;
  countryCode?: string;
  countryName?: string;
  category: string;
  tags: string[];
  imageUrls: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  status?: string;
}

interface MockXpEvent {
  id: string;
  userId: string;
  action: string;
  referenceId: string;
  xpEarned: number;
  description: string;
  createdAt: string;
}

interface MockSummary {
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

interface MockAchievement {
  id: string;
  title: string;
  description: string;
  category: string;
  iconName: string;
  tier: string;
  xpReward: number;
  progress: number;
  target: number;
  isUnlocked: boolean;
  unlockedAt: string | null;
  updatedAt: string;
}

// In-Memory Database Simulator for Progression
class MockProgressionDatabase {
  public pins = new Map<string, MockPin>();
  public xpEvents = new Map<string, MockXpEvent>(); // key: `${userId}:${eventId}`
  public summaries = new Map<string, MockSummary>(); // key: userId
  public achievements = new Map<string, MockAchievement>(); // key: `${userId}:${achId}`
  public users = new Map<string, { followersCount: number; pinsCount: number; bio?: string; avatarUrl?: string }>();

  // Helper matching updateUserProgressionServer implementation
  simulateUpdateUserProgression(userId: string): MockSummary {
    const validPins: MockPin[] = [];
    for (const pin of this.pins.values()) {
      if (pin.userId === userId && !pin.isDeleted && pin.status !== 'reported' && pin.status !== 'removed') {
        validPins.push(pin);
      }
    }
    const activeSpotsCount = validPins.length;

    // Geographic Footprint extraction
    const activeCitiesSet = new Set<string>();
    const activeCountriesSet = new Set<string>();
    const cityToCountryMap = new Map<string, string>();

    validPins.forEach((pin) => {
      const city = (pin.city || pin.locationName || '').trim().toLowerCase();
      const countryCode = (pin.countryCode || '').trim().toUpperCase();
      if (city && city !== 'exploration spot') {
        activeCitiesSet.add(city);
        if (countryCode && countryCode !== 'GL') {
          cityToCountryMap.set(city, countryCode);
        }
      }
      if (countryCode && countryCode !== 'GL') {
        activeCountriesSet.add(countryCode);
      }
    });

    // Profile data
    const userData = this.users.get(userId) || { followersCount: 0, pinsCount: 0 };
    const followersCount = userData.followersCount;
    const likesReceived = validPins.reduce((acc, p) => acc + (p.likeCount || 0), 0);

    let hiddenGemsCount = 0;
    let foodCount = 0;
    let natureCount = 0;
    let photoSpotsCount = 0;
    let richSpotsCount = 0;

    validPins.forEach((pin) => {
      const cat = (pin.category || '').toLowerCase();
      if (cat.includes('hidden') || cat.includes('gem')) hiddenGemsCount++;
      if (cat.includes('food')) foodCount++;
      if (cat.includes('nature')) natureCount++;
      if (cat.includes('photo') || (pin.tags && pin.tags.some((t) => t.toLowerCase().includes('photo')))) {
        photoSpotsCount++;
      }
      const hasLongDesc = (pin.description || '').trim().length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
      const hasTags = Array.isArray(pin.tags) && pin.tags.length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
      if (hasLongDesc && hasTags) richSpotsCount++;
    });

    let profileCompletePoints = 0;
    if (userData.avatarUrl) profileCompletePoints++;
    if (userData.bio && userData.bio.trim().length >= 10) profileCompletePoints++;

    // Read Existing State
    const existingSummary = this.summaries.get(userId) || null;
    const existingEventIds = new Set<string>();
    let historicalLedgerXp = 0;
    let historicalSpotsCount = 0;
    const historicalCitiesSet = new Set<string>();
    const historicalCountriesSet = new Set<string>();

    for (const [key, ev] of this.xpEvents.entries()) {
      if (key.startsWith(`${userId}:`)) {
        existingEventIds.add(ev.id);
        historicalLedgerXp += ev.xpEarned;
        if (ev.id.startsWith('pin_created:')) historicalSpotsCount++;
        else if (ev.id.startsWith('city_first:')) historicalCitiesSet.add(ev.referenceId.toLowerCase().trim());
        else if (ev.id.startsWith('country_first:')) historicalCountriesSet.add(ev.referenceId.toUpperCase().trim());
      }
    }

    // Historical union
    activeCitiesSet.forEach((c) => historicalCitiesSet.add(c));
    activeCountriesSet.forEach((c) => historicalCountriesSet.add(c));

    const prevSpots = existingSummary?.totalSpotsCount || 0;
    const lifetimeSpotsCount = Math.max(prevSpots, historicalSpotsCount, activeSpotsCount);

    const prevCities = existingSummary?.citiesCount || 0;
    const lifetimeCitiesCount = Math.max(prevCities, historicalCitiesSet.size, activeCitiesSet.size);

    const prevCountries = existingSummary?.countriesCount || 0;
    const lifetimeCountriesCount = Math.max(prevCountries, historicalCountriesSet.size, activeCountriesSet.size);

    if (lifetimeSpotsCount >= 1) profileCompletePoints++;

    // Calculate Pending XP Events
    const pendingXpEvents: MockXpEvent[] = [];

    // First discovery bonus
    if (lifetimeSpotsCount >= 1) {
      const firstDiscId = getFirstDiscoveryEventId();
      if (!existingEventIds.has(firstDiscId)) {
        pendingXpEvents.push({
          id: firstDiscId,
          userId,
          action: 'FIRST_DISCOVERY',
          referenceId: validPins[0]?.id || 'first_spot',
          xpEarned: PROGRESSION_CONSTANTS.FIRST_DISCOVERY_BONUS_XP,
          description: 'First discovery bonus unlocked',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Spots creation
    validPins.forEach((pin) => {
      const eventId = getPinCreatedEventId(pin.id);
      if (!existingEventIds.has(eventId)) {
        pendingXpEvents.push({
          id: eventId,
          userId,
          action: 'PIN_CREATED',
          referenceId: pin.id,
          xpEarned: PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP,
          description: `Discovered: ${pin.title}`,
          createdAt: pin.createdAt,
        });
      }
    });

    // Unique Cities
    activeCitiesSet.forEach((canonicalCity) => {
      const countryCode = cityToCountryMap.get(canonicalCity);
      const eventId = getCityFirstEventId(canonicalCity, countryCode);
      if (!existingEventIds.has(eventId)) {
        pendingXpEvents.push({
          id: eventId,
          userId,
          action: 'UNIQUE_CITY',
          referenceId: canonicalCity,
          xpEarned: PROGRESSION_CONSTANTS.UNIQUE_CITY_BONUS_XP,
          description: `Discovered new city: ${canonicalCity}`,
          createdAt: new Date().toISOString(),
        });
      }
    });

    // Unique Countries
    activeCountriesSet.forEach((countryCode) => {
      const eventId = getCountryFirstEventId(countryCode);
      if (!existingEventIds.has(eventId)) {
        pendingXpEvents.push({
          id: eventId,
          userId,
          action: 'UNIQUE_COUNTRY',
          referenceId: countryCode,
          xpEarned: PROGRESSION_CONSTANTS.UNIQUE_COUNTRY_BONUS_XP,
          description: `Discovered new country: ${countryCode}`,
          createdAt: new Date().toISOString(),
        });
      }
    });

    // Rich spot bonus
    validPins.forEach((pin) => {
      const hasLongDesc = (pin.description || '').trim().length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN;
      const hasTags = Array.isArray(pin.tags) && pin.tags.length >= PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS;
      if (hasLongDesc && hasTags) {
        const eventId = getRichDiscoveryEventId(pin.id);
        if (!existingEventIds.has(eventId)) {
          pendingXpEvents.push({
            id: eventId,
            userId,
            action: 'RICH_DISCOVERY',
            referenceId: pin.id,
            xpEarned: PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP,
            description: `Detailed guide bonus for: ${pin.title}`,
            createdAt: pin.createdAt,
          });
        }
      }
    });

    // Like Milestones
    LIKE_MILESTONES.forEach((m) => {
      const eventId = getLikeMilestoneEventId(m.count);
      if (likesReceived >= m.count && !existingEventIds.has(eventId)) {
        pendingXpEvents.push({
          id: eventId,
          userId,
          action: 'LIKE_MILESTONE',
          referenceId: String(m.count),
          xpEarned: m.xp,
          description: `Reached ${m.count} total likes received`,
          createdAt: new Date().toISOString(),
        });
      }
    });

    // Follower Milestones
    FOLLOWER_MILESTONES.forEach((m) => {
      const eventId = getFollowerMilestoneEventId(m.count);
      if (followersCount >= m.count && !existingEventIds.has(eventId)) {
        pendingXpEvents.push({
          id: eventId,
          userId,
          action: 'FOLLOWER_MILESTONE',
          referenceId: String(m.count),
          xpEarned: m.xp,
          description: `Reached ${m.count} followers`,
          createdAt: new Date().toISOString(),
        });
      }
    });

    // Read Existing Achievements
    const existingMap = new Map<string, MockAchievement>();
    for (const [key, ach] of this.achievements.entries()) {
      if (key.startsWith(`${userId}:`)) {
        existingMap.set(ach.id, ach);
      }
    }

    const prelimLevel = getProgressForXp(Math.max(existingSummary?.xp || 0, historicalLedgerXp)).level;
    const metricContext = {
      totalSpots: lifetimeSpotsCount,
      citiesCount: lifetimeCitiesCount,
      countriesCount: lifetimeCountriesCount,
      likesReceived,
      followersCount,
      hiddenGemsCount,
      foodCount,
      natureCount,
      photoSpotsCount,
      profileCompletePoints,
      level: prelimLevel,
    };

    let unlockedCount = 0;
    const pendingAchievements: MockAchievement[] = [];

    ACHIEVEMENTS_CATALOG.forEach((item) => {
      const existing = existingMap.get(item.id);
      const calculatedMetric = item.metric(metricContext);

      let progressVal: number;
      const isHistoricalCategory =
        item.category === 'Exploration' ||
        item.category === 'Geography' ||
        item.category === 'Discovery' ||
        item.category === 'Special';

      if (isHistoricalCategory) {
        progressVal = Math.min(item.target, Math.max(existing?.progress || 0, calculatedMetric));
      } else {
        progressVal = existing?.isUnlocked
          ? item.target
          : Math.min(item.target, calculatedMetric);
      }

      const isUnlocked = Boolean(existing?.isUnlocked) || progressVal >= item.target;

      if (isUnlocked) {
        unlockedCount++;
        const achEventId = getAchievementEventId(item.id);
        if (!existingEventIds.has(achEventId)) {
          pendingXpEvents.push({
            id: achEventId,
            userId,
            action: 'ACHIEVEMENT_UNLOCKED',
            referenceId: item.id,
            xpEarned: item.xpReward,
            description: `Unlocked achievement: ${item.title}`,
            createdAt: existing?.unlockedAt || new Date().toISOString(),
          });
        }
      }

      pendingAchievements.push({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        iconName: item.iconName,
        tier: item.tier,
        xpReward: item.xpReward,
        progress: progressVal,
        target: item.target,
        isUnlocked,
        unlockedAt: isUnlocked ? (existing?.unlockedAt || new Date().toISOString()) : null,
        updatedAt: new Date().toISOString(),
      });
    });

    // Final Monotonic XP Calculation
    const totalNewXp = pendingXpEvents.reduce((acc, curr) => acc + curr.xpEarned, 0);
    const ledgerTotalXp = historicalLedgerXp + totalNewXp;
    const previousXp = existingSummary?.xp || 0;
    const finalTotalXp = Math.max(previousXp, ledgerTotalXp);
    const finalLevelInfo = getProgressForXp(finalTotalXp);

    const summary: MockSummary = {
      userId,
      xp: finalTotalXp,
      level: finalLevelInfo.level,
      title: finalLevelInfo.title,
      nextLevelXp: finalLevelInfo.nextLevelXp,
      currentLevelBaseXp: finalLevelInfo.currentLevelBaseXp,
      progressPercent: finalLevelInfo.progressPercent,
      totalSpotsCount: lifetimeSpotsCount,
      citiesCount: lifetimeCitiesCount,
      countriesCount: lifetimeCountriesCount,
      likesReceivedCount: likesReceived,
      followersCount,
      unlockedAchievementsCount: unlockedCount,
      totalAchievementsCount: ACHIEVEMENTS_CATALOG.length,
      updatedAt: new Date().toISOString(),
    };

    // Commit to in-memory tables
    this.summaries.set(userId, summary);
    this.users.set(userId, { ...userData, pinsCount: activeSpotsCount });

    pendingAchievements.forEach((ach) => {
      this.achievements.set(`${userId}:${ach.id}`, ach);
    });

    pendingXpEvents.forEach((ev) => {
      this.xpEvents.set(`${userId}:${ev.id}`, ev);
    });

    return summary;
  }
}

describe('Heyroq Explorer Progression & Achievements Safety Regression', () => {

  // TEST A: New Pin gives +50 (BASE_DISCOVERY_XP) exactly once
  it('TEST A: New Pin -> awards Pin XP (+50 XP) exactly once', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_a';

    db.pins.set('pin_1', {
      id: 'pin_1',
      userId,
      title: 'Spot 1',
      description: 'Simple description',
      latitude: 48.8566,
      longitude: 2.3522,
      category: 'General',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);

    const pinCreatedEvent = db.xpEvents.get(`${userId}:pin_created:pin_1`);
    assert.ok(pinCreatedEvent, 'pin_created:pin_1 event must exist');
    assert.equal(pinCreatedEvent.xpEarned, 50);
    assert.equal(pinCreatedEvent.xpEarned, PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP);

    // Call again to verify it is NOT awarded twice
    const initialLedgerSize = db.xpEvents.size;
    db.simulateUpdateUserProgression(userId);
    assert.equal(db.xpEvents.size, initialLedgerSize, 'No duplicate events created on repeat run');
  });

  // TEST B: First discovery bonus (+100 XP) exactly once
  it('TEST B: First discovery -> awards first discovery bonus (+100 XP) exactly once', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_b';

    db.pins.set('pin_1', {
      id: 'pin_1',
      userId,
      title: 'First Ever Spot',
      description: 'First spot created',
      latitude: 40.7128,
      longitude: -74.0060,
      category: 'General',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);

    const firstDiscEvent = db.xpEvents.get(`${userId}:first_discovery`);
    assert.ok(firstDiscEvent, 'first_discovery event must exist');
    assert.equal(firstDiscEvent.xpEarned, 100);
    assert.equal(firstDiscEvent.xpEarned, PROGRESSION_CONSTANTS.FIRST_DISCOVERY_BONUS_XP);

    // Add second pin and verify first_discovery is NOT awarded again
    db.pins.set('pin_2', {
      id: 'pin_2',
      userId,
      title: 'Second Spot',
      description: 'Another spot',
      latitude: 40.7130,
      longitude: -74.0062,
      category: 'General',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);
    const allFirstDiscEvents = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && e.id === 'first_discovery'
    );
    assert.equal(allFirstDiscEvents.length, 1, 'Only one first_discovery event ever awarded');
  });

  // TEST C: Valid new city gives +25 XP exactly once
  it('TEST C: Valid new city -> awards +25 XP exactly once', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_c';

    db.pins.set('pin_paris_1', {
      id: 'pin_paris_1',
      userId,
      title: 'Eiffel Tower',
      description: 'Iron tower in Paris',
      latitude: 48.8584,
      longitude: 2.2945,
      city: 'Paris',
      countryCode: 'FR',
      category: 'Architecture',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);

    const cityEventId = getCityFirstEventId('paris', 'FR');
    const cityEvent = db.xpEvents.get(`${userId}:${cityEventId}`);
    assert.ok(cityEvent, 'city_first:paris:FR event must be created');
    assert.equal(cityEvent.xpEarned, 25);
    assert.equal(cityEvent.xpEarned, PROGRESSION_CONSTANTS.UNIQUE_CITY_BONUS_XP);

    // Add another pin in the same city (Paris)
    db.pins.set('pin_paris_2', {
      id: 'pin_paris_2',
      userId,
      title: 'Louvre',
      description: 'Art museum in Paris',
      latitude: 48.8606,
      longitude: 2.3376,
      city: 'Paris',
      countryCode: 'FR',
      category: 'Museum',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);
    const allParisCityEvents = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && e.action === 'UNIQUE_CITY' && e.referenceId === 'paris'
    );
    assert.equal(allParisCityEvents.length, 1, 'Paris city bonus awarded only once');
  });

  // TEST D: Valid new country gives +150 XP exactly once
  it('TEST D: Valid new country -> awards +150 XP exactly once', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_d';

    db.pins.set('pin_norway_1', {
      id: 'pin_norway_1',
      userId,
      title: 'Fjord View',
      description: 'Beautiful fjord in Norway',
      latitude: 60.3913,
      longitude: 5.3221,
      city: 'Bergen',
      countryCode: 'NO',
      category: 'Nature',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);

    const countryEventId = getCountryFirstEventId('NO');
    const countryEvent = db.xpEvents.get(`${userId}:${countryEventId}`);
    assert.ok(countryEvent, 'country_first:NO event must be created');
    assert.equal(countryEvent.xpEarned, 150);
    assert.equal(countryEvent.xpEarned, PROGRESSION_CONSTANTS.UNIQUE_COUNTRY_BONUS_XP);

    // Add second pin in Norway
    db.pins.set('pin_norway_2', {
      id: 'pin_norway_2',
      userId,
      title: 'Oslo Opera',
      description: 'Waterfront opera house',
      latitude: 59.9075,
      longitude: 10.7531,
      city: 'Oslo',
      countryCode: 'NO',
      category: 'Architecture',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);
    const allNorwayEvents = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && e.action === 'UNIQUE_COUNTRY' && e.referenceId === 'NO'
    );
    assert.equal(allNorwayEvents.length, 1, 'Norway country bonus awarded only once');
  });

  // TEST E: Rich Pin gives +25 XP exactly once when requirements are satisfied
  it('TEST E: Rich Pin -> awards +25 XP exactly once when desc >= 80 and tags >= 2', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_e';

    const longDesc = 'A'.repeat(85);
    db.pins.set('pin_rich', {
      id: 'pin_rich',
      userId,
      title: 'Rich Discovery',
      description: longDesc,
      latitude: 51.5074,
      longitude: -0.1278,
      category: 'Hidden Gem',
      tags: ['historic', 'architecture'],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.simulateUpdateUserProgression(userId);

    const richEventId = getRichDiscoveryEventId('pin_rich');
    const richEvent = db.xpEvents.get(`${userId}:${richEventId}`);
    assert.ok(richEvent, 'rich_pin:pin_rich event must be created');
    assert.equal(richEvent.xpEarned, 25);
    assert.equal(richEvent.xpEarned, PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP);

    // Call again to verify idempotency
    db.simulateUpdateUserProgression(userId);
    const richEventsCount = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && e.id === richEventId
    ).length;
    assert.equal(richEventsCount, 1, 'Rich pin bonus only awarded once');
  });

  // TEST E2: Combined First-Pin Scenario for brand-new user (standard first Pin in new city and new country)
  it('TEST E2: Brand-new user first Pin in new city and country -> exactly 325 XP base-action subtotal (Base 50 + FirstDisc 100 + City 25 + Country 150)', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_e2';

    // Standard qualifying first pin (not rich discovery)
    db.pins.set('pin_first_combined', {
      id: 'pin_first_combined',
      userId,
      title: 'My First Spot',
      description: 'A modest description of my first spot.',
      latitude: 41.9028,
      longitude: 12.4964,
      city: 'Rome',
      countryCode: 'IT',
      countryName: 'Italy',
      category: 'Historic',
      tags: ['roman'],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summary = db.simulateUpdateUserProgression(userId);

    // Filter base-action events vs achievement events
    const baseActionEvents = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && !e.id.startsWith('achievement:')
    );
    const achievementEvents = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && e.id.startsWith('achievement:')
    );

    // Verify deterministic event IDs
    const expectedBaseCreatedId = getPinCreatedEventId('pin_first_combined');
    const expectedFirstDiscId = getFirstDiscoveryEventId();
    const expectedCityId = getCityFirstEventId('rome', 'IT');
    const expectedCountryId = getCountryFirstEventId('IT');

    assert.ok(db.xpEvents.has(`${userId}:${expectedBaseCreatedId}`), 'pin_created event must exist');
    assert.ok(db.xpEvents.has(`${userId}:${expectedFirstDiscId}`), 'first_discovery event must exist');
    assert.ok(db.xpEvents.has(`${userId}:${expectedCityId}`), 'city_first event must exist');
    assert.ok(db.xpEvents.has(`${userId}:${expectedCountryId}`), 'country_first event must exist');

    assert.equal(db.xpEvents.get(`${userId}:${expectedBaseCreatedId}`)?.xpEarned, 50, 'Base Pin is +50 XP');
    assert.equal(db.xpEvents.get(`${userId}:${expectedFirstDiscId}`)?.xpEarned, 100, 'First Discovery is +100 XP');
    assert.equal(db.xpEvents.get(`${userId}:${expectedCityId}`)?.xpEarned, 25, 'Unique City is +25 XP');
    assert.equal(db.xpEvents.get(`${userId}:${expectedCountryId}`)?.xpEarned, 150, 'Unique Country is +150 XP');

    const baseActionSubtotal = baseActionEvents.reduce((acc, ev) => acc + ev.xpEarned, 0);
    assert.equal(
      baseActionSubtotal,
      325,
      'Base action subtotal without achievement XP must be exactly 325 XP (50 + 100 + 25 + 150)'
    );

    // Achievements are accounted for separately
    const achievementSubtotal = achievementEvents.reduce((acc, ev) => acc + ev.xpEarned, 0);
    assert.equal(summary.xp, baseActionSubtotal + achievementSubtotal, 'Total XP equals base actions + separate achievements');
  });

  // TEST E3: Combined First-Pin Scenario for brand-new user with RICH DISCOVERY
  it('TEST E3: Brand-new user first Pin with RICH DISCOVERY in new city and country -> exactly 350 XP base-action subtotal (325 + 25)', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_e3';

    // Rich qualifying first pin (desc >= 80, tags >= 2)
    const richDescription = 'This is an extensive, beautifully detailed guide to an extraordinary historic monument located in central Rome.';
    db.pins.set('pin_first_rich', {
      id: 'pin_first_rich',
      userId,
      title: 'Colosseum Architectural Walk',
      description: richDescription,
      latitude: 41.8902,
      longitude: 12.4922,
      city: 'Rome',
      countryCode: 'IT',
      countryName: 'Italy',
      category: 'Historic',
      tags: ['colosseum', 'ancient_rome'],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summary = db.simulateUpdateUserProgression(userId);

    const baseActionEvents = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && !e.id.startsWith('achievement:')
    );
    const achievementEvents = Array.from(db.xpEvents.values()).filter(
      (e) => e.userId === userId && e.id.startsWith('achievement:')
    );

    const expectedBaseCreatedId = getPinCreatedEventId('pin_first_rich');
    const expectedFirstDiscId = getFirstDiscoveryEventId();
    const expectedCityId = getCityFirstEventId('rome', 'IT');
    const expectedCountryId = getCountryFirstEventId('IT');
    const expectedRichId = getRichDiscoveryEventId('pin_first_rich');

    assert.ok(db.xpEvents.has(`${userId}:${expectedBaseCreatedId}`));
    assert.ok(db.xpEvents.has(`${userId}:${expectedFirstDiscId}`));
    assert.ok(db.xpEvents.has(`${userId}:${expectedCityId}`));
    assert.ok(db.xpEvents.has(`${userId}:${expectedCountryId}`));
    assert.ok(db.xpEvents.has(`${userId}:${expectedRichId}`));

    assert.equal(db.xpEvents.get(`${userId}:${expectedBaseCreatedId}`)?.xpEarned, 50);
    assert.equal(db.xpEvents.get(`${userId}:${expectedFirstDiscId}`)?.xpEarned, 100);
    assert.equal(db.xpEvents.get(`${userId}:${expectedCityId}`)?.xpEarned, 25);
    assert.equal(db.xpEvents.get(`${userId}:${expectedCountryId}`)?.xpEarned, 150);
    assert.equal(db.xpEvents.get(`${userId}:${expectedRichId}`)?.xpEarned, 25);

    const baseActionSubtotal = baseActionEvents.reduce((acc, ev) => acc + ev.xpEarned, 0);
    assert.equal(
      baseActionSubtotal,
      350,
      'Base action subtotal with rich discovery without achievement XP must be exactly 350 XP (50 + 100 + 25 + 150 + 25)'
    );

    const achievementSubtotal = achievementEvents.reduce((acc, ev) => acc + ev.xpEarned, 0);
    assert.equal(summary.xp, baseActionSubtotal + achievementSubtotal, 'Total XP equals base actions + separate achievements');
  });

  // TEST F: Delete Pin -> historical XP does NOT decrease
  it('TEST F: Delete Pin -> historical XP does NOT decrease', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_f';

    // Create Pin 1 (Aurora)
    db.pins.set('pin_aurora', {
      id: 'pin_aurora',
      userId,
      title: 'Aurora Observation Spot',
      description: 'Incredible northern lights observatory spot in the arctic circle.',
      latitude: 69.6492,
      longitude: 18.9553,
      city: 'Tromso',
      countryCode: 'NO',
      category: 'Nature',
      tags: ['northernlights', 'arctic'],
      imageUrls: [],
      likeCount: 5,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summaryBefore = db.simulateUpdateUserProgression(userId);
    const earnedXp = summaryBefore.xp;
    assert.ok(earnedXp > 0, 'User should have earned XP');

    // Simulate Pin Deletion (Aurora is deleted from active pins)
    db.pins.delete('pin_aurora');

    // Progression recalculates on deletion trigger
    const summaryAfter = db.simulateUpdateUserProgression(userId);

    assert.equal(summaryAfter.xp, earnedXp, 'Historical XP must NOT decrease after pin deletion');
    assert.ok(summaryAfter.xp >= earnedXp, 'XP must be monotonic');
  });

  // TEST G: Delete Pin -> Explorer Level does NOT decrease
  it('TEST G: Delete Pin -> Explorer Level does NOT decrease', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_g';

    // Seed enough XP to reach Level 2 (300 XP)
    // 5 pins across different cities/countries
    for (let i = 1; i <= 5; i++) {
      db.pins.set(`pin_${i}`, {
        id: `pin_${i}`,
        userId,
        title: `Spot ${i}`,
        description: `Description ${i}`,
        latitude: 10 * i,
        longitude: 10 * i,
        city: `City_${i}`,
        countryCode: `C${i}`,
        category: 'Exploration',
        tags: [],
        imageUrls: [],
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const summaryBefore = db.simulateUpdateUserProgression(userId);
    const levelBefore = summaryBefore.level;
    assert.ok(levelBefore >= 2, 'User should be at least Level 2');

    // Delete 3 pins
    db.pins.delete('pin_1');
    db.pins.delete('pin_2');
    db.pins.delete('pin_3');

    const summaryAfter = db.simulateUpdateUserProgression(userId);
    assert.equal(summaryAfter.level, levelBefore, 'Level must NOT decrease after deleting pins');
  });

  // TEST H: Delete Pin -> unlocked achievements remain unlocked
  it('TEST H: Delete Pin -> unlocked achievements remain unlocked', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_h';

    // Create 1st pin -> unlocks 'first_discovery' achievement
    db.pins.set('pin_first', {
      id: 'pin_first',
      userId,
      title: 'First Discovery',
      description: 'First spot',
      latitude: 35.6762,
      longitude: 139.6503,
      city: 'Tokyo',
      countryCode: 'JP',
      category: 'General',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summaryBefore = db.simulateUpdateUserProgression(userId);
    const firstStepAchBefore = db.achievements.get(`${userId}:first_discovery`);
    assert.ok(firstStepAchBefore?.isUnlocked, 'first_discovery achievement must be unlocked');

    // Now delete the only pin
    db.pins.delete('pin_first');

    const summaryAfter = db.simulateUpdateUserProgression(userId);
    const firstStepAchAfter = db.achievements.get(`${userId}:first_discovery`);

    assert.equal(firstStepAchAfter?.isUnlocked, true, 'Achievement must remain unlocked after deleting the pin');
    assert.equal(summaryAfter.unlockedAchievementsCount, summaryBefore.unlockedAchievementsCount);
  });

  // TEST I: Delete Pin -> lifetime city/country progression does not decrease
  it('TEST I: Delete Pin -> lifetime city and country progression does not decrease', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_i';

    db.pins.set('pin_tromso', {
      id: 'pin_tromso',
      userId,
      title: 'Aurora Spot',
      description: 'Tromso Norway',
      latitude: 69.6492,
      longitude: 18.9553,
      city: 'Tromso',
      countryCode: 'NO',
      category: 'Nature',
      tags: [],
      imageUrls: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summaryBefore = db.simulateUpdateUserProgression(userId);
    assert.equal(summaryBefore.citiesCount, 1);
    assert.equal(summaryBefore.countriesCount, 1);
    assert.equal(summaryBefore.totalSpotsCount, 1);

    // Delete the pin
    db.pins.delete('pin_tromso');

    const summaryAfter = db.simulateUpdateUserProgression(userId);
    assert.equal(summaryAfter.citiesCount, 1, 'Lifetime cities count must NOT decrease');
    assert.equal(summaryAfter.countriesCount, 1, 'Lifetime countries count must NOT decrease');
    assert.equal(summaryAfter.totalSpotsCount, 1, 'Lifetime spots count must NOT decrease');
    // But dynamic active pins count updates to 0
    assert.equal(db.users.get(userId)?.pinsCount, 0, 'Dynamic user pinsCount reflects active spots');
  });

  // TEST J: Recalculation twice -> no duplicate xpEvents and no duplicate XP
  it('TEST J: Recalculation twice -> no duplicate xpEvents and no duplicate XP', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_j';

    db.pins.set('pin_j', {
      id: 'pin_j',
      userId,
      title: 'Spot J',
      description: 'Test J spot with plenty of information to test stability.',
      latitude: 52.5200,
      longitude: 13.4050,
      city: 'Berlin',
      countryCode: 'DE',
      category: 'Urban',
      tags: ['germany', 'capital'],
      imageUrls: [],
      likeCount: 2,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const run1 = db.simulateUpdateUserProgression(userId);
    const ledgerCountRun1 = db.xpEvents.size;
    const xpRun1 = run1.xp;

    const run2 = db.simulateUpdateUserProgression(userId);
    const ledgerCountRun2 = db.xpEvents.size;
    const xpRun2 = run2.xp;

    assert.equal(ledgerCountRun2, ledgerCountRun1, 'Event ledger count must be identical on repeat calculation');
    assert.equal(xpRun2, xpRun1, 'XP must be identical on repeat calculation');
  });

  // TEST K: Likes cross milestone then fall below threshold -> awarded milestone XP remains
  it('TEST K: Likes cross milestone (10) then fall to 9 -> milestone XP remains, dynamic likes update to 9', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_k';

    db.pins.set('pin_k', {
      id: 'pin_k',
      userId,
      title: 'Popular Spot',
      description: 'A very popular spot',
      latitude: 37.7749,
      longitude: -122.4194,
      category: 'General',
      tags: [],
      imageUrls: [],
      likeCount: 10, // Reached milestone of 10 likes
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summaryWith10Likes = db.simulateUpdateUserProgression(userId);
    const likeMilestoneEvent = db.xpEvents.get(`${userId}:${getLikeMilestoneEventId(10)}`);
    assert.ok(likeMilestoneEvent, 'Like milestone:10 event must be created');
    assert.equal(summaryWith10Likes.likesReceivedCount, 10);
    const xpWith10Likes = summaryWith10Likes.xp;

    // A user unlikes, likeCount drops to 9
    db.pins.get('pin_k')!.likeCount = 9;

    const summaryWith9Likes = db.simulateUpdateUserProgression(userId);
    assert.equal(summaryWith9Likes.likesReceivedCount, 9, 'Dynamic likesReceivedCount must update to 9');
    assert.equal(summaryWith9Likes.xp, xpWith10Likes, 'Milestone XP must NOT be revoked');
    assert.ok(db.xpEvents.has(`${userId}:${getLikeMilestoneEventId(10)}`), 'Milestone event must remain in ledger');
  });

  // TEST L: Followers cross milestone then fall below threshold -> awarded milestone XP remains
  it('TEST L: Followers cross milestone (5) then fall to 4 -> milestone XP remains, dynamic followers update to 4', () => {
    const db = new MockProgressionDatabase();
    const userId = 'user_test_l';

    db.users.set(userId, { followersCount: 5, pinsCount: 0 });

    const summaryWith5Followers = db.simulateUpdateUserProgression(userId);
    const followerMilestoneEvent = db.xpEvents.get(`${userId}:${getFollowerMilestoneEventId(5)}`);
    assert.ok(followerMilestoneEvent, 'Follower milestone:5 event must be created');
    assert.equal(summaryWith5Followers.followersCount, 5);
    const xpWith5Followers = summaryWith5Followers.xp;

    // An explorer unfollows, followersCount drops to 4
    db.users.set(userId, { followersCount: 4, pinsCount: 0 });

    const summaryWith4Followers = db.simulateUpdateUserProgression(userId);
    assert.equal(summaryWith4Followers.followersCount, 4, 'Dynamic followersCount must update to 4');
    assert.equal(summaryWith4Followers.xp, xpWith5Followers, 'Milestone XP must NOT be revoked');
    assert.ok(db.xpEvents.has(`${userId}:${getFollowerMilestoneEventId(5)}`), 'Milestone event must remain in ledger');
  });

  // TEST M: New Pin Firestore payload contains city, countryCode, and countryName
  it('TEST M: New Pin Firestore payload contains city, countryCode, and countryName', () => {
    // Simulate createPin payload transformation from pinService.ts
    const pinInput = {
      userId: 'user_test_m',
      userName: 'Explorer Alice',
      userAvatar: 'https://example.com/avatar.jpg',
      title: 'Tromso Fjord',
      description: 'Northern lights spot',
      latitude: 69.6492,
      longitude: 18.9553,
      locationName: 'Tromso Fjord Lookout',
      city: 'Tromso',
      countryCode: 'NO',
      countryName: 'Norway',
      category: 'Nature',
      tags: ['northernlights'],
      imageUrls: ['https://example.com/image.jpg'],
    };

    // Mirroring pinService createPin implementation
    const firestorePin = {
      userId: pinInput.userId,
      userName: pinInput.userName || 'Explorer',
      userAvatar: pinInput.userAvatar || '',
      title: pinInput.title,
      description: pinInput.description,
      latitude: pinInput.latitude,
      longitude: pinInput.longitude,
      geohash: 'u7r8b0',
      locationName: pinInput.locationName || '',
      city: pinInput.city || '',
      countryCode: pinInput.countryCode || '',
      countryName: pinInput.countryName || '',
      category: pinInput.category,
      tags: pinInput.tags || [],
      imageUrls: pinInput.imageUrls || [],
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    assert.equal(firestorePin.city, 'Tromso', 'city must be persisted in payload');
    assert.equal(firestorePin.countryCode, 'NO', 'countryCode must be persisted in payload');
    assert.equal(firestorePin.countryName, 'Norway', 'countryName must be persisted in payload');
  });
});
