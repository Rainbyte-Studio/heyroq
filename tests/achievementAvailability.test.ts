import assert from 'node:assert/strict';
import test from 'node:test';
import { getAchievementPresentation } from '../src/config/achievementAvailability';
import { ACHIEVEMENTS_CATALOG } from '../src/config/progressionConfig';

const lockedCity = { id: 'city_pathfinder', category: 'Geography' as const, isUnlocked: false, progress: 10, target: 10 };
const availableCityIds = new Set([lockedCity.id]);

test('the current release hides progress for all seven geographic badges and retains it for the other 19', () => {
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
    assert.deepEqual(getAchievementPresentation(badge, availableCityIds), { state: 'coming_soon', progress: null });
    assert.deepEqual(getAchievementPresentation(badge), { state: 'coming_soon', progress: null });
  }
  assert.deepEqual(getAchievementPresentation(lockedCity, new Set()), { state: 'coming_soon', progress: null });
});

test('an explicitly available geographic badge shows only verified progress', () => {
  for (const invalid of [undefined, -1, 1.5, NaN, Infinity, '10']) {
    const badge = { ...lockedCity, verifiedGeographicProgress: invalid as number | undefined };
    assert.deepEqual(getAchievementPresentation(badge, availableCityIds), { state: 'available', progress: null });
  }
  for (const [verified, progress] of [[0, 0], [3, 3], [12, 10]]) {
    const badge = { ...lockedCity, verifiedGeographicProgress: verified };
    assert.deepEqual(getAchievementPresentation(badge, availableCityIds), { state: 'available', progress });
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
  assert.deepEqual(getAchievementPresentation(legacy, availableCityIds), { state: 'completed', progress: 10 });
  assert.deepEqual(legacy, before);
});
