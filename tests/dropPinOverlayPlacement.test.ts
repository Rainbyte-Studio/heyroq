import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDesktopCardPlacement } from '../src/components/Map/MapLocationOverlay.tsx';

test('desktop selected location popup anchors cleanly above marker in open viewport', () => {
  const result = computeDesktopCardPlacement(
    { x: 640, y: 460 },
    { width: 1280, height: 800 },
    { width: 316, height: 156 },
  );

  assert.equal(result.placement, 'above');
  assert.equal(result.left, 482);
  assert.equal(result.top, 250);
  assert.equal(result.caretLeft, 158);
});

test('desktop selected location popup flips below marker when marker is near top edge', () => {
  const result = computeDesktopCardPlacement(
    { x: 600, y: 80 },
    { width: 1280, height: 800 },
    { width: 316, height: 156 },
  );

  assert.equal(result.placement, 'below');
  assert.equal(result.top, 100);
  assert.ok(result.caretLeft !== null && result.caretLeft >= 24);
});

test('desktop selected location popup clamps horizontally inside viewport edges', () => {
  const nearLeft = computeDesktopCardPlacement(
    { x: 40, y: 420 },
    { width: 1280, height: 800 },
    { width: 316, height: 156 },
  );
  assert.equal(nearLeft.left, 16);

  const nearRight = computeDesktopCardPlacement(
    { x: 1240, y: 420 },
    { width: 1280, height: 800 },
    { width: 316, height: 156 },
  );
  assert.equal(nearRight.left, 1280 - 316 - 16);
});

test('desktop selected location popup clears bottom-right map controls when anchored low right', () => {
  const result = computeDesktopCardPlacement(
    { x: 1180, y: 760 },
    { width: 1280, height: 800 },
    { width: 316, height: 156 },
  );

  assert.ok(result.left + 316 <= 1280 - 212, 'popup stays clear of bottom-right controls');
  assert.ok(result.top + 156 <= 800 - 16, 'popup stays inside bottom margin');
});

test('desktop selected location popup falls back cleanly when map projection is unavailable', () => {
  const result = computeDesktopCardPlacement(
    null,
    { width: 1280, height: 800 },
    { width: 316, height: 156 },
  );

  assert.equal(result.placement, 'floating');
  assert.equal(result.caretLeft, null);
  assert.equal(result.left, Math.round((1280 - 316) / 2));
  assert.ok(result.top >= 16 && result.top < 300, 'fallback sits cleanly in upper-center map area');
});
