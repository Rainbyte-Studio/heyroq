import assert from 'node:assert/strict';
import test from 'node:test';
import { getAchievementPresentation, getVerifiedGeographicCounts } from '../src/config/achievementAvailability';
import { ACHIEVEMENTS_CATALOG } from '../src/config/progressionConfig';

const lockedCity = { id: 'city_pathfinder', category: 'Geography' as const, isUnlocked: false, progress: 10, target: 10 };
const availableCityIds = new Set([lockedCity.id]);

test('a build without the feature flag hides all seven geographic badges and retains the other 19', () => {
  const catalog = ACHIEVEMENTS_CATALOG.map((badge) => ({
    ...badge,
    isUnlocked: false,
    progress: 1,
    verifiedGeographicProgress: 1,
  }));
  const geography = catalog.filter((badge) => badge.category === 'Geography');
  const remaining = catalog.filter((badge) => badge.category !== 'Geography');
  assert.equal(geography.length, 7);
  assert.equal(remaining.length, 19);
  for (const badge of geography) {
    assert.deepEqual(getAchievementPresentation(badge), { state: 'coming_soon', progress: null });
  }
  for (const badge of remaining) {
    assert.deepEqual(getAchievementPresentation(badge), { state: 'available', progress: 1 });
  }
});

test('unknown Geography IDs and a missing release stay paused even with nonzero stored counts', () => {
  for (const id of ['future_city_badge', 'constructor', '__proto__', 'first_discovery']) {
    const badge = { ...lockedCity, id, verifiedGeographicProgress: 7 };
    assert.deepEqual(getAchievementPresentation(badge, { availableIds: availableCityIds }), { state: 'coming_soon', progress: null });
    assert.deepEqual(getAchievementPresentation(badge), { state: 'coming_soon', progress: null });
  }
  assert.deepEqual(getAchievementPresentation(lockedCity, { availableIds: new Set() }), { state: 'coming_soon', progress: null });
});

test('an explicitly available geographic badge shows only verified progress', () => {
  for (const invalid of [undefined, -1, 1.5, NaN, Infinity, '10']) {
    const badge = { ...lockedCity, verifiedGeographicProgress: invalid as number | undefined };
    assert.deepEqual(getAchievementPresentation(badge, { availableIds: availableCityIds }), { state: 'available', progress: null });
  }
  for (const [verified, progress] of [[0, 0], [3, 3], [12, 10]]) {
    const badge = { ...lockedCity, verifiedGeographicProgress: verified };
    assert.deepEqual(getAchievementPresentation(badge, { availableIds: availableCityIds }), { state: 'available', progress });
  }
});

test('legacy completed awards take priority over release settings and retain stored data', () => {
  const legacy = Object.freeze({
    ...lockedCity,
    isUnlocked: true,
    tier: 'gold',
    xpReward: 150,
    unlockedAt: '2025-01-06T00:00:00Z',
  });
  const before = { ...legacy };
  assert.deepEqual(getAchievementPresentation(legacy), { state: 'completed', progress: 10 });
  assert.deepEqual(getAchievementPresentation(legacy, { availableIds: availableCityIds }), { state: 'completed', progress: 10 });
  assert.deepEqual(legacy, before);
});

test('all seven active badges use the matching verified ledger dimension', () => {
  const ledgerIds = [
    'geo_v1:city:GR:264371', 'geo_v1:city:GR:734077', 'geo_v1:city:IT:3169070',
    'geo_v1:country:GR', 'geo_v1:country:IT', 'city_first:legacy', 'country_first:legacy',
    'achievement:local_explorer',
  ];
  const metadata = { fromCache: false, hasPendingWrites: false };
  const counts = getVerifiedGeographicCounts(ledgerIds, metadata);
  assert.deepEqual(counts, { cities: 3, countries: 2 });
  const expectedProgress = {
    local_explorer: 1, city_scout: 2, metro_hopper: 3, city_pathfinder: 3,
    border_crosser: 2, world_citizen: 2, global_voyager: 2,
  };
  const availableIds = new Set(Object.keys(expectedProgress));
  const badges = ACHIEVEMENTS_CATALOG.filter(badge => badge.category === 'Geography');
  assert.equal(badges.length, 7);
  for (const badge of badges) {
    const locked = { ...badge, isUnlocked: false, progress: badge.target };
    assert.deepEqual(getAchievementPresentation(locked, { availableIds, verifiedGeography: counts }),
      { state: 'available', progress: expectedProgress[badge.id as keyof typeof expectedProgress] });
    assert.deepEqual(getAchievementPresentation(locked, {
      availableIds,
      verifiedGeography: getVerifiedGeographicCounts([], metadata),
    }), { state: 'available', progress: 0 });
    assert.deepEqual(getAchievementPresentation(locked, { availableIds, verifiedGeography: null }),
      { state: 'available', progress: null });
  }
});

test('cached or locally pending ledger snapshots do not provide verified counts', () => {
  const ids = ['geo_v1:city:GR:264371'];
  assert.equal(getVerifiedGeographicCounts(ids, { fromCache: true, hasPendingWrites: false }), null);
  assert.equal(getVerifiedGeographicCounts(ids, { fromCache: false, hasPendingWrites: true }), null);
});
