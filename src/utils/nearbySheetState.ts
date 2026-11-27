export type NearbySheetSnap = 'collapsed' | 'half' | 'expanded';

export interface NearbySheetState {
  snap: NearbySheetSnap;
  hasInitialized: boolean;
  hasUserInteracted: boolean;
}

export interface NearbySheetHeights {
  collapsed: number;
  half: number;
  expanded: number;
}

export const INITIAL_NEARBY_SHEET_STATE: NearbySheetState = {
  snap: 'collapsed',
  hasInitialized: false,
  hasUserInteracted: false,
};

export const NEARBY_SHEET_COLLAPSED_MIN_HEIGHT = 86;
export const NEARBY_SHEET_HALF_RATIO = 0.45;
export const NEARBY_SHEET_EXPANDED_RATIO = 0.88;

const FAST_FLICK_VELOCITY = 0.45; // px/ms
const VERY_FAST_FLICK_VELOCITY = 1.1; // px/ms

/**
 * Computes responsive pixel heights for the three mobile bottom-sheet snap
 * positions from the measured map workspace container height (which adapts to
 * `100dvh`, Safari dynamic toolbars, orientation, and safe areas).
 */
export function computeNearbySheetHeights(containerHeight: number): NearbySheetHeights {
  const safeContainer = Number.isFinite(containerHeight) && containerHeight > 0 ? containerHeight : 560;

  const collapsed = Math.min(
    NEARBY_SHEET_COLLAPSED_MIN_HEIGHT,
    Math.max(72, Math.round(safeContainer * 0.34)),
  );

  const expanded = Math.max(
    collapsed + 80,
    Math.min(Math.round(safeContainer - 12), Math.round(safeContainer * NEARBY_SHEET_EXPANDED_RATIO)),
  );

  const rawHalf = Math.round(safeContainer * NEARBY_SHEET_HALF_RATIO);
  const minHalf = Math.min(expanded - 40, collapsed + 64);
  const maxHalf = Math.max(minHalf, expanded - 48);
  const half = Math.min(Math.max(rawHalf, minHalf), maxHalf);

  return { collapsed, half, expanded };
}

/**
 * Applies the one-time automatic initial sheet position once the first Nearby
 * Spots query finishes:
 * - Still loading -> remain Collapsed (uninitialized).
 * - Query error -> remain Collapsed (initialized).
 * - 0 spots -> remain Collapsed (initialized).
 * - 1+ spots -> Half-expanded (initialized).
 *
 * Never overrides a user's manual interaction and never auto-moves after
 * initialization completes.
 */
export function applyInitialNearbyQueryResult(
  state: NearbySheetState,
  result: {
    isLoading: boolean;
    isError: boolean;
    spotCount: number;
  },
): NearbySheetState {
  if (state.hasUserInteracted || state.hasInitialized) {
    return state;
  }

  if (result.isLoading) {
    return state;
  }

  const nextSnap: NearbySheetSnap =
    result.isError || result.spotCount <= 0 ? 'collapsed' : 'half';

  return {
    snap: nextSnap,
    hasInitialized: true,
    hasUserInteracted: false,
  };
}

/**
 * Records an explicit user snap selection (via drag, tap handle, or keyboard)
 * and permanently locks out automatic repositioning for the session.
 */
export function applyUserSheetSnap(
  _state: NearbySheetState,
  nextSnap: NearbySheetSnap,
): NearbySheetState {
  return {
    snap: nextSnap,
    hasInitialized: true,
    hasUserInteracted: true,
  };
}

/**
 * Cycles the bottom sheet position on accessible handle tap/click:
 * collapsed -> half -> expanded -> collapsed.
 */
export function cycleNearbySheetSnap(current: NearbySheetSnap): NearbySheetSnap {
  if (current === 'collapsed') return 'half';
  if (current === 'half') return 'expanded';
  return 'collapsed';
}

/**
 * Steps the sheet position up or down by one snap level (for ArrowUp/ArrowDown).
 */
export function stepNearbySheetSnap(
  current: NearbySheetSnap,
  direction: 'up' | 'down',
): NearbySheetSnap {
  if (direction === 'up') {
    if (current === 'collapsed') return 'half';
    return 'expanded';
  }
  if (current === 'expanded') return 'half';
  return 'collapsed';
}

/**
 * Resolves the target snap position after a drag gesture using both distance
 * (current height) and release velocity (`velocityPxPerMs` > 0 when dragging
 * upward to expand, < 0 when dragging downward to collapse).
 */
export function resolveSnapTarget(params: {
  startSnap: NearbySheetSnap;
  currentHeight: number;
  velocityPxPerMs: number;
  snapHeights: NearbySheetHeights;
}): NearbySheetSnap {
  const { startSnap, currentHeight, velocityPxPerMs, snapHeights } = params;

  if (velocityPxPerMs >= FAST_FLICK_VELOCITY) {
    if (
      startSnap === 'collapsed' &&
      velocityPxPerMs >= VERY_FAST_FLICK_VELOCITY &&
      currentHeight >= snapHeights.half
    ) {
      return 'expanded';
    }
    return stepNearbySheetSnap(startSnap, 'up');
  }

  if (velocityPxPerMs <= -FAST_FLICK_VELOCITY) {
    if (
      startSnap === 'expanded' &&
      velocityPxPerMs <= -VERY_FAST_FLICK_VELOCITY &&
      currentHeight <= snapHeights.half
    ) {
      return 'collapsed';
    }
    return stepNearbySheetSnap(startSnap, 'down');
  }

  const candidates: Array<{ snap: NearbySheetSnap; dist: number }> = [
    { snap: 'collapsed', dist: Math.abs(currentHeight - snapHeights.collapsed) },
    { snap: 'half', dist: Math.abs(currentHeight - snapHeights.half) },
    { snap: 'expanded', dist: Math.abs(currentHeight - snapHeights.expanded) },
  ];

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0].snap;
}

/**
 * Computes the safe bottom offset for floating mobile map controls so they
 * sit cleanly above the Collapsed or Half-expanded Nearby Spots sheet without
 * colliding with the top navigation header on compact or landscape viewports.
 * When Expanded, controls stay resting at the half-sheet level underneath the
 * higher-z-index sheet so the sheet glides smoothly over them.
 */
export function computeMobileControlsOffset(params: {
  sheetVisible: boolean;
  snap: NearbySheetSnap;
  snapHeights: NearbySheetHeights;
  containerHeightPx: number;
}): number {
  const { sheetVisible, snap, snapHeights, containerHeightPx } = params;
  if (!sheetVisible) return 0;

  const anchorHeight =
    snap === 'collapsed' ? snapHeights.collapsed : snapHeights.half;
  const desiredOffset = anchorHeight + 12;

  // Reserve room for two control rows (~96px) plus top breathing margin (~16px)
  const maxSafeOffset =
    containerHeightPx > 0 ? Math.max(16, Math.round(containerHeightPx - 116)) : desiredOffset;

  return Math.min(desiredOffset, maxSafeOffset);
}
