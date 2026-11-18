import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HEYROQ_THEME_STORAGE_KEY,
  THEME_COLOR_TOKENS,
  applyResolvedThemeToRoot,
  getSystemPrefersDark,
  isValidThemePreference,
  persistThemePreference,
  readStoredThemePreference,
  resolveThemePreference,
} from '../src/context/ThemeContext';
import { BRAND_LEGAL_SUPPORT, OPERATOR_IDENTITY } from '../src/config/brandConfig';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

test('Theme preference validation and resolution keep explicit preference separate from resolved appearance', () => {
  assert.equal(isValidThemePreference('light'), true);
  assert.equal(isValidThemePreference('dark'), true);
  assert.equal(isValidThemePreference('system'), true);
  assert.equal(isValidThemePreference('auto'), false);
  assert.equal(isValidThemePreference(null), false);
  assert.equal(isValidThemePreference(undefined), false);

  // Explicit Light or Dark overrides OS preference
  assert.equal(resolveThemePreference('light', true), 'light');
  assert.equal(resolveThemePreference('light', false), 'light');
  assert.equal(resolveThemePreference('dark', false), 'dark');
  assert.equal(resolveThemePreference('dark', true), 'dark');

  // System preference follows live OS prefers-color-scheme
  assert.equal(resolveThemePreference('system', true), 'dark');
  assert.equal(resolveThemePreference('system', false), 'light');
});

test('Theme storage helpers default to system, persist round-trip, and degrade safely when localStorage throws', () => {
  assert.equal(readStoredThemePreference(null), 'system');

  const backing = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
  };

  assert.equal(readStoredThemePreference(mockStorage), 'system');

  assert.equal(persistThemePreference('light', mockStorage), true);
  assert.equal(backing.get(HEYROQ_THEME_STORAGE_KEY), 'light');
  assert.equal(readStoredThemePreference(mockStorage), 'light');

  assert.equal(persistThemePreference('dark', mockStorage), true);
  assert.equal(readStoredThemePreference(mockStorage), 'dark');

  // Invalid stored string safely falls back to 'system'
  backing.set(HEYROQ_THEME_STORAGE_KEY, 'corrupted-value');
  assert.equal(readStoredThemePreference(mockStorage), 'system');

  // Restricted iframe / private browsing storage exception safety
  const throwingStorage = {
    getItem: () => {
      throw new Error('SecurityError: Access is denied');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(readStoredThemePreference(throwingStorage), 'system');
  assert.equal(persistThemePreference('dark', throwingStorage), false);
});

test('getSystemPrefersDark queries matchMedia safely and handles unavailable matchMedia gracefully', () => {
  assert.equal(
    getSystemPrefersDark((query) => ({
      matches: query === '(prefers-color-scheme: dark)',
    } as MediaQueryList)),
    true
  );

  assert.equal(
    getSystemPrefersDark(() => ({ matches: false } as MediaQueryList)),
    false
  );

  assert.equal(
    getSystemPrefersDark(() => {
      throw new Error('matchMedia unsupported');
    }),
    true
  );
});

test('applyResolvedThemeToRoot synchronizes .dark/.light classes, dataset attributes, and colorScheme', () => {
  const activeClasses = new Set<string>();
  const mockRoot = {
    classList: {
      toggle: (cls: string, force?: boolean) => {
        if (force) activeClasses.add(cls);
        else activeClasses.delete(cls);
        return Boolean(force);
      },
    },
    dataset: {} as Record<string, string>,
    style: { colorScheme: '' },
  } as unknown as HTMLElement;

  applyResolvedThemeToRoot(mockRoot, 'light', 'system');
  assert.equal(activeClasses.has('light'), true);
  assert.equal(activeClasses.has('dark'), false);
  assert.equal(mockRoot.dataset.theme, 'light');
  assert.equal(mockRoot.dataset.themePreference, 'system');
  assert.equal(mockRoot.style.colorScheme, 'light');

  applyResolvedThemeToRoot(mockRoot, 'dark', 'dark');
  assert.equal(activeClasses.has('dark'), true);
  assert.equal(activeClasses.has('light'), false);
  assert.equal(mockRoot.dataset.theme, 'dark');
  assert.equal(mockRoot.dataset.themePreference, 'dark');
  assert.equal(mockRoot.style.colorScheme, 'dark');

  assert.equal(THEME_COLOR_TOKENS.light, '#FAF9F6');
  assert.equal(THEME_COLOR_TOKENS.dark, '#17181B');
});

test('index.html contains flash-free pre-paint theme initialization and src/index.css defines Liquid Glass & accessibility tokens', () => {
  const indexHtml = readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(
    indexHtml.includes(HEYROQ_THEME_STORAGE_KEY),
    'index.html must read canonical theme storage key before first paint to prevent FOUC'
  );
  assert.ok(indexHtml.includes('prefers-color-scheme: dark'));
  assert.ok(indexHtml.includes('meta name="color-scheme" content="light dark"'));

  const indexCss = readFileSync(path.join(ROOT_DIR, 'src/index.css'), 'utf8');
  assert.ok(
    indexCss.includes('@custom-variant dark (&:where(.dark, .dark *));'),
    'src/index.css must declare Tailwind v4 @custom-variant dark below @import "tailwindcss";'
  );
  assert.ok(indexCss.includes('--glass-nav-bg:'));
  assert.ok(indexCss.includes('--glass-sidebar-bg:'));
  assert.ok(indexCss.includes('--glass-floating-bg:'));
  assert.ok(indexCss.includes('--glass-nav-blur: 24px'));
  assert.ok(indexCss.includes('--glass-sidebar-blur: 18px'));
  assert.ok(indexCss.includes('--glass-floating-blur: 14px'));
  assert.ok(indexCss.includes('--glass-saturation: 140%'));
  assert.ok(indexCss.includes('--glass-border:'));
  assert.ok(indexCss.includes('--glass-shadow:'));
  assert.ok(indexCss.includes('.liquid-glass-nav'));
  assert.ok(indexCss.includes('.liquid-glass-subbar'));
  assert.ok(indexCss.includes('.liquid-glass-panel'));
  assert.ok(indexCss.includes('.liquid-glass-modal'));
  assert.ok(indexCss.includes('.liquid-glass-popover'));
  assert.ok(indexCss.includes('.liquid-glass-card'));
  assert.ok(indexCss.includes('.heyroq-btn-primary'));
  assert.ok(
    indexCss.includes('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))'),
    'src/index.css must provide opaque fallback when backdrop-filter is unsupported'
  );
  assert.ok(indexCss.includes('prefers-reduced-transparency: reduce'));
  assert.ok(indexCss.includes('prefers-reduced-motion: reduce'));
  assert.ok(indexCss.includes('forced-colors: active'));

  const pinFeedSrc = readFileSync(path.join(ROOT_DIR, 'src/components/Pin/PinFeedList.tsx'), 'utf8');
  assert.ok(
    pinFeedSrc.includes('No spots in this area'),
    'Nearby Spots empty state must be viewport-specific and never imply zero global spots'
  );

  // Ensure no global !important theme-inversion hacks exist
  assert.equal(
    /\.light(-mode)?\s+\.(bg|text)-[^\s{]+[^{]*\{[^}]*!important/i.test(indexCss),
    false,
    'src/index.css must not use brittle !important theme inversion hacks'
  );
});

test('Appearance selector is accessible both without authentication and inside authenticated menus/profile', () => {
  const appSrc = readFileSync(path.join(ROOT_DIR, 'src/App.tsx'), 'utf8');
  const navbarSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Navigation/Navbar.tsx'),
    'utf8'
  );
  const infoLayoutSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Legal/InfoPageLayout.tsx'),
    'utf8'
  );
  const profileSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Profile/UserProfileModal.tsx'),
    'utf8'
  );
  const themeSelectorSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Common/ThemeSelector.tsx'),
    'utf8'
  );

  assert.ok(appSrc.includes('<ThemeProvider>'));
  assert.ok(themeSelectorSrc.includes('role="radiogroup"'));
  assert.ok(themeSelectorSrc.includes('role="radio"'));

  // Unauthenticated access in main Navbar & informational pages
  assert.ok(navbarSrc.includes('id="nav-appearance-btn"'));
  assert.ok(infoLayoutSrc.includes('id="info-header-appearance-btn"'));
  assert.ok(infoLayoutSrc.includes('idPrefix="info-footer-theme"'));

  // Authenticated access in user dropdown menu & own profile modal
  assert.ok(navbarSrc.includes('idPrefix="menu-theme"'));
  assert.ok(profileSrc.includes('idPrefix="profile-theme"'));
});

test('HeyroqMap and FootprintMap synchronize Google Maps ColorScheme with resolvedTheme and set required GMP usage attribution', () => {
  const heyroqMapSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Map/HeyroqMap.tsx'),
    'utf8'
  );
  const footprintMapSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Profile/FootprintMap.tsx'),
    'utf8'
  );

  for (const [name, src] of [
    ['HeyroqMap.tsx', heyroqMapSrc],
    ['FootprintMap.tsx', footprintMapSrc],
  ] as const) {
    assert.ok(
      src.includes('ColorScheme.DARK') && src.includes('ColorScheme.LIGHT'),
      `${name} must synchronize Google Maps ColorScheme with Light/Dark resolvedTheme`
    );
    assert.ok(
      src.includes('reuseMaps={true}'),
      `${name} must enable reuseMaps={true}`
    );
    assert.ok(
      src.includes("internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}"),
      `${name} must include mandatory gmp_mcp_codeassist_v1_aistudio attribution ID`
    );
  }
});

test('AboutHeyroqModal keeps technical diagnostics collapsed by default and exposes confirmed operational help@rainbyte.studio', () => {
  const aboutModalSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Common/AboutHeyroqModal.tsx'),
    'utf8'
  );

  // Collapsed by default technical disclosure
  assert.ok(aboutModalSrc.includes('const [isTechnicalOpen, setIsTechnicalOpen] = useState(false)'));
  assert.ok(aboutModalSrc.includes('id="about-technical-info-toggle"'));
  assert.ok(aboutModalSrc.includes('aria-expanded={isTechnicalOpen}'));
  assert.ok(aboutModalSrc.includes('Technical Information'));
  assert.ok(aboutModalSrc.includes('{isTechnicalOpen && ('));

  // Active operational support contact across config & surfaces
  assert.equal(OPERATOR_IDENTITY.supportEmail, 'help@rainbyte.studio');
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.mailboxOperationalConfirmed, true);
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.mailtoHref, 'mailto:help@rainbyte.studio');
  assert.ok(aboutModalSrc.includes('id="about-support-mailto-link"'));
});
