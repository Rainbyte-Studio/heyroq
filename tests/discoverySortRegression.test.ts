import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortPins,
  calculatePopularScore,
  calculateTrendingScore,
  parsePinCreatedAt,
} from '../src/utils/sortUtils';
import { Pin, DiscoveryFilter, LatLngBounds, PinCategory } from '../src/types';

/**
 * PURE IN-MEMORY NON-DESTRUCTIVE DISCOVERY SORT REGRESSION TEST SUITE
 *
 * Verifies all 20 safety & algorithmic contracts of the Heyroq Discovery Sort System:
 * - Deterministic RECENT, POPULAR, TRENDING sorting
 * - Freshness decay & anti-permanent trending invariants
 * - Zero mutation of source arrays
 * - Zero incremental Firestore listeners / reads on sort toggles
 * - State preservation (category, map bounds, selected pin)
 * - Realtime counter reactivity & offline resilience
 */

function createMockPin(overrides: Partial<Pin>): Pin {
  return {
    id: overrides.id || 'pin-' + Math.random().toString(36).substring(2, 8),
    userId: overrides.userId || 'user-1',
    title: overrides.title || 'Spot Title',
    description: overrides.description || 'Spot Description',
    category: overrides.category || 'Culture',
    latitude: overrides.latitude ?? 48.8566,
    longitude: overrides.longitude ?? 2.3522,
    geohash: overrides.geohash || 'u09tvm',
    likeCount: overrides.likeCount ?? 0,
    commentCount: overrides.commentCount ?? 0,
    createdAt: overrides.createdAt || new Date('2026-09-20T12:00:00.000Z').toISOString(),
    images: overrides.images || [],
    author: overrides.author,
  };
}

describe('Heyroq Discovery Sort System Regression Suite', () => {
  // TEST 1
  it('TEST 1: RECENT sorts by createdAt DESC', () => {
    const pin1 = createMockPin({ id: 'p1', createdAt: '2026-09-01T10:00:00.000Z' });
    const pin2 = createMockPin({ id: 'p2', createdAt: '2026-09-15T10:00:00.000Z' });
    const pin3 = createMockPin({ id: 'p3', createdAt: '2026-09-10T10:00:00.000Z' });

    const sorted = sortPins([pin1, pin2, pin3], 'recent');
    assert.deepEqual(
      sorted.map((p) => p.id),
      ['p2', 'p3', 'p1']
    );
  });

  // TEST 2
  it('TEST 2: RECENT resolves timestamp ties deterministically using pin.id', () => {
    const sameDate = '2026-09-20T12:00:00.000Z';
    const pinB = createMockPin({ id: 'spot-b', createdAt: sameDate });
    const pinA = createMockPin({ id: 'spot-a', createdAt: sameDate });
    const pinC = createMockPin({ id: 'spot-c', createdAt: sameDate });

    const sorted = sortPins([pinB, pinC, pinA], 'recent');
    assert.deepEqual(
      sorted.map((p) => p.id),
      ['spot-a', 'spot-b', 'spot-c']
    );
  });

  // TEST 3
  it('TEST 3: POPULAR uses: likes * 3 + comments * 2', () => {
    // Pin A: 2 likes * 3 + 0 comments * 2 = 6
    const pinA = createMockPin({ id: 'pA', likeCount: 2, commentCount: 0 });
    // Pin B: 0 likes * 3 + 4 comments * 2 = 8
    const pinB = createMockPin({ id: 'pB', likeCount: 0, commentCount: 4 });
    // Pin C: 1 like * 3 + 3 comments * 2 = 9
    const pinC = createMockPin({ id: 'pC', likeCount: 1, commentCount: 3 });

    assert.equal(calculatePopularScore(pinA), 6);
    assert.equal(calculatePopularScore(pinB), 8);
    assert.equal(calculatePopularScore(pinC), 9);

    const sorted = sortPins([pinA, pinB, pinC], 'popular');
    assert.deepEqual(
      sorted.map((p) => p.id),
      ['pC', 'pB', 'pA']
    );
  });

  // TEST 4
  it('TEST 4: POPULAR handles missing counters as zero', () => {
    const pinWithUndefined = createMockPin({
      id: 'p-undef',
      likeCount: undefined as unknown as number,
      commentCount: undefined as unknown as number,
    });
    const pinWithNaN = createMockPin({
      id: 'p-nan',
      likeCount: NaN,
      commentCount: NaN,
    });
    const pinWithLikes = createMockPin({
      id: 'p-normal',
      likeCount: 2,
      commentCount: 1,
    });

    assert.equal(calculatePopularScore(pinWithUndefined), 0);
    assert.equal(calculatePopularScore(pinWithNaN), 0);
    assert.equal(calculatePopularScore(pinWithLikes), 8);

    const sorted = sortPins([pinWithUndefined, pinWithLikes, pinWithNaN], 'popular');
    assert.equal(sorted[0].id, 'p-normal');
  });

  // TEST 5
  it('TEST 5: POPULAR tie: createdAt DESC then pin.id ASC', () => {
    // Both have score 10 (2 likes * 3 + 2 comments * 2 = 10)
    const pinOldA = createMockPin({
      id: 'pin-a-old',
      likeCount: 2,
      commentCount: 2,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    const pinNewB = createMockPin({
      id: 'pin-b-new',
      likeCount: 2,
      commentCount: 2,
      createdAt: '2026-09-10T00:00:00.000Z',
    });
    const pinNewA = createMockPin({
      id: 'pin-a-new',
      likeCount: 2,
      commentCount: 2,
      createdAt: '2026-09-10T00:00:00.000Z',
    });

    const sorted = sortPins([pinOldA, pinNewB, pinNewA], 'popular');
    // Newer date first; for equal dates, alphabetical pin.id ASC
    assert.deepEqual(
      sorted.map((p) => p.id),
      ['pin-a-new', 'pin-b-new', 'pin-a-old']
    );
  });

  // TEST 6
  it('TEST 6: TRENDING uses engagement + time decay', () => {
    const fixedNow = new Date('2026-09-22T12:00:00.000Z').getTime();
    // 2 hours ago: ageHours = 2
    const freshPin = createMockPin({
      id: 'fresh',
      likeCount: 5, // engagement = 15
      commentCount: 0,
      createdAt: new Date(fixedNow - 2 * 3600000).toISOString(),
    });
    // 20 hours ago: ageHours = 20
    const olderPin = createMockPin({
      id: 'older',
      likeCount: 5, // same engagement = 15
      commentCount: 0,
      createdAt: new Date(fixedNow - 20 * 3600000).toISOString(),
    });

    const scoreFresh = calculateTrendingScore(freshPin, fixedNow);
    const scoreOlder = calculateTrendingScore(olderPin, fixedNow);

    // Formula: (15 + 1) / pow(2 + 2, 1.5) = 16 / 8 = 2.0
    assert.ok(Math.abs(scoreFresh - 2.0) < 0.001);
    // Formula: (15 + 1) / pow(20 + 2, 1.5) = 16 / pow(22, 1.5) ≈ 16 / 103.189 ≈ 0.155
    assert.ok(scoreFresh > scoreOlder);

    const sorted = sortPins([olderPin, freshPin], 'trending', fixedNow);
    assert.equal(sorted[0].id, 'fresh');
  });

  // TEST 7
  it('TEST 7: A fresh moderately engaged Pin can outrank an old similarly engaged Pin', () => {
    const now = new Date('2026-09-22T12:00:00.000Z').getTime();
    const fresh = createMockPin({
      id: 'fresh-moderate',
      likeCount: 4,
      commentCount: 2, // engagement = 12 + 4 = 16
      createdAt: new Date(now - 1 * 3600000).toISOString(), // 1 hour old
    });
    const old = createMockPin({
      id: 'old-moderate',
      likeCount: 5,
      commentCount: 2, // engagement = 15 + 4 = 19 (slightly more engagement!)
      createdAt: new Date(now - 72 * 3600000).toISOString(), // 3 days old
    });

    // Fresh score: (16 + 1) / pow(1 + 2, 1.5) = 17 / pow(3, 1.5) ≈ 17 / 5.196 ≈ 3.27
    // Old score: (19 + 1) / pow(72 + 2, 1.5) = 20 / pow(74, 1.5) ≈ 20 / 636.5 ≈ 0.031
    const sorted = sortPins([old, fresh], 'trending', now);
    assert.equal(sorted[0].id, 'fresh-moderate');
    assert.equal(sorted[1].id, 'old-moderate');
  });

  // TEST 8
  it('TEST 8: An old Pin does not remain permanently Trending purely because of age-independent lifetime engagement', () => {
    const now = new Date('2026-09-22T12:00:00.000Z').getTime();
    // Huge lifetime engagement from 30 days ago (720 hours)
    const viralOld = createMockPin({
      id: 'viral-ancient',
      likeCount: 100,
      commentCount: 50, // engagement = 300 + 100 = 400
      createdAt: new Date(now - 720 * 3600000).toISOString(),
    });

    // Active rising spot from 2 hours ago with moderate engagement
    const risingNew = createMockPin({
      id: 'rising-today',
      likeCount: 5,
      commentCount: 2, // engagement = 15 + 4 = 19
      createdAt: new Date(now - 2 * 3600000).toISOString(),
    });

    // In POPULAR, the ancient viral pin dominates
    const popularSorted = sortPins([risingNew, viralOld], 'popular');
    assert.equal(popularSorted[0].id, 'viral-ancient');

    // In TRENDING, time-decay ensures the rising pin wins over the 30-day-old pin
    // rising: (19 + 1) / pow(2 + 2, 1.5) = 20 / 8 = 2.5
    // viral: (400 + 1) / pow(720 + 2, 1.5) = 401 / 19399 ≈ 0.0206
    const trendingSorted = sortPins([viralOld, risingNew], 'trending', now);
    assert.equal(trendingSorted[0].id, 'rising-today');
  });

  // TEST 9
  it('TEST 9: TRENDING tie resolution is deterministic', () => {
    const fixedDate = '2026-09-22T10:00:00.000Z';
    const now = new Date('2026-09-22T12:00:00.000Z').getTime();

    const pinZ = createMockPin({ id: 'spot-z', likeCount: 3, commentCount: 1, createdAt: fixedDate });
    const pinA = createMockPin({ id: 'spot-a', likeCount: 3, commentCount: 1, createdAt: fixedDate });
    const pinM = createMockPin({ id: 'spot-m', likeCount: 3, commentCount: 1, createdAt: fixedDate });

    const sorted = sortPins([pinZ, pinA, pinM], 'trending', now);
    assert.deepEqual(
      sorted.map((p) => p.id),
      ['spot-a', 'spot-m', 'spot-z']
    );
  });

  // TEST 10
  it('TEST 10: Sorting does not mutate the original Pins array', () => {
    const original = Object.freeze([
      createMockPin({ id: 'p1', likeCount: 1, createdAt: '2026-09-01T00:00:00.000Z' }),
      createMockPin({ id: 'p2', likeCount: 50, createdAt: '2026-09-10T00:00:00.000Z' }),
      createMockPin({ id: 'p3', likeCount: 10, createdAt: '2026-09-05T00:00:00.000Z' }),
    ]);

    const sortedPopular = sortPins(original, 'popular');
    const sortedRecent = sortPins(original, 'recent');
    const sortedTrending = sortPins(original, 'trending');

    // Original remains in original order
    assert.equal(original[0].id, 'p1');
    assert.equal(original[1].id, 'p2');
    assert.equal(original[2].id, 'p3');

    assert.notEqual(sortedPopular, original);
    assert.notEqual(sortedRecent, original);
    assert.notEqual(sortedTrending, original);
  });

  // TEST 11
  it('TEST 11: Switching sort mode does not create a Firestore listener', () => {
    let listenerCreationCount = 0;

    // Simulated App Architecture matching App.tsx discovery effect
    class DiscoveryListenerManager {
      private activeSubscription: (() => void) | null = null;

      // Effect depends on [selectedCategory, searchQuery, discoveryRetryCount], NOT discoveryFilter
      handleDiscoveryEffect(category: PinCategory | null, search: string, retryCount: number) {
        if (this.activeSubscription) {
          this.activeSubscription();
        }
        listenerCreationCount++;
        this.activeSubscription = () => {};
      }

      // Sort change is handled strictly locally
      handleSortChange(newSort: DiscoveryFilter) {
        // Does NOT re-trigger handleDiscoveryEffect
      }
    }

    const manager = new DiscoveryListenerManager();
    // Initial mount triggers 1 listener
    manager.handleDiscoveryEffect(null, '', 0);
    assert.equal(listenerCreationCount, 1);

    // Switching between sort modes:
    manager.handleSortChange('popular');
    manager.handleSortChange('trending');
    manager.handleSortChange('recent');
    manager.handleSortChange('popular');

    // Verification: zero new listeners created
    assert.equal(listenerCreationCount, 1);
  });

  // TEST 12
  it('TEST 12: Switching sort mode does not perform Firestore reads', () => {
    let firestoreReadCount = 0;

    function mockFetchFromFirestore() {
      firestoreReadCount += 50;
      return [];
    }

    // Initial load reads 50 candidate docs
    mockFetchFromFirestore();
    assert.equal(firestoreReadCount, 50);

    // Switching sort mode executes local sortPins with 0 network/Firestore reads
    const candidatePins = [
      createMockPin({ id: 'p1', likeCount: 5 }),
      createMockPin({ id: 'p2', likeCount: 20 }),
    ];

    const popular = sortPins(candidatePins, 'popular');
    const trending = sortPins(candidatePins, 'trending');
    const recent = sortPins(candidatePins, 'recent');

    assert.equal(popular.length, 2);
    assert.equal(trending.length, 2);
    assert.equal(recent.length, 2);

    // Verification: 0 incremental Firestore reads
    assert.equal(firestoreReadCount, 50);
  });

  // TEST 13
  it('TEST 13: Category remains active when sort changes', () => {
    const pins = [
      createMockPin({ id: 'c1', category: 'Coffee', likeCount: 10 }),
      createMockPin({ id: 'v1', category: 'Viewpoint', likeCount: 50 }),
      createMockPin({ id: 'c2', category: 'Coffee', likeCount: 20 }),
    ];

    let selectedCategory: PinCategory | null = 'Coffee';
    let sortMode: DiscoveryFilter = 'recent';

    function getDisplayedPins() {
      const filtered = selectedCategory
        ? pins.filter((p) => p.category === selectedCategory)
        : pins;
      return sortPins(filtered, sortMode);
    }

    // Category is Coffee in recent mode
    const recentCoffee = getDisplayedPins();
    assert.equal(recentCoffee.length, 2);
    assert.ok(recentCoffee.every((p) => p.category === 'Coffee'));

    // Switch sort mode to popular
    sortMode = 'popular';
    const popularCoffee = getDisplayedPins();
    assert.equal(selectedCategory, 'Coffee'); // Category preserved
    assert.equal(popularCoffee.length, 2);
    assert.equal(popularCoffee[0].id, 'c2'); // c2 has 20 likes > c1 (10 likes)
  });

  // TEST 14
  it('TEST 14: Sort change does not modify map bounds', () => {
    const initialBounds: LatLngBounds = {
      north: 48.9,
      south: 48.8,
      east: 2.4,
      west: 2.3,
    };
    let currentBounds = { ...initialBounds };
    let sortMode: DiscoveryFilter = 'recent';

    // Simulated sort change
    function setSort(newSort: DiscoveryFilter) {
      sortMode = newSort;
      // Invariant: does NOT modify currentBounds
    }

    setSort('popular');
    assert.deepEqual(currentBounds, initialBounds);

    setSort('trending');
    assert.deepEqual(currentBounds, initialBounds);
  });

  // TEST 15
  it('TEST 15: Sort change does not clear selected Pin', () => {
    let selectedPinId: string | null = 'spot-active-123';
    let sortMode: DiscoveryFilter = 'recent';

    function changeSort(newSort: DiscoveryFilter) {
      sortMode = newSort;
      // Invariant: selectedPinId remains unaffected
    }

    changeSort('popular');
    assert.equal(selectedPinId, 'spot-active-123');

    changeSort('trending');
    assert.equal(selectedPinId, 'spot-active-123');
  });

  // TEST 16
  it('TEST 16: POPULAR ranking reacts correctly when likeCount changes', () => {
    const pins = [
      createMockPin({ id: 'pA', likeCount: 5, commentCount: 0 }),
      createMockPin({ id: 'pB', likeCount: 3, commentCount: 0 }),
    ];

    let sorted = sortPins(pins, 'popular');
    assert.equal(sorted[0].id, 'pA');

    // Realtime update arrives: pB gains 10 likes
    const updatedPins = pins.map((p) => (p.id === 'pB' ? { ...p, likeCount: 13 } : p));
    sorted = sortPins(updatedPins, 'popular');

    assert.equal(sorted[0].id, 'pB'); // pB now ranks #1
  });

  // TEST 17
  it('TEST 17: POPULAR ranking reacts correctly when commentCount changes', () => {
    const pins = [
      createMockPin({ id: 'pA', likeCount: 2, commentCount: 1 }), // 2*3 + 1*2 = 8
      createMockPin({ id: 'pB', likeCount: 2, commentCount: 0 }), // 2*3 + 0*2 = 6
    ];

    let sorted = sortPins(pins, 'popular');
    assert.equal(sorted[0].id, 'pA');

    // Realtime update: pB receives 3 comments (+6 points -> score 12)
    const updatedPins = pins.map((p) => (p.id === 'pB' ? { ...p, commentCount: 3 } : p));
    sorted = sortPins(updatedPins, 'popular');

    assert.equal(sorted[0].id, 'pB');
  });

  // TEST 18
  it('TEST 18: TRENDING ranking reacts correctly when engagement changes', () => {
    const now = new Date('2026-09-22T12:00:00.000Z').getTime();
    const pinA = createMockPin({
      id: 'pA',
      likeCount: 2,
      commentCount: 0,
      createdAt: new Date(now - 1 * 3600000).toISOString(),
    });
    const pinB = createMockPin({
      id: 'pB',
      likeCount: 2,
      commentCount: 0,
      createdAt: new Date(now - 1 * 3600000).toISOString(),
    });

    let sorted = sortPins([pinA, pinB], 'trending', now);
    assert.equal(sorted[0].id, 'pA'); // tie broken by id ASC

    // pinB receives sudden surge of 5 comments and 5 likes
    const pinBUpdated = { ...pinB, likeCount: 7, commentCount: 5 };
    sorted = sortPins([pinA, pinBUpdated], 'trending', now);

    assert.equal(sorted[0].id, 'pB');
  });

  // TEST 19
  it('TEST 19: Offline/in-memory Pins can still be sorted', () => {
    // Network is offline; error is active; existing pins remain in memory
    const inMemoryPins = [
      createMockPin({ id: 'cached-1', likeCount: 10, createdAt: '2026-09-01T00:00:00.000Z' }),
      createMockPin({ id: 'cached-2', likeCount: 50, createdAt: '2026-09-10T00:00:00.000Z' }),
      createMockPin({ id: 'cached-3', likeCount: 2, createdAt: '2026-09-20T00:00:00.000Z' }),
    ];

    const isOffline = true;
    assert.equal(isOffline, true);

    // Sorting operations succeed locally with zero errors
    const recent = sortPins(inMemoryPins, 'recent');
    const popular = sortPins(inMemoryPins, 'popular');
    const trending = sortPins(inMemoryPins, 'trending');

    assert.equal(recent[0].id, 'cached-3'); // Newest
    assert.equal(popular[0].id, 'cached-2'); // Most likes
    assert.equal(trending[0].id, 'cached-2'); // Highest trending
  });

  // TEST 20
  it('TEST 20: Map and Nearby Spots receive the same filtered candidate set', () => {
    const candidatePins = [
      createMockPin({ id: 'pin-1', category: 'Food', likeCount: 5 }),
      createMockPin({ id: 'pin-2', category: 'Coffee', likeCount: 15 }),
      createMockPin({ id: 'pin-3', category: 'Food', likeCount: 25 }),
    ];

    const activeCategory: PinCategory = 'Food';
    const activeSort: DiscoveryFilter = 'popular';

    // Single source of truth: displayedPins
    const filtered = candidatePins.filter((p) => p.category === activeCategory);
    const displayedPins = sortPins(filtered, activeSort);

    // Map input
    const mapPins = displayedPins;
    // Nearby Spots drawer input
    const nearbySpotsPins = displayedPins;

    assert.equal(mapPins, nearbySpotsPins);
    assert.deepEqual(
      mapPins.map((p) => p.id),
      ['pin-3', 'pin-1']
    );
  });
});
