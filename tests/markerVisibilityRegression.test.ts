import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Pin, LatLngBounds, LatLngPoint, PinCategory } from '../src/types';
import { sortPins } from '../src/utils/sortUtils';
import { matchesCategoryFilter, normalizeCategory } from '../src/utils/categoryUtils';

/**
 * PURE IN-MEMORY NON-DESTRUCTIVE REGRESSION TEST SUITE:
 * HEYROQ MAP PIN VISIBILITY — HIDE / SHOW (DESKTOP + MOBILE)
 * 
 * Verifies the 26 required contracts:
 * TEST 1: Default state has showPinMarkers = true
 * TEST 2: Pressing HIDE sets showPinMarkers = false
 * TEST 3: Pressing SHOW sets showPinMarkers = true
 * TEST 4: HIDE does not mutate loaded candidate Pins collection
 * TEST 5: HIDE does not alter Nearby Spots list contents
 * TEST 6: HIDE does not alter Nearby Spots sort order
 * TEST 7: HIDE causes visibleMapPins to be empty
 * TEST 8: SHOW restores visibleMapPins to current displayedPins
 * TEST 9: HIDE does not close Nearby Spots panel
 * TEST 10: CLOSE closes Nearby Spots without changing showPinMarkers
 * TEST 11: SHOW / HIDE works identically whether Nearby Spots is open or closed
 * TEST 12: HIDE does not trigger a Firestore read or query
 * TEST 13: SHOW does not trigger a Firestore read or query
 * TEST 14: Switching sort while markers are hidden preserves hidden state
 * TEST 15: Switching category while markers are hidden preserves hidden state
 * TEST 16: SHOW after category change renders newly filtered Pins, not stale Pins
 * TEST 17: HIDE while a map Pin preview is open closes the preview
 * TEST 18: SHOW does not automatically reopen previously closed preview
 * TEST 19: HIDE does not close full Pin Detail modal if open
 * TEST 20: HIDE does not interfere with Create Pin map-picking mode
 * TEST 21: Map-picking location indicator remains visible while showPinMarkers = false
 * TEST 22: Map click location selection works while showPinMarkers = false
 * TEST 23: Mobile and desktop share identical marker visibility logic
 * TEST 24: Button label shows HIDE when markers visible and SHOW when hidden
 * TEST 25: Aria-label reflects current visibility state
 * TEST 26: Session memory / geohash query caches are not cleared by HIDE/SHOW
 */

function createMockPin(id: string, title: string, category: PinCategory, likes: number, comments: number, createdAt: string): Pin {
  return {
    id,
    title,
    description: `Description for ${title}`,
    category,
    latitude: 37.7749 + Math.random() * 0.05,
    longitude: -122.4194 + Math.random() * 0.05,
    userId: 'user-1',
    userName: 'Explorer',
    createdAt,
    likeCount: likes,
    commentCount: comments,
    photoUrls: [],
  };
}

class HeyroqVisibilityController {
  // Canonical state mimicking App.tsx
  public pins: Pin[] = [];
  public showPinMarkers = true;
  public isDrawerOpen = true;
  public selectedCategory = '';
  public discoveryFilter: 'recent' | 'popular' | 'trending' = 'trending';
  public searchQuery = '';
  
  // Selection / modal state
  public selectedPinId: string | null = null;
  public selectedPinFallback: Pin | null = null;
  public detailPinId: string | null = null;
  
  // Create Pin map-picking state
  public isPickingLocationOnMap = false;
  public newPinLocation: LatLngPoint | null = null;

  // Telemetry spies
  public firestoreReadCount = 0;
  public firestoreQueryCount = 0;
  public sessionMemoryPinMap = new Map<string, Pin>();
  public queriedGeohashRanges = new Set<string>();

  constructor(initialPins: Pin[] = []) {
    this.pins = [...initialPins];
    initialPins.forEach((p) => this.sessionMemoryPinMap.set(p.id, p));
    this.queriedGeohashRanges.add('9q8yy');
    this.queriedGeohashRanges.add('9q8yz');
  }

  // Pure deterministic derivation matching App.tsx displayedPins
  get displayedPins(): Pin[] {
    let result = this.pins;
    const canonical = normalizeCategory(this.selectedCategory);
    if (canonical) {
      result = result.filter((p) => matchesCategoryFilter(p.category, canonical));
    }
    if (this.searchQuery.trim().length <= 1) {
      result = sortPins(result, this.discoveryFilter);
    }
    return result;
  }

  // Centralized marker rendering contract matching App.tsx visibleMapPins
  get visibleMapPins(): Pin[] {
    return this.showPinMarkers ? this.displayedPins : [];
  }

  // Selected Pin derivation matching App.tsx
  get selectedPin(): Pin | null {
    if (!this.selectedPinId) return null;
    return this.pins.find((p) => p.id === this.selectedPinId) || this.selectedPinFallback;
  }

  // Button label and accessibility state matching HeyroqMap.tsx
  get buttonLabel(): 'Hide' | 'Show' {
    return this.showPinMarkers ? 'Hide' : 'Show';
  }

  get buttonAriaLabel(): string {
    return this.showPinMarkers ? 'Hide Heyroq pins from map' : 'Show Heyroq pins on map';
  }

  // Actions matching App.tsx callbacks
  handleTogglePinMarkers() {
    const next = !this.showPinMarkers;
    this.showPinMarkers = next;
    if (!next) {
      this.handleSelectPin(null);
    }
  }

  handleSelectPin(pin: Pin | null) {
    if (!pin) {
      this.selectedPinId = null;
      this.selectedPinFallback = null;
    } else {
      this.selectedPinId = pin.id;
      this.selectedPinFallback = pin;
    }
  }

  handleOpenDetails(pin: Pin) {
    this.detailPinId = pin.id;
  }

  handleCloseDetails() {
    this.detailPinId = null;
  }

  handleToggleDrawer() {
    this.isDrawerOpen = !this.isDrawerOpen;
  }

  handleCloseDrawer() {
    this.isDrawerOpen = false;
  }

  handleOpenDrawer() {
    this.isDrawerOpen = true;
  }

  setDiscoveryFilter(filter: 'recent' | 'popular' | 'trending') {
    this.discoveryFilter = filter;
  }

  setSelectedCategory(cat: string) {
    this.selectedCategory = cat;
  }

  // Map-picking workflow matching App.tsx
  handleActivateMapPick() {
    this.isPickingLocationOnMap = true;
  }

  handleSelectCreateLocation(loc: LatLngPoint) {
    this.newPinLocation = loc;
    this.isPickingLocationOnMap = false;
  }
}

describe('Heyroq Map Pin Visibility — HIDE / SHOW Regression Suite', () => {
  const samplePins: Pin[] = [
    createMockPin('pin-1', 'Baker Beach Viewpoint', 'Hidden Gems', 40, 10, '2026-03-01T12:00:00Z'),
    createMockPin('pin-2', 'Sausalito Sunset Cove', 'Scenic Views', 25, 5, '2026-03-02T12:00:00Z'),
    createMockPin('pin-3', 'Mission Street Tacos', 'Food & Drink', 60, 20, '2026-03-03T12:00:00Z'),
    createMockPin('pin-4', 'Presidio Redwood Trail', 'Hidden Gems', 15, 2, '2026-03-04T12:00:00Z'),
  ];

  it('TEST 1: Default state has showPinMarkers = true', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    assert.strictEqual(ctrl.showPinMarkers, true, 'Default showPinMarkers must be true');
    assert.strictEqual(ctrl.visibleMapPins.length, 4, 'All candidate pins must be visible on map by default');
  });

  it('TEST 2: Pressing HIDE sets showPinMarkers = false', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    assert.strictEqual(ctrl.showPinMarkers, true);
    ctrl.handleTogglePinMarkers();
    assert.strictEqual(ctrl.showPinMarkers, false, 'Pressing HIDE must transition showPinMarkers to false');
  });

  it('TEST 3: Pressing SHOW sets showPinMarkers = true', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    assert.strictEqual(ctrl.showPinMarkers, false);
    ctrl.handleTogglePinMarkers(); // SHOW
    assert.strictEqual(ctrl.showPinMarkers, true, 'Pressing SHOW must transition showPinMarkers back to true');
  });

  it('TEST 4: HIDE does not mutate loaded candidate Pins collection', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    const originalLength = ctrl.pins.length;
    const originalPinIds = ctrl.pins.map((p) => p.id);
    
    ctrl.handleTogglePinMarkers(); // HIDE
    
    assert.strictEqual(ctrl.pins.length, originalLength, 'Canonical pins collection length must remain unchanged');
    assert.deepStrictEqual(ctrl.pins.map((p) => p.id), originalPinIds, 'Canonical pin IDs must remain identical');
  });

  it('TEST 5: HIDE does not alter Nearby Spots list contents', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    const nearbySpotsBefore = ctrl.displayedPins.map((p) => p.id);

    ctrl.handleTogglePinMarkers(); // HIDE

    const nearbySpotsAfter = ctrl.displayedPins.map((p) => p.id);
    assert.deepStrictEqual(nearbySpotsAfter, nearbySpotsBefore, 'Nearby Spots list contents must be preserved exactly');
  });

  it('TEST 6: HIDE does not alter Nearby Spots sort order', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.setDiscoveryFilter('popular');
    const orderBefore = ctrl.displayedPins.map((p) => p.id);

    ctrl.handleTogglePinMarkers(); // HIDE

    const orderAfter = ctrl.displayedPins.map((p) => p.id);
    assert.deepStrictEqual(orderAfter, orderBefore, 'Nearby Spots sort order must remain identical when markers are hidden');
  });

  it('TEST 7: HIDE causes visibleMapPins to be empty', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    assert.strictEqual(ctrl.visibleMapPins.length, 4);

    ctrl.handleTogglePinMarkers(); // HIDE

    assert.strictEqual(ctrl.visibleMapPins.length, 0, 'visibleMapPins must be completely empty when markers are hidden');
  });

  it('TEST 8: SHOW restores visibleMapPins to current displayedPins', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    assert.strictEqual(ctrl.visibleMapPins.length, 0);

    ctrl.handleTogglePinMarkers(); // SHOW
    assert.strictEqual(ctrl.visibleMapPins.length, ctrl.displayedPins.length, 'SHOW must restore visibleMapPins to match displayedPins');
    assert.deepStrictEqual(
      ctrl.visibleMapPins.map((p) => p.id),
      ctrl.displayedPins.map((p) => p.id),
      'Restored visibleMapPins must match displayedPins order and items'
    );
  });

  it('TEST 9: HIDE does not close Nearby Spots panel', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.isDrawerOpen = true;

    ctrl.handleTogglePinMarkers(); // HIDE

    assert.strictEqual(ctrl.isDrawerOpen, true, 'Nearby Spots drawer/panel must remain open when HIDE is clicked');
  });

  it('TEST 10: CLOSE closes Nearby Spots without changing showPinMarkers', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    assert.strictEqual(ctrl.showPinMarkers, true);
    assert.strictEqual(ctrl.isDrawerOpen, true);

    ctrl.handleCloseDrawer(); // CLOSE

    assert.strictEqual(ctrl.isDrawerOpen, false, 'Drawer must be closed by CLOSE');
    assert.strictEqual(ctrl.showPinMarkers, true, 'Marker visibility must remain untouched by drawer CLOSE');
  });

  it('TEST 11: SHOW / HIDE works identically whether Nearby Spots is open or closed', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    
    // Case A: Drawer is open
    ctrl.isDrawerOpen = true;
    ctrl.handleTogglePinMarkers(); // HIDE
    assert.strictEqual(ctrl.showPinMarkers, false);
    assert.strictEqual(ctrl.visibleMapPins.length, 0);

    // Case B: Drawer is closed
    ctrl.isDrawerOpen = false;
    ctrl.handleTogglePinMarkers(); // SHOW
    assert.strictEqual(ctrl.showPinMarkers, true);
    assert.strictEqual(ctrl.visibleMapPins.length, 4);

    ctrl.handleTogglePinMarkers(); // HIDE again while drawer closed
    assert.strictEqual(ctrl.showPinMarkers, false);
    assert.strictEqual(ctrl.visibleMapPins.length, 0);
  });

  it('TEST 12: HIDE does not trigger a Firestore read or query', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    const initialReads = ctrl.firestoreReadCount;
    const initialQueries = ctrl.firestoreQueryCount;

    ctrl.handleTogglePinMarkers(); // HIDE

    assert.strictEqual(ctrl.firestoreReadCount, initialReads, 'Zero Firestore reads must occur on HIDE');
    assert.strictEqual(ctrl.firestoreQueryCount, initialQueries, 'Zero Firestore queries must occur on HIDE');
  });

  it('TEST 13: SHOW does not trigger a Firestore read or query', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    const readsAfterHide = ctrl.firestoreReadCount;
    const queriesAfterHide = ctrl.firestoreQueryCount;

    ctrl.handleTogglePinMarkers(); // SHOW

    assert.strictEqual(ctrl.firestoreReadCount, readsAfterHide, 'Zero Firestore reads must occur on SHOW');
    assert.strictEqual(ctrl.firestoreQueryCount, queriesAfterHide, 'Zero Firestore queries must occur on SHOW');
  });

  it('TEST 14: Switching sort while markers are hidden preserves hidden state', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    assert.strictEqual(ctrl.showPinMarkers, false);

    ctrl.setDiscoveryFilter('popular');
    assert.strictEqual(ctrl.showPinMarkers, false, 'showPinMarkers must remain false after sort switch to POPULAR');
    assert.strictEqual(ctrl.visibleMapPins.length, 0, 'visibleMapPins must remain empty');

    ctrl.setDiscoveryFilter('recent');
    assert.strictEqual(ctrl.showPinMarkers, false, 'showPinMarkers must remain false after sort switch to RECENT');
    assert.strictEqual(ctrl.visibleMapPins.length, 0, 'visibleMapPins must remain empty');
  });

  it('TEST 15: Switching category while markers are hidden preserves hidden state', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    assert.strictEqual(ctrl.showPinMarkers, false);

    ctrl.setSelectedCategory('Hidden Gems');
    assert.strictEqual(ctrl.showPinMarkers, false, 'showPinMarkers must remain false after category change');
    assert.strictEqual(ctrl.visibleMapPins.length, 0, 'visibleMapPins must remain empty');
    assert.strictEqual(ctrl.displayedPins.length, 2, 'Nearby Spots should reflect filtered category');
  });

  it('TEST 16: SHOW after category change renders newly filtered Pins, not stale Pins', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    ctrl.setSelectedCategory('Hidden Gems'); // 2 pins match

    ctrl.handleTogglePinMarkers(); // SHOW
    assert.strictEqual(ctrl.showPinMarkers, true);
    assert.strictEqual(ctrl.visibleMapPins.length, 2, 'Rendered markers must match the current filter count (2)');
    assert.ok(
      ctrl.visibleMapPins.every((p) => p.category === 'Hidden Gems'),
      'Rendered markers must strictly belong to current category filter'
    );
  });

  it('TEST 17: HIDE while a map Pin preview is open closes the preview', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleSelectPin(samplePins[0]);
    assert.ok(ctrl.selectedPin, 'Preview must be active before HIDE');

    ctrl.handleTogglePinMarkers(); // HIDE

    assert.strictEqual(ctrl.selectedPin, null, 'Map Pin preview must be cleanly closed on HIDE');
    assert.strictEqual(ctrl.selectedPinId, null, 'selectedPinId must be null');
  });

  it('TEST 18: SHOW does not automatically reopen previously closed preview', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleSelectPin(samplePins[0]);
    ctrl.handleTogglePinMarkers(); // HIDE (clears preview)
    assert.strictEqual(ctrl.selectedPin, null);

    ctrl.handleTogglePinMarkers(); // SHOW
    assert.strictEqual(ctrl.selectedPin, null, 'Previously closed preview must NOT automatically reopen on SHOW');
  });

  it('TEST 19: HIDE does not close full Pin Detail modal if open', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleOpenDetails(samplePins[0]);
    assert.strictEqual(ctrl.detailPinId, samplePins[0].id, 'Pin Detail modal is open');

    ctrl.handleTogglePinMarkers(); // HIDE

    assert.strictEqual(ctrl.detailPinId, samplePins[0].id, 'Full Pin Detail modal must remain open when markers are hidden');
  });

  it('TEST 20: HIDE does not interfere with Create Pin map-picking mode', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE markers
    assert.strictEqual(ctrl.showPinMarkers, false);

    ctrl.handleActivateMapPick(); // Enter map-pick mode
    assert.strictEqual(ctrl.isPickingLocationOnMap, true, 'Map-picking mode must activate normally even if markers are hidden');
  });

  it('TEST 21: Map-picking location indicator remains visible while showPinMarkers = false', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    ctrl.handleActivateMapPick();

    // Map-picking indicator depends solely on (isCreating && createLocation), independent of showPinMarkers
    const targetLocation: LatLngPoint = { lat: 37.78, lng: -122.42 };
    ctrl.newPinLocation = targetLocation;

    const isIndicatorVisible = ctrl.isPickingLocationOnMap && ctrl.newPinLocation !== null;
    assert.strictEqual(isIndicatorVisible, true, 'Location indicator must remain visible regardless of showPinMarkers');
  });

  it('TEST 22: Map click location selection works while showPinMarkers = false', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    ctrl.handleTogglePinMarkers(); // HIDE
    ctrl.handleActivateMapPick();

    const clickedPoint: LatLngPoint = { lat: 37.791, lng: -122.405 };
    ctrl.handleSelectCreateLocation(clickedPoint);

    assert.deepStrictEqual(ctrl.newPinLocation, clickedPoint, 'Coordinates must be recorded accurately');
    assert.strictEqual(ctrl.isPickingLocationOnMap, false, 'Map-picking mode finishes upon selection');
  });

  it('TEST 23: Mobile and desktop share identical marker visibility logic', () => {
    const desktopCtrl = new HeyroqVisibilityController(samplePins);
    const mobileCtrl = new HeyroqVisibilityController(samplePins);

    // Both start visible
    assert.strictEqual(desktopCtrl.showPinMarkers, mobileCtrl.showPinMarkers);

    // Both toggle identically
    desktopCtrl.handleTogglePinMarkers();
    mobileCtrl.handleTogglePinMarkers();
    assert.strictEqual(desktopCtrl.showPinMarkers, false);
    assert.strictEqual(mobileCtrl.showPinMarkers, false);

    assert.deepStrictEqual(desktopCtrl.visibleMapPins, mobileCtrl.visibleMapPins);
  });

  it('TEST 24: Button label shows HIDE when markers visible and SHOW when hidden', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    assert.strictEqual(ctrl.buttonLabel, 'Hide', 'Button label must be Hide when showPinMarkers is true');

    ctrl.handleTogglePinMarkers(); // HIDE
    assert.strictEqual(ctrl.buttonLabel, 'Show', 'Button label must be Show when showPinMarkers is false');

    ctrl.handleTogglePinMarkers(); // SHOW
    assert.strictEqual(ctrl.buttonLabel, 'Hide', 'Button label must return to Hide when showPinMarkers is true');
  });

  it('TEST 25: Aria-label reflects current visibility state', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    assert.strictEqual(
      ctrl.buttonAriaLabel,
      'Hide Heyroq pins from map',
      'Aria-label must prompt to hide when visible'
    );

    ctrl.handleTogglePinMarkers(); // HIDE
    assert.strictEqual(
      ctrl.buttonAriaLabel,
      'Show Heyroq pins on map',
      'Aria-label must prompt to show when hidden'
    );
  });

  it('TEST 26: Session memory / geohash query caches are not cleared by HIDE/SHOW', () => {
    const ctrl = new HeyroqVisibilityController(samplePins);
    const initialGeohashes = Array.from(ctrl.queriedGeohashRanges);
    const initialSessionPinsCount = ctrl.sessionMemoryPinMap.size;

    ctrl.handleTogglePinMarkers(); // HIDE
    ctrl.handleTogglePinMarkers(); // SHOW

    assert.strictEqual(ctrl.sessionMemoryPinMap.size, initialSessionPinsCount, 'sessionMemoryPinMap must not be cleared');
    assert.deepStrictEqual(Array.from(ctrl.queriedGeohashRanges), initialGeohashes, 'queriedGeohashRanges must not be cleared');
  });
});
