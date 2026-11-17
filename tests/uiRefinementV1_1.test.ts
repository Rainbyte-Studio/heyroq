import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_IDENTITY, FONT_FAMILIES } from '../src/config/brandConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('Profile Settings button scrolls internal Profile container to #profile-settings-panel with reduced-motion and focus support', () => {
  const profileSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Profile/UserProfileModal.tsx'),
    'utf8'
  );

  assert.ok(
    profileSrc.includes('id="profile-settings-btn"'),
    'UserProfileModal must render #profile-settings-btn'
  );
  assert.ok(
    profileSrc.includes('onClick={handleNavigateToSettings}'),
    '#profile-settings-btn must invoke handleNavigateToSettings on every click'
  );
  assert.ok(
    profileSrc.includes('aria-controls="profile-settings-panel"'),
    '#profile-settings-btn must declare aria-controls="profile-settings-panel"'
  );
  assert.ok(
    profileSrc.includes('profileScrollContainerRef'),
    'UserProfileModal must scroll its internal scroll container directly rather than relying on block: nearest'
  );
  assert.ok(
    profileSrc.includes("prefers-reduced-motion: reduce"),
    'Profile settings navigation must respect prefers-reduced-motion'
  );
  assert.ok(
    profileSrc.includes('sectionEl.focus({ preventScroll: true })'),
    'Profile settings navigation must move focus cleanly to #profile-settings-panel'
  );
  assert.ok(
    profileSrc.includes('id="profile-settings-panel"') &&
      profileSrc.includes('idPrefix="profile-theme"') &&
      profileSrc.includes('id="profile-account-security-btn"'),
    '#profile-settings-panel must expose Appearance and Account & Security controls'
  );

  // Verify spacing refinement between statistics card and Appearance settings
  const settingsPanelBlockMatch = profileSrc.match(
    /id="profile-settings-panel"[\s\S]*?idPrefix="profile-theme"/
  );
  assert.ok(settingsPanelBlockMatch, '#profile-settings-panel markup before Appearance must exist');
  assert.ok(
    settingsPanelBlockMatch[0].includes('mt-5 sm:mt-6'),
    '#profile-settings-panel must use 20-24px vertical whitespace (mt-5 sm:mt-6) below statistics container'
  );
  assert.equal(
    settingsPanelBlockMatch[0].includes('border-t'),
    false,
    '#profile-settings-panel must not render a redundant horizontal border-t immediately above Appearance'
  );

  // Verify surrounding borders/dividers remain intact
  const progressionSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Profile/ExplorerProgressionBar.tsx'),
    'utf8'
  );
  assert.ok(
    progressionSrc.includes('id="explorer-progression-bar"') &&
      progressionSrc.includes('liquid-glass-card rounded-2xl'),
    'ExplorerProgressionBar must preserve its rounded card border around Spots, Cities, Nations, and Likes'
  );

  const footprintSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Profile/FootprintSection.tsx'),
    'utf8'
  );
  assert.ok(
    footprintSrc.includes('id="footprint-section"') &&
      footprintSrc.includes('border-t border-slate-900/8 dark:border-white/10'),
    'FootprintSection must preserve the horizontal divider below Account & Security separating settings from My Footprint'
  );
});

test('Shared CloseButton enforces circular icon-only design, zero nested backdrop-filter when embedded, and accessible labels across modals and panels', () => {
  const closeBtnSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Common/CloseButton.tsx'),
    'utf8'
  );

  assert.ok(closeBtnSrc.includes('React.forwardRef'), 'CloseButton must forward ref for focus traps');
  assert.ok(closeBtnSrc.includes('rounded-full'), 'CloseButton must be circular');
  assert.ok(closeBtnSrc.includes('w-9 h-9'), 'Default CloseButton visual size must be 36x36px');
  assert.ok(
    closeBtnSrc.includes('after:-inset-1'),
    'CloseButton must expand touch hit area to 44x44px on mobile'
  );
  assert.ok(closeBtnSrc.includes('w-4 h-4'), 'CloseButton X icon must be 16x16px');
  assert.ok(closeBtnSrc.includes('aria-label={ariaLabel}'), 'CloseButton must require aria-label');
  assert.ok(
    closeBtnSrc.includes('event.stopPropagation()'),
    'CloseButton must stop propagation by default to prevent accidental underlying clicks'
  );
  assert.equal(
    closeBtnSrc.includes('>Close<'),
    false,
    'CloseButton must never render visible "Close" text'
  );

  // Embedded variant must NOT apply backdrop-filter (avoids nested blur inside glass surfaces)
  const embeddedLine = closeBtnSrc
    .split('\n')
    .find((line) => line.includes('border-[var(--glass-border-strong)]') && line.includes('bg-slate-900'));
  assert.ok(embeddedLine, 'Embedded CloseButton surface classes must exist');
  assert.equal(
    embeddedLine.includes('backdrop-blur') || embeddedLine.includes('liquid-glass-floating'),
    false,
    'Embedded CloseButton must not nest backdrop-filter inside glass modals/panels'
  );
  assert.ok(
    closeBtnSrc.includes('liquid-glass-floating'),
    'Floating CloseButton variant must use .liquid-glass-floating over unblurred media'
  );

  // Verify adoption across all major dialogs, drawers, sheets, and floating cards
  const migratedComponents = [
    'src/components/Profile/UserProfileModal.tsx',
    'src/components/Profile/AccountSecurityModal.tsx',
    'src/components/Common/AboutHeyroqModal.tsx',
    'src/components/Pin/CreatePinModal.tsx',
    'src/components/Pin/PinDetailModal.tsx',
    'src/components/Pin/PinPreviewCard.tsx',
    'src/components/Pin/PinFeedList.tsx',
    'src/components/Auth/AuthModal.tsx',
    'src/components/Auth/ReauthModal.tsx',
    'src/components/Discovery/DiscoverPeopleModal.tsx',
    'src/components/Profile/FollowListModal.tsx',
    'src/components/Profile/AchievementsModal.tsx',
    'src/components/Profile/GeographicClusterDetailCard.tsx',
    'src/components/Report/ReportModal.tsx',
    'src/components/Admin/AdminModal.tsx',
    'src/components/Common/DeleteConfirmationModal.tsx',
    'src/components/Navigation/Navbar.tsx',
    'src/components/Map/HeyroqMap.tsx',
  ];

  for (const relPath of migratedComponents) {
    const src = readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
    assert.ok(
      src.includes('<CloseButton'),
      `${relPath} must use the shared <CloseButton /> component`
    );
  }

  // Verify CreatePinModal preserves unsaved-draft confirmation and DeleteConfirmationModal preserves safe cancel
  const createPinSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Pin/CreatePinModal.tsx'),
    'utf8'
  );
  assert.ok(
    createPinSrc.includes('onClick={handleAttemptClose}'),
    'CreatePinModal CloseButton must preserve unsaved-change protection via handleAttemptClose'
  );

  const deleteConfirmSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Common/DeleteConfirmationModal.tsx'),
    'utf8'
  );
  assert.ok(
    deleteConfirmSrc.includes('onClick={handleCancelClick}'),
    'DeleteConfirmationModal CloseButton must safely invoke handleCancelClick'
  );
});

test('Momo Signature wordmark is configured cleanly with Solaris Orange #E87924, Regular 400, optical padding, and responsive presets', () => {
  assert.equal(BRAND_IDENTITY.wordmarkText, 'heyroq');
  assert.equal(BRAND_IDENTITY.colors.solarisPrimary, '#E87924');
  assert.equal(FONT_FAMILIES.brand, 'Momo Signature');

  const indexCss = readFileSync(path.join(ROOT_DIR, 'src/index.css'), 'utf8');
  assert.ok(indexCss.includes("--font-brand: 'Momo Signature', 'Momo Signature Fallback', cursive;"));
  assert.ok(indexCss.includes("font-family: 'Momo Signature Fallback';"));
  assert.ok(indexCss.includes('font-weight: 400;'));
  assert.ok(indexCss.includes('font-style: normal;'));
  assert.ok(indexCss.includes('font-synthesis: none;'));
  assert.ok(indexCss.includes('text-shadow: none;'));

  const wordmarkSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Common/Wordmark.tsx'),
    'utf8'
  );
  assert.ok(
    wordmarkSrc.includes("nav: 'text-[27px] sm:text-[30px] lg:text-[34px]'"),
    'Wordmark nav preset must use calibrated 27px / 30px / 34px Momo Signature scale'
  );
});

test('Nearby Spots header and empty state follow unified hierarchy with accurate non-pulsing Live status and icon-only CloseButton', () => {
  const pinFeedSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Pin/PinFeedList.tsx'),
    'utf8'
  );
  const appSrc = readFileSync(path.join(ROOT_DIR, 'src/App.tsx'), 'utf8');

  assert.ok(pinFeedSrc.includes('Nearby Spots'));
  assert.ok(
    pinFeedSrc.includes("`${pins.length} ${pins.length === 1 ? 'spot' : 'spots'} in this area`"),
    'Nearby Spots header must render accurate singular/plural viewport spot count'
  );
  assert.ok(
    appSrc.includes('isLive={!isDiscoveryError && searchQuery.trim().length <= 1}'),
    'App.tsx must only pass isLive=true when real-time Firestore discovery listener is active'
  );
  assert.ok(
    pinFeedSrc.includes('id="nearby-spots-live-indicator"') &&
      pinFeedSrc.includes('bg-[var(--brand-primary)]') &&
      !pinFeedSrc.includes('animate-pulse') &&
      !pinFeedSrc.includes('animate-ping'),
    'Nearby Spots Live indicator must use a static Solaris Orange dot with zero blinking/pulse animation'
  );
  assert.ok(
    pinFeedSrc.includes('<CloseButton onClick={onToggle} ariaLabel="Close Nearby Spots" />') &&
      !pinFeedSrc.includes('<span>Close</span>'),
    'Nearby Spots header must use icon-only CloseButton without visible "Close" text'
  );
  assert.ok(
    pinFeedSrc.includes('No spots in this area') &&
      pinFeedSrc.includes('Move the map or explore another location to discover spots.'),
    'Nearby Spots empty state must display concise viewport-specific guidance'
  );
});
