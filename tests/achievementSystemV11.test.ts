import assert from 'node:assert/strict';
import test from 'node:test';
import * as frontend from '../src/config/progressionConfig';
import * as backend from '../functions/src/progressionConfig';

const additions = {
  master_curator: ['Exploration', 'platinum', 50, 250],
  local_explorer: ['Geography', 'bronze', 1, 25],
  city_pathfinder: ['Geography', 'gold', 10, 150],
  global_voyager: ['Geography', 'platinum', 8, 250],
  versatile_explorer: ['Discovery', 'silver', 4, 75],
  detailed_guide: ['Discovery', 'silver', 5, 75],
  trusted_voice: ['Community', 'gold', 50, 150],
  heyroq_legend: ['Special', 'platinum', 10, 500],
} as const;
const originalIds = [
  'first_discovery', 'curator_5', 'curator_15', 'curator_30', 'city_scout', 'metro_hopper',
  'border_crosser', 'world_citizen', 'hidden_gems', 'culinary_guide', 'into_the_wild',
  'visual_storyteller', 'spark_inspiration', 'crowd_favorite', 'beloved_guide',
  'wayfarer_fellowship', 'complete_profile', 'pioneer_voyager',
];

test('frontend and backend agree on all 26 IDs, reward metadata and metrics', () => {
  const metrics: backend.MetricContext = {
    totalSpots: 1, citiesCount: 2, countriesCount: 3, likesReceived: 4, followersCount: 5,
    hiddenGemsCount: 6, foodCount: 7, natureCount: 8, photoSpotsCount: 9,
    distinctDiscoveryCount: 10, distinctCategoryCount: 11, qualifyingRichCount: 12,
    trustedLikeCount: 13, profileCompletePoints: 14, level: 15,
  };
  const catalog = backend.ACHIEVEMENTS_CATALOG;
  assert.equal(catalog.length, 26);
  assert.deepEqual(catalog.map(badge => badge.id).sort(), [...originalIds, ...Object.keys(additions)].sort());
  const snapshot = (items: typeof catalog) => items.map(({ metric, ...item }) => ({ ...item, score: metric(metrics) }));
  assert.deepEqual(snapshot(frontend.ACHIEVEMENTS_CATALOG), snapshot(catalog));
  assert.deepEqual(Object.fromEntries(['Exploration', 'Geography', 'Discovery', 'Community', 'Special']
    .map(category => [category, catalog.filter(badge => badge.category === category).length])),
  { Exploration: 5, Geography: 7, Discovery: 6, Community: 5, Special: 3 });

  for (const [id, expected] of Object.entries(additions)) {
    const badge = catalog.find(item => item.id === id)!;
    assert.deepEqual([badge.category, badge.tier, badge.target, badge.xpReward], expected, id);
  }
  assert.deepEqual(catalog.filter(badge => ['city_scout', 'metro_hopper', 'border_crosser', 'world_citizen']
    .includes(badge.id)).map(badge => badge.target), [2, 5, 2, 4]);
  const pioneer = catalog.find(badge => badge.id === 'pioneer_voyager')!;
  assert.deepEqual([pioneer.target, pioneer.tier, pioneer.xpReward], [5, 'gold', 250]);
});

test('all 10 level thresholds and the frozen geography XP baselines stay stable', () => {
  const thresholds = [0, 300, 750, 1500, 3000, 5500, 9000, 14000, 22000, 35000];
  for (const engine of [frontend, backend]) {
    assert.deepEqual(engine.EXPLORER_LEVELS.map(def => def.minXp), thresholds);
    assert.equal(engine.PROGRESSION_CONSTANTS.UNIQUE_CITY_BONUS_XP, 25);
    assert.equal(engine.PROGRESSION_CONSTANTS.UNIQUE_COUNTRY_BONUS_XP, 150);
    thresholds.forEach((threshold, index) => {
      assert.equal(engine.getProgressForXp(threshold).level, index + 1);
      if (index > 0) assert.equal(engine.getProgressForXp(threshold - 1).level, index);
    });
  }
});

const cohorts = [
  { name: 'Casual', monthlyPins: 2, richRate: 0.1, photoRate: 0.2, likesPerPin: 0.35, distinctLikerShare: 0.5, followersPerPin: 0.05, categories: 3 },
  { name: 'Active', monthlyPins: 8, richRate: 0.35, photoRate: 0.5, likesPerPin: 1.2, distinctLikerShare: 0.45, followersPerPin: 0.15, categories: 5 },
  { name: 'Power', monthlyPins: 24, richRate: 0.7, photoRate: 0.8, likesPerPin: 3.5, distinctLikerShare: 0.3, followersPerPin: 0.35, categories: 8 },
];

function simulate(cohort: typeof cohorts[number], v11: boolean) {
  const { PROGRESSION_CONSTANTS: xpRules, LIKE_MILESTONES, FOLLOWER_MILESTONES, getProgressForXp } = backend;
  const catalog = backend.ACHIEVEMENTS_CATALOG.filter(badge =>
    badge.category !== 'Geography' && (v11 || originalIds.includes(badge.id)));
  const matches = new Map<number, number>([[1, 0]]);
  let xp = 0;
  for (let pins = 1; pins <= 800; pins++) {
    const rich = Math.floor(pins * cohort.richRate);
    const likes = Math.floor(pins * cohort.likesPerPin);
    const followers = Math.floor(pins * cohort.followersPerPin);
    xp = xpRules.FIRST_DISCOVERY_BONUS_XP + pins * xpRules.BASE_DISCOVERY_XP + rich * xpRules.RICH_DISCOVERY_BONUS_XP;
    for (const milestone of LIKE_MILESTONES) if (likes >= milestone.count) xp += milestone.xp;
    for (const milestone of FOLLOWER_MILESTONES) if (followers >= milestone.count) xp += milestone.xp;

    const categories = [
      Math.floor((pins + cohort.categories - 1) / cohort.categories),
      Math.floor((pins + cohort.categories - 2) / cohort.categories),
      Math.floor((pins + cohort.categories - 3) / cohort.categories),
    ];
    const data: backend.MetricContext = {
      totalSpots: pins, citiesCount: 0, countriesCount: 0, likesReceived: likes, followersCount: followers,
      hiddenGemsCount: categories[0], foodCount: categories[1], natureCount: categories[2],
      photoSpotsCount: Math.floor(pins * cohort.photoRate), distinctDiscoveryCount: pins,
      distinctCategoryCount: Math.min(cohort.categories, pins), qualifyingRichCount: rich,
      trustedLikeCount: Math.floor(likes * cohort.distinctLikerShare),
      profileCompletePoints: 3, level: 1,
    };
    for (const badge of catalog) {
      data.level = getProgressForXp(xp).level;
      if (badge.metric(data) >= badge.target) xp += badge.xpReward;
    }
    const level = getProgressForXp(xp).level;
    for (let reached = 2; reached <= level; reached++) if (!matches.has(reached)) matches.set(reached, pins);
    if (level === 10) break;
  }
  return { matches, xp };
}

test('deterministic XP simulations quantify the added rewards without geography or threshold changes', t => {
  for (const cohort of cohorts) {
    const baseline = simulate(cohort, false);
    const candidate = simulate(cohort, true);
    assert.equal(candidate.matches.size, 10);
    assert.equal(baseline.matches.size, 10);
    for (const [level, pins] of candidate.matches) assert.ok(pins <= baseline.matches.get(level)!);
    assert.ok(candidate.xp >= 35500, 'Legend XP is added only after reaching 35,000 XP');
    t.diagnostic(cohort.name + ' · levels 2–10 · ' + [...candidate.matches].slice(1).map(([level, pins]) =>
      'L' + level + ' ' + pins + ' pins / ' + (pins / cohort.monthlyPins).toFixed(1) +
      ' mo (v1.0 ' + baseline.matches.get(level) + ' pins)').join(' · '));
  }
});
