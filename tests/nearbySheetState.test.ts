import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INITIAL_NEARBY_SHEET_STATE,
  applyInitialNearbyQueryResult,
  applyUserSheetSnap,
  computeNearbySheetHeights,
  computeMobileControlsOffset,
  cycleNearbySheetSnap,
  stepNearbySheetSnap,
  resolveSnapTarget,
} from '../src/utils/nearbySheetState';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('Initial Nearby Spots load stays collapsed while loading and opens collapsed for 0 spots', () => {
  const whileLoading = applyInitialNearbyQueryResult(INITIAL_NEARBY_SHEET_STATE, {
    isLoading: true,
    isError: false,
    spotCount: 0,
  });
  assert.equal(whileLoading.snap, 'collapsed');
  assert.equal(whileLoading.hasInitialized, false);

  const settledZero = applyInitialNearbyQueryResult(whileLoading, {
    isLoading: false,
    isError: false,
    spotCount: 0,
  });
  assert.equal(settledZero.snap, 'collapsed');
  assert.equal(settledZero.hasInitialized, true);
  assert.equal(settledZero.hasUserInteracted, false);
});

test('Initial Nearby Spots load opens half-expanded when 1 or more spots are found', () => {
  const settledOne = applyInitialNearbyQueryResult(INITIAL_NEARBY_SHEET_STATE, {
    isLoading: false,
    isError: false,
    spotCount: 1,
  });
  assert.equal(settledOne.snap, 'half');
  assert.equal(settledOne.hasInitialized, true);

  const settledMany = applyInitialNearbyQueryResult(INITIAL_NEARBY_SHEET_STATE, {
    isLoading: false,
    isError: false,
    spotCount: 14,
  });
  assert.equal(settledMany.snap, 'half');
  assert.equal(settledMany.hasInitialized, true);
});

test('Initial Nearby Spots query error keeps sheet collapsed and marks session initialized', () => {
  const settledError = applyInitialNearbyQueryResult(INITIAL_NEARBY_SHEET_STATE, {
    isLoading: false,
    isError: true,
    spotCount: 0,
  });
  assert.equal(settledError.snap, 'collapsed');
  assert.equal(settledError.hasInitialized, true);
});

test('User manual interaction before query completes is never overridden by automatic initial positioning', () => {
  const userExpanded = applyUserSheetSnap(INITIAL_NEARBY_SHEET_STATE, 'expanded');
  assert.equal(userExpanded.snap, 'expanded');
  assert.equal(userExpanded.hasUserInteracted, true);
  assert.equal(userExpanded.hasInitialized, true);

  const afterZeroQuery = applyInitialNearbyQueryResult(userExpanded, {
    isLoading: false,
    isError: false,
    spotCount: 0,
  });
  assert.equal(afterZeroQuery.snap, 'expanded');

  const userCollapsed = applyUserSheetSnap(INITIAL_NEARBY_SHEET_STATE, 'collapsed');
  const afterManyQuery = applyInitialNearbyQueryResult(userCollapsed, {
    isLoading: false,
    isError: false,
    spotCount: 8,
  });
  assert.equal(afterManyQuery.snap, 'collapsed');
});

test('Result count changes after initialization never automatically reposition the sheet', () => {
  const initializedZero = applyInitialNearbyQueryResult(INITIAL_NEARBY_SHEET_STATE, {
    isLoading: false,
    isError: false,
    spotCount: 0,
  });
  assert.equal(initializedZero.snap, 'collapsed');

  const laterFoundSpots = applyInitialNearbyQueryResult(initializedZero, {
    isLoading: false,
    isError: false,
    spotCount: 6,
  });
  assert.equal(laterFoundSpots.snap, 'collapsed');

  const initializedWithSpots = applyInitialNearbyQueryResult(INITIAL_NEARBY_SHEET_STATE, {
    isLoading: false,
    isError: false,
    spotCount: 4,
  });
  assert.equal(initializedWithSpots.snap, 'half');

  const laterZeroSpots = applyInitialNearbyQueryResult(initializedWithSpots, {
    isLoading: false,
    isError: false,
    spotCount: 0,
  });
  assert.equal(laterZeroSpots.snap, 'half');
});

test('Snap height ratios respect compact, half (~45%), and expanded (~85-90%) targets across portrait and landscape heights', () => {
  const iphonePortrait = computeNearbySheetHeights(560);
  assert.ok(iphonePortrait.collapsed >= 72 && iphonePortrait.collapsed <= 90);
  assert.ok(
    iphonePortrait.half >= Math.round(560 * 0.42) && iphonePortrait.half <= Math.round(560 * 0.48),
    `expected half near 45% of 560, got ${iphonePortrait.half}`,
  );
  assert.ok(
    iphonePortrait.expanded >= Math.round(560 * 0.85) && iphonePortrait.expanded <= Math.round(560 * 0.90),
    `expected expanded between 85% and 90% of 560, got ${iphonePortrait.expanded}`,
  );
  assert.ok(iphonePortrait.collapsed < iphonePortrait.half && iphonePortrait.half < iphonePortrait.expanded);

  // Compact landscape viewport
  const landscape = computeNearbySheetHeights(280);
  assert.ok(landscape.collapsed < landscape.half && landscape.half < landscape.expanded);
  assert.ok(landscape.expanded <= 280 - 12);
});

test('Drag snap resolution supports distance-based snapping and velocity flicks', () => {
  const heights = computeNearbySheetHeights(600);

  // Slow drag past midpoint from collapsed -> half
  assert.equal(
    resolveSnapTarget({
      startSnap: 'collapsed',
      currentHeight: heights.half - 10,
      velocityPxPerMs: 0.05,
      snapHeights: heights,
    }),
    'half',
  );

  // Slow drag near expanded -> expanded
  assert.equal(
    resolveSnapTarget({
      startSnap: 'half',
      currentHeight: heights.expanded - 30,
      velocityPxPerMs: 0.05,
      snapHeights: heights,
    }),
    'expanded',
  );

  // Fast upward flick from collapsed -> half
  assert.equal(
    resolveSnapTarget({
      startSnap: 'collapsed',
      currentHeight: heights.collapsed + 35,
      velocityPxPerMs: 0.65,
      snapHeights: heights,
    }),
    'half',
  );

  // Very fast upward flick past half -> expanded
  assert.equal(
    resolveSnapTarget({
      startSnap: 'collapsed',
      currentHeight: heights.half + 20,
      velocityPxPerMs: 1.35,
      snapHeights: heights,
    }),
    'expanded',
  );

  // Fast downward flick from expanded -> half
  assert.equal(
    resolveSnapTarget({
      startSnap: 'expanded',
      currentHeight: heights.expanded - 35,
      velocityPxPerMs: -0.65,
      snapHeights: heights,
    }),
    'half',
  );

  // Very fast downward flick past half -> collapsed
  assert.equal(
    resolveSnapTarget({
      startSnap: 'expanded',
      currentHeight: heights.half - 20,
      velocityPxPerMs: -1.35,
      snapHeights: heights,
    }),
    'collapsed',
  );
});

test('Accessible handle cycle and keyboard ArrowUp/ArrowDown transitions are deterministic', () => {
  assert.equal(cycleNearbySheetSnap('collapsed'), 'half');
  assert.equal(cycleNearbySheetSnap('half'), 'expanded');
  assert.equal(cycleNearbySheetSnap('expanded'), 'collapsed');

  assert.equal(stepNearbySheetSnap('collapsed', 'up'), 'half');
  assert.equal(stepNearbySheetSnap('half', 'up'), 'expanded');
  assert.equal(stepNearbySheetSnap('expanded', 'up'), 'expanded');

  assert.equal(stepNearbySheetSnap('expanded', 'down'), 'half');
  assert.equal(stepNearbySheetSnap('half', 'down'), 'collapsed');
  assert.equal(stepNearbySheetSnap('collapsed', 'down'), 'collapsed');
});

test('Mobile floating map controls offset stays above collapsed/half sheet and never collides with top header', () => {
  const portraitHeights = computeNearbySheetHeights(560);
  assert.equal(
    computeMobileControlsOffset({
      sheetVisible: false,
      snap: 'half',
      snapHeights: portraitHeights,
      containerHeightPx: 560,
    }),
    0,
  );

  const collapsedOffset = computeMobileControlsOffset({
    sheetVisible: true,
    snap: 'collapsed',
    snapHeights: portraitHeights,
    containerHeightPx: 560,
  });
  assert.equal(collapsedOffset, portraitHeights.collapsed + 12);

  const halfOffset = computeMobileControlsOffset({
    sheetVisible: true,
    snap: 'half',
    snapHeights: portraitHeights,
    containerHeightPx: 560,
  });
  assert.equal(halfOffset, portraitHeights.half + 12);

  // On very short landscape viewports, controls remain clamped below top margin
  const shortHeights = computeNearbySheetHeights(260);
  const shortOffset = computeMobileControlsOffset({
    sheetVisible: true,
    snap: 'half',
    snapHeights: shortHeights,
    containerHeightPx: 260,
  });
  assert.ok(shortOffset <= 260 - 116);
});

test('Drop Pin Choose on Map and Selected Location overlays contain no misleading nonfunctional drag handles', () => {
  const overlaySrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Map/MapLocationOverlay.tsx'),
    'utf8',
  );

  assert.ok(overlaySrc.includes('Choose a Location'));
  assert.ok(overlaySrc.includes('Select map center'));
  assert.ok(overlaySrc.includes('Create Pin Here'));
  assert.ok(overlaySrc.includes('ariaLabel="Cancel"'));

  // No decorative pill bar masquerading as a draggable sheet handle
  assert.ok(
    !overlaySrc.includes('h-1 w-9') &&
      !overlaySrc.includes('w-9 h-1') &&
      !overlaySrc.includes('h-1 w-10') &&
      !overlaySrc.includes('w-10 h-1'),
    'MapLocationOverlay must not render a nonfunctional drag handle bar',
  );
});

test('PinFeedList preserves desktop sidebar and provides accessible mobile bottom-sheet controls and scroll safety', () => {
  const feedSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Pin/PinFeedList.tsx'),
    'utf8',
  );

  assert.ok(feedSrc.includes('if (isDesktop)'), 'Desktop branch must stay separated from mobile bottom sheet');
  assert.ok(feedSrc.includes('id="nearby-spots-sheet-handle"'));
  assert.ok(feedSrc.includes('aria-expanded={sheetSnap !== \'collapsed\'}'));
  assert.ok(feedSrc.includes('aria-controls="nearby-spots-sheet-content"'));
  assert.ok(feedSrc.includes("e.key === 'ArrowUp'"));
  assert.ok(feedSrc.includes("e.key === 'ArrowDown'"));
  assert.ok(feedSrc.includes('motion-reduce:transition-none'));
  assert.ok(feedSrc.includes('overscroll-contain'));
  assert.ok(feedSrc.includes('el.scrollTop <= 1'), 'Scroll-to-drag handoff must only activate at top scroll boundary');
});
