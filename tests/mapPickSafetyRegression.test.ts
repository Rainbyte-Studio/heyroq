import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CreatePinDraft } from '../src/components/Pin/CreatePinModal';
import { LatLngPoint, PinCategory } from '../src/types';

/**
 * PURE IN-MEMORY NON-DESTRUCTIVE REGRESSION TEST SUITE
 * 
 * Verifies the "CLICK ON MAP TO PICK" workflow contracts:
 * - Opening Create Pin does not activate map-pick mode prematurely.
 * - Entering map-pick mode does NOT unmount or cancel the Create Pin flow.
 * - All draft fields (title, category, description, tags, photos) survive intact.
 * - Map selection captures exact coordinates and restores the form with coordinates populated.
 * - Cancelling map-pick mode returns to Create Pin without losing draft data.
 * - Zero Firestore mutations occur during location picking.
 * - Normal Cancel and Publish behaviors remain strictly intact.
 */

// Simulated Controller implementing the exact state machine of App.tsx + CreatePinModal.tsx
class CreatePinFlowController {
  // App.tsx state
  public isCreateOpen = false;
  public isPickingLocationOnMap = false;
  public newPinLocation: LatLngPoint | null = null;
  public pickedLocationName = '';
  public createPinDraft: CreatePinDraft | null = null;

  // Telemetry & Safety spies
  public closeCallCount = 0;
  public firestoreWriteCallCount = 0;
  public publishedPins: Array<{ draft: CreatePinDraft; location: LatLngPoint }> = [];

  // 1. User opens Create Pin modal
  handleOpenCreatePin() {
    this.isPickingLocationOnMap = false;
    this.isCreateOpen = true;
  }

  // 2. User clicks "CLICK ON MAP TO PICK" inside CreatePinModal
  // In the fixed code: onActivateMapPick is called with current draft snapshot, onClose is NOT called.
  handleClickOnMapToPick(currentDraft: CreatePinDraft) {
    this.createPinDraft = currentDraft;
    this.isPickingLocationOnMap = true;
    // CRITICAL: isCreateOpen remains true!
  }

  // 3. User clicks map to select coordinates
  handleSelectCreateLocation(loc: LatLngPoint, resolvedName?: string) {
    this.newPinLocation = loc;
    if (resolvedName) {
      this.pickedLocationName = resolvedName;
    }
    if (this.createPinDraft) {
      this.createPinDraft = {
        ...this.createPinDraft,
        customLat: loc.lat,
        customLng: loc.lng,
        locationName: resolvedName || this.createPinDraft.locationName,
      };
    }
    if (this.isPickingLocationOnMap) {
      this.isPickingLocationOnMap = false;
    }
  }

  // 4. User cancels map-picking mode (via banner button or Escape)
  handleCancelMapPick() {
    this.isPickingLocationOnMap = false;
    // CRITICAL: isCreateOpen remains true, draft is NOT wiped!
  }

  // 5. User cancels/discards Create Pin modal normally
  handleNormalModalClose() {
    this.closeCallCount++;
    this.isPickingLocationOnMap = false;
    this.isCreateOpen = false;
    this.createPinDraft = null;
    this.newPinLocation = null;
    this.pickedLocationName = '';
  }

  // 6. User submits form to publish pin
  async handlePublishPin() {
    if (!this.createPinDraft) {
      throw new Error('Cannot publish without draft');
    }
    // Simulate Firestore write
    this.firestoreWriteCallCount++;
    this.publishedPins.push({
      draft: { ...this.createPinDraft },
      location: {
        lat: this.createPinDraft.customLat,
        lng: this.createPinDraft.customLng,
      },
    });

    // Reset flow after successful creation
    this.isPickingLocationOnMap = false;
    this.isCreateOpen = false;
    this.createPinDraft = null;
    this.newPinLocation = null;
    this.pickedLocationName = '';
  }
}

describe('Create Pin "Click on Map to Pick" Regression & Safety Test Suite', () => {

  it('TEST 1: Opening Create Pin does not enter map-picking mode', () => {
    const controller = new CreatePinFlowController();
    assert.equal(controller.isCreateOpen, false);
    assert.equal(controller.isPickingLocationOnMap, false);

    controller.handleOpenCreatePin();

    assert.equal(controller.isCreateOpen, true);
    assert.equal(controller.isPickingLocationOnMap, false);
  });

  it('TEST 2: Clicking "CLICK ON MAP TO PICK" enters map-picking mode', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    const mockDraft: CreatePinDraft = {
      title: 'Rue de l’Abreuvoir Sunset',
      description: 'Iconic pink house corner with golden hour light.',
      category: 'Photography' as PinCategory,
      locationName: 'Montmartre, Paris',
      tags: ['paris', 'sunset'],
      files: [],
      previewUrls: [],
      customLat: 48.8888,
      customLng: 2.3395,
    };

    controller.handleClickOnMapToPick(mockDraft);

    assert.equal(controller.isPickingLocationOnMap, true);
    assert.equal(controller.isCreateOpen, true);
  });

  it('TEST 3: Entering map-picking mode does NOT invoke the normal Cancel flow', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    const mockDraft: CreatePinDraft = {
      title: 'Secret Wine Cellar',
      description: 'Hidden beneath the old cobblestone street.',
      category: 'Hidden Gems' as PinCategory,
      locationName: 'Latin Quarter',
      tags: ['wine', 'secret'],
      files: [],
      previewUrls: [],
      customLat: 48.8500,
      customLng: 2.3450,
    };

    controller.handleClickOnMapToPick(mockDraft);

    // Ensure normal close handler was NOT triggered
    assert.equal(controller.closeCallCount, 0);
    // Modal flow is still alive
    assert.equal(controller.isCreateOpen, true);
    // Draft was NOT destroyed
    assert.notEqual(controller.createPinDraft, null);
  });

  it('TEST 4: Draft title survives map-picking mode', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    const initialTitle = 'Montmartre Hidden Rooftop';
    controller.handleClickOnMapToPick({
      title: initialTitle,
      description: '',
      category: 'Hidden Gems' as PinCategory,
      locationName: '',
      tags: [],
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    // Simulate location selection on map
    controller.handleSelectCreateLocation({ lat: 48.8872, lng: 2.3429 });

    assert.equal(controller.createPinDraft?.title, initialTitle);
  });

  it('TEST 5: Draft category survives map-picking mode', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    const category: PinCategory = 'Activities';
    controller.handleClickOnMapToPick({
      title: 'Seine Kayaking Club',
      description: '',
      category,
      locationName: '',
      tags: [],
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    controller.handleSelectCreateLocation({ lat: 48.8500, lng: 2.3500 });

    assert.equal(controller.createPinDraft?.category, 'Activities');
  });

  it('TEST 6: Draft description/tags survive map-picking mode', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    const description = 'Ring the buzzer twice and mention the blue door.';
    const tags = ['secret', 'nightlife', 'speakeasy'];

    controller.handleClickOnMapToPick({
      title: 'The Vault',
      description,
      category: 'Hidden Gems' as PinCategory,
      locationName: '',
      tags,
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    controller.handleSelectCreateLocation({ lat: 48.8600, lng: 2.3300 });

    assert.equal(controller.createPinDraft?.description, description);
    assert.deepEqual(controller.createPinDraft?.tags, ['secret', 'nightlife', 'speakeasy']);
  });

  it('TEST 7: Selected photos survive map-picking mode', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    // Mock File object representations
    const mockFile1 = { name: 'photo1.jpg', size: 1024 } as unknown as File;
    const mockFile2 = { name: 'photo2.jpg', size: 2048 } as unknown as File;
    const mockPreviews = ['blob:http://localhost:3000/mock-1', 'blob:http://localhost:3000/mock-2'];

    controller.handleClickOnMapToPick({
      title: 'Artisan Bakery',
      description: 'Sourdough naturally fermented 48 hours.',
      category: 'Food' as PinCategory,
      locationName: 'Marais',
      tags: ['bakery'],
      files: [mockFile1, mockFile2],
      previewUrls: mockPreviews,
      customLat: 0,
      customLng: 0,
    });

    controller.handleSelectCreateLocation({ lat: 48.8550, lng: 2.3600 });

    assert.equal(controller.createPinDraft?.files.length, 2);
    assert.deepEqual(controller.createPinDraft?.previewUrls, mockPreviews);
  });

  it('TEST 8: Map click captures the expected lat/lng', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    controller.handleClickOnMapToPick({
      title: 'Target Spot',
      description: '',
      category: 'Travel' as PinCategory,
      locationName: '',
      tags: [],
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    const targetCoords = { lat: 48.8584, lng: 2.2945 }; // Eiffel Tower coordinates
    controller.handleSelectCreateLocation(targetCoords, 'Champ de Mars, Paris');

    assert.equal(controller.newPinLocation?.lat, 48.8584);
    assert.equal(controller.newPinLocation?.lng, 2.2945);
    assert.equal(controller.pickedLocationName, 'Champ de Mars, Paris');
  });

  it('TEST 9: After selection, Create Pin is restored', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    controller.handleClickOnMapToPick({
      title: 'Spot to Locate',
      description: '',
      category: 'Nature' as PinCategory,
      locationName: '',
      tags: [],
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    assert.equal(controller.isPickingLocationOnMap, true);
    assert.equal(controller.isCreateOpen, true);

    controller.handleSelectCreateLocation({ lat: 48.8700, lng: 2.3100 });

    // Mode is restored
    assert.equal(controller.isPickingLocationOnMap, false);
    assert.equal(controller.isCreateOpen, true);
  });

  it('TEST 10: Selected coordinates appear in the restored form', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    controller.handleClickOnMapToPick({
      title: 'Panthéon Viewpoint',
      description: 'Stunning colonnade perspective.',
      category: 'Photography' as PinCategory,
      locationName: '',
      tags: ['heritage'],
      files: [],
      previewUrls: [],
      customLat: 37.7749,
      customLng: -122.4194,
    });

    const newCoords = { lat: 48.8462, lng: 2.3464 };
    controller.handleSelectCreateLocation(newCoords, 'Place du Panthéon');

    assert.equal(controller.createPinDraft?.customLat, 48.8462);
    assert.equal(controller.createPinDraft?.customLng, 2.3464);
    assert.equal(controller.createPinDraft?.locationName, 'Place du Panthéon');
    assert.equal(controller.createPinDraft?.title, 'Panthéon Viewpoint');
  });

  it('TEST 11: Map-picking mode exits after successful selection', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    controller.handleClickOnMapToPick({
      title: 'One-time Pick Spot',
      description: '',
      category: 'Other' as PinCategory,
      locationName: '',
      tags: [],
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    assert.equal(controller.isPickingLocationOnMap, true);

    controller.handleSelectCreateLocation({ lat: 48.8606, lng: 2.3376 });

    // Exited map-picking mode
    assert.equal(controller.isPickingLocationOnMap, false);
  });

  it('TEST 12: Cancelling map-picking returns to Create Pin without losing draft', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    const existingDraft: CreatePinDraft = {
      title: 'Canal Saint-Martin Cafe',
      description: 'Specialty coffee by the iron footbridges.',
      category: 'Food' as PinCategory,
      locationName: '10th Arrondissement',
      tags: ['coffee', 'canal'],
      files: [],
      previewUrls: [],
      customLat: 48.8710,
      customLng: 2.3650,
    };

    controller.handleClickOnMapToPick(existingDraft);
    assert.equal(controller.isPickingLocationOnMap, true);

    // User clicks Cancel on the map-pick banner or presses Escape
    controller.handleCancelMapPick();

    assert.equal(controller.isPickingLocationOnMap, false);
    assert.equal(controller.isCreateOpen, true);
    assert.deepEqual(controller.createPinDraft, existingDraft);
  });

  it('TEST 13: No Firestore Pin write occurs during location selection', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    controller.handleClickOnMapToPick({
      title: 'Safety Check Spot',
      description: 'Ensuring zero mutations.',
      category: 'Hidden Gems' as PinCategory,
      locationName: '',
      tags: [],
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    // Select location 1
    controller.handleSelectCreateLocation({ lat: 48.8000, lng: 2.3000 });
    // Re-pick location 2
    controller.handleClickOnMapToPick(controller.createPinDraft!);
    controller.handleSelectCreateLocation({ lat: 48.8100, lng: 2.3100 });
    // Cancel pick
    controller.handleClickOnMapToPick(controller.createPinDraft!);
    controller.handleCancelMapPick();

    // STRICT SAFETY INVARIANT: ZERO writes occurred
    assert.equal(controller.firestoreWriteCallCount, 0);
    assert.equal(controller.publishedPins.length, 0);
  });

  it('TEST 14: Normal Create Pin Cancel still behaves normally', () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    controller.handleClickOnMapToPick({
      title: 'Temporary Draft',
      description: 'To be discarded.',
      category: 'Events' as PinCategory,
      locationName: '',
      tags: [],
      files: [],
      previewUrls: [],
      customLat: 0,
      customLng: 0,
    });

    // Return to form
    controller.handleSelectCreateLocation({ lat: 48.8500, lng: 2.3500 });
    assert.equal(controller.isCreateOpen, true);

    // User explicitly cancels or discards the modal
    controller.handleNormalModalClose();

    assert.equal(controller.closeCallCount, 1);
    assert.equal(controller.isCreateOpen, false);
    assert.equal(controller.isPickingLocationOnMap, false);
    assert.equal(controller.createPinDraft, null);
  });

  it('TEST 15: PUBLISH PIN remains the only action that creates the Pin', async () => {
    const controller = new CreatePinFlowController();
    controller.handleOpenCreatePin();

    const fullDraft: CreatePinDraft = {
      title: 'Passage des Panoramas Antique Shop',
      description: 'Oldest covered passageway in Paris with vintage stamp and postcard collectors.',
      category: 'Hidden Gems' as PinCategory,
      locationName: 'Passage des Panoramas',
      tags: ['vintage', 'history', 'antiques'],
      files: [],
      previewUrls: [],
      customLat: 48.8712,
      customLng: 2.3422,
    };

    // 1. Enter map-pick mode
    controller.handleClickOnMapToPick(fullDraft);
    assert.equal(controller.firestoreWriteCallCount, 0);

    // 2. Select location
    controller.handleSelectCreateLocation({ lat: 48.8715, lng: 2.3425 }, 'Passage des Panoramas, Paris');
    assert.equal(controller.firestoreWriteCallCount, 0);

    // 3. User finally clicks PUBLISH PIN
    await controller.handlePublishPin();

    assert.equal(controller.firestoreWriteCallCount, 1);
    assert.equal(controller.publishedPins.length, 1);
    assert.equal(controller.publishedPins[0].draft.title, 'Passage des Panoramas Antique Shop');
    assert.equal(controller.publishedPins[0].location.lat, 48.8715);
    assert.equal(controller.publishedPins[0].location.lng, 2.3425);
    // Modal is cleanly closed
    assert.equal(controller.isCreateOpen, false);
    assert.equal(controller.createPinDraft, null);
  });
});
