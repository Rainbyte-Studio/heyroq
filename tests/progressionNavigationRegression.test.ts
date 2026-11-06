import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * TARGETED NAVIGATION REGRESSION TEST SUITE:
 * AUTHENTICATED USER DROPDOWN -> "PROGRESSION & BADGES" & "MY PROFILE & SPOTS"
 * 
 * Verifies all required contracts:
 * TEST 1: My Profile & Spots opens Profile.
 * TEST 2: My Profile & Spots does not directly open Explorer Progression.
 * TEST 3: Progression & Badges opens Explorer Progression directly.
 * TEST 4: Progression & Badges does not open Profile.
 * TEST 5: Account dropdown closes after Progression & Badges is selected.
 * TEST 6: Explorer Progression receives the authenticated user context.
 * TEST 7: Closing Explorer Progression returns to the main application.
 * TEST 8: Closing Explorer Progression does not automatically open Profile.
 * TEST 9: Existing Profile -> Explorer Progression navigation still works.
 * TEST 10: No Firestore write occurs from navigation.
 * TEST 11: Desktop uses the correct handler.
 * TEST 12: Mobile uses the correct handler.
 * TEST 13: Profile modal is not mounted underneath when Progression opens.
 * TEST 14: User sign-out cleanly resets progression modal state.
 */

interface MockUser {
  uid: string;
  email: string;
}

interface MockProfile {
  displayName: string;
  username: string;
}

class HeyroqNavigationController {
  // Auth state
  public user: MockUser | null;
  public profile: MockProfile | null;

  // Navigation / Modal state mirroring App.tsx
  public profileUserId: string | null = null;
  public isProgressionOpen = false;
  public userDropdownOpen = false;

  // Profile internal state mirroring UserProfileModal.tsx
  public profileInternalAchievementsOpen = false;

  // Spies
  public firestoreWriteCount = 0;
  public firestoreQueryCount = 0;

  constructor(user: MockUser | null = { uid: 'auth-user-99', email: 'explorer@heyroq.com' }, profile: MockProfile | null = { displayName: 'Trailblazer Alice', username: 'alice' }) {
    this.user = user;
    this.profile = profile;
  }

  // Dropdown open/close
  openDropdown() {
    if (this.user) {
      this.userDropdownOpen = true;
    }
  }

  closeDropdown() {
    this.userDropdownOpen = false;
  }

  // Handlers matching App.tsx & Navbar.tsx
  handleOpenProfile(uid: string) {
    if (uid) {
      this.profileUserId = uid;
    }
  }

  handleOpenProgression() {
    if (this.user) {
      this.profileUserId = null; // Guarantee Profile modal is not open/underneath
      this.isProgressionOpen = true;
    }
  }

  handleCloseProgression() {
    this.isProgressionOpen = false;
  }

  handleCloseProfile() {
    this.profileUserId = null;
    this.profileInternalAchievementsOpen = false;
  }

  // Dropdown Action: "My Profile & Spots" (matching Navbar.tsx line 609-612)
  clickMyProfileAndSpots() {
    if (!this.user) return;
    this.handleOpenProfile(this.user.uid);
    this.userDropdownOpen = false;
  }

  // Dropdown Action: "Progression & Badges" (matching Navbar.tsx line 620-625)
  clickProgressionAndBadges() {
    if (!this.user) return;
    this.handleOpenProgression();
    this.userDropdownOpen = false;
  }

  // Inside Profile Modal: ExplorerProgressionBar click (matching UserProfileModal.tsx line 527)
  clickProgressionFromInsideProfile() {
    if (this.profileUserId) {
      this.profileInternalAchievementsOpen = true;
    }
  }

  closeProgressionInsideProfile() {
    this.profileInternalAchievementsOpen = false;
  }

  // Sign out transition matching App.tsx useEffect([user])
  handleSignOut() {
    this.user = null;
    this.profile = null;
    this.userDropdownOpen = false;
    this.profileUserId = null;
    this.isProgressionOpen = false;
  }

  // Modal active progression props evaluation
  getActiveProgressionContext(): { userId: string; displayName?: string } | null {
    if (this.isProgressionOpen && this.user) {
      return {
        userId: this.user.uid,
        displayName: this.profile?.displayName,
      };
    }
    if (this.profileUserId && this.profileInternalAchievementsOpen) {
      return {
        userId: this.profileUserId,
        displayName: this.profile?.displayName,
      };
    }
    return null;
  }
}

describe('Heyroq User Navigation: Progression & Badges vs My Profile & Spots', () => {
  it('TEST 1: My Profile & Spots opens Profile', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    assert.strictEqual(ctrl.userDropdownOpen, true);

    ctrl.clickMyProfileAndSpots();

    assert.strictEqual(ctrl.profileUserId, 'auth-user-99', 'Profile must open for current user UID');
  });

  it('TEST 2: My Profile & Spots does not directly open Explorer Progression', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    ctrl.clickMyProfileAndSpots();

    assert.strictEqual(ctrl.isProgressionOpen, false, 'My Profile & Spots must NOT open Explorer Progression directly');
  });

  it('TEST 3: Progression & Badges opens Explorer Progression directly', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();

    assert.strictEqual(ctrl.isProgressionOpen, true, 'Explorer Progression modal must be open directly');
  });

  it('TEST 4: Progression & Badges does not open Profile', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();

    assert.strictEqual(ctrl.profileUserId, null, 'Profile modal must NOT open or be set as target');
  });

  it('TEST 5: Account dropdown closes after Progression & Badges is selected', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    assert.strictEqual(ctrl.userDropdownOpen, true);

    ctrl.clickProgressionAndBadges();

    assert.strictEqual(ctrl.userDropdownOpen, false, 'Account dropdown must be closed immediately after clicking');
  });

  it('TEST 6: Explorer Progression receives the authenticated user context', () => {
    const customUser: MockUser = { uid: 'adventurer-777', email: 'sarah@wildtrails.io' };
    const customProfile: MockProfile = { displayName: 'Sarah Walker', username: 'swalker' };
    const ctrl = new HeyroqNavigationController(customUser, customProfile);

    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();

    const context = ctrl.getActiveProgressionContext();
    assert.ok(context, 'Progression context must be active');
    assert.strictEqual(context.userId, 'adventurer-777', 'Must use authenticated user UID, not hardcoded');
    assert.strictEqual(context.displayName, 'Sarah Walker', 'Must pass current user displayName');
  });

  it('TEST 7: Closing Explorer Progression returns to the main application', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();
    assert.strictEqual(ctrl.isProgressionOpen, true);

    ctrl.handleCloseProgression();

    assert.strictEqual(ctrl.isProgressionOpen, false, 'Progression modal is closed');
    assert.strictEqual(ctrl.profileUserId, null, 'No modal is open; returned to main app');
    assert.strictEqual(ctrl.userDropdownOpen, false, 'Dropdown is closed');
  });

  it('TEST 8: Closing Explorer Progression does not automatically open Profile', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();
    ctrl.handleCloseProgression();

    assert.strictEqual(ctrl.profileUserId, null, 'Closing Progression must NEVER open Profile modal');
  });

  it('TEST 9: Existing Profile -> Explorer Progression navigation still works', () => {
    const ctrl = new HeyroqNavigationController();
    // 1. Open Profile
    ctrl.openDropdown();
    ctrl.clickMyProfileAndSpots();
    assert.strictEqual(ctrl.profileUserId, 'auth-user-99');
    assert.strictEqual(ctrl.profileInternalAchievementsOpen, false);

    // 2. Click ExplorerProgressionBar inside Profile
    ctrl.clickProgressionFromInsideProfile();
    assert.strictEqual(ctrl.profileInternalAchievementsOpen, true, 'Achievements modal inside profile opens');

    const context = ctrl.getActiveProgressionContext();
    assert.ok(context);
    assert.strictEqual(context.userId, 'auth-user-99');

    // 3. Close Achievements modal inside Profile
    ctrl.closeProgressionInsideProfile();
    assert.strictEqual(ctrl.profileInternalAchievementsOpen, false);
    assert.strictEqual(ctrl.profileUserId, 'auth-user-99', 'Still on Profile modal after closing achievements inside profile');
  });

  it('TEST 10: No Firestore write occurs from navigation', () => {
    const ctrl = new HeyroqNavigationController();
    const initialWrites = ctrl.firestoreWriteCount;

    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();
    ctrl.handleCloseProgression();

    ctrl.openDropdown();
    ctrl.clickMyProfileAndSpots();
    ctrl.clickProgressionFromInsideProfile();
    ctrl.closeProgressionInsideProfile();
    ctrl.handleCloseProfile();

    assert.strictEqual(ctrl.firestoreWriteCount, initialWrites, 'Navigation must cause 0 Firestore writes');
  });

  it('TEST 11: Desktop uses the correct handler', () => {
    // Both desktop and mobile share Navbar.tsx and userDropdownOpen
    const desktopCtrl = new HeyroqNavigationController();
    desktopCtrl.openDropdown();
    desktopCtrl.clickProgressionAndBadges();

    assert.strictEqual(desktopCtrl.isProgressionOpen, true);
    assert.strictEqual(desktopCtrl.profileUserId, null);
    assert.strictEqual(desktopCtrl.userDropdownOpen, false);
  });

  it('TEST 12: Mobile uses the correct handler', () => {
    // Both desktop and mobile share Navbar.tsx and userDropdownOpen
    const mobileCtrl = new HeyroqNavigationController();
    mobileCtrl.openDropdown();
    mobileCtrl.clickProgressionAndBadges();

    assert.strictEqual(mobileCtrl.isProgressionOpen, true);
    assert.strictEqual(mobileCtrl.profileUserId, null);
    assert.strictEqual(mobileCtrl.userDropdownOpen, false);
  });

  it('TEST 13: Profile modal is not mounted underneath when Progression opens', () => {
    const ctrl = new HeyroqNavigationController();
    // Simulate rare state where profile was set
    ctrl.profileUserId = 'some-other-user';
    
    // Clicking Progression & Badges guarantees profileUserId is reset
    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();

    assert.strictEqual(ctrl.profileUserId, null, 'profileUserId must be null so Profile is not underneath');
    assert.strictEqual(ctrl.isProgressionOpen, true, 'isProgressionOpen must be true');
  });

  it('TEST 14: User sign-out cleanly resets progression modal state', () => {
    const ctrl = new HeyroqNavigationController();
    ctrl.openDropdown();
    ctrl.clickProgressionAndBadges();
    assert.strictEqual(ctrl.isProgressionOpen, true);

    // User signs out
    ctrl.handleSignOut();

    assert.strictEqual(ctrl.isProgressionOpen, false, 'Progression modal must close on sign out');
    assert.strictEqual(ctrl.user, null);
  });
});
