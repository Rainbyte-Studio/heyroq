import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_VERSION,
  createAppVersionConfig,
  deriveReleaseChannel,
  formatBuildIdentifier,
  normalizeBuildDate,
  parseSemVer,
  sanitizeGitSha,
} from '../src/config/version';
import {
  BRAND_IDENTITY,
  BRAND_LEGAL_SUPPORT,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  TYPOGRAPHY_TOKENS,
  resolveLegalAndSupportConfig,
} from '../src/config/brandConfig';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

function collectFilesRecursively(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectFilesRecursively(fullPath, extensions));
    } else if (extensions.some((ext) => fullPath.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

test('Root package.json defines canonical Heyroq identity and initial SemVer 0.1.0-beta.1', () => {
  const pkgRaw = readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw) as { name: string; version: string };

  assert.equal(pkg.name, 'heyroq');
  assert.equal(pkg.version, '0.1.0-beta.1');

  assert.equal(APP_VERSION.productName, 'Heyroq');
  assert.equal(APP_VERSION.packageName, 'heyroq');
  assert.equal(APP_VERSION.version, pkg.version);
  assert.equal(APP_VERSION.displayVersion, 'v0.1.0-beta.1');
  assert.equal(APP_VERSION.releaseChannel, 'Beta');
  assert.ok(Object.isFrozen(APP_VERSION), 'APP_VERSION must be immutable');
});

test('parseSemVer parses valid SemVer 2.0.0 versions and rejects malformed strings', () => {
  const beta = parseSemVer('0.1.0-beta.1');
  assert.equal(beta.major, 0);
  assert.equal(beta.minor, 1);
  assert.equal(beta.patch, 0);
  assert.deepEqual(beta.prerelease, ['beta', '1']);
  assert.deepEqual(beta.buildMetadata, []);

  const rcWithBuild = parseSemVer('v1.2.3-rc.2+20261117.a1b2c3d');
  assert.equal(rcWithBuild.raw, '1.2.3-rc.2+20261117.a1b2c3d');
  assert.equal(rcWithBuild.major, 1);
  assert.equal(rcWithBuild.minor, 2);
  assert.equal(rcWithBuild.patch, 3);
  assert.deepEqual(rcWithBuild.prerelease, ['rc', '2']);
  assert.deepEqual(rcWithBuild.buildMetadata, ['20261117', 'a1b2c3d']);

  assert.throws(() => parseSemVer('1.0'), /Invalid Semantic Version/);
  assert.throws(() => parseSemVer('01.1.0'), /Invalid Semantic Version/);
  assert.throws(() => parseSemVer('not-a-version'), /Invalid Semantic Version/);
});

test('deriveReleaseChannel maps pre-release tags, major 0 versions, and explicit overrides accurately', () => {
  assert.equal(deriveReleaseChannel(parseSemVer('0.1.0-alpha.1')), 'Alpha');
  assert.equal(deriveReleaseChannel(parseSemVer('0.1.0-beta.1')), 'Beta');
  assert.equal(deriveReleaseChannel(parseSemVer('1.0.0-rc.1')), 'RC');
  assert.equal(deriveReleaseChannel(parseSemVer('1.0.0')), 'Stable');
  assert.equal(deriveReleaseChannel(parseSemVer('0.4.2')), 'Beta');
  assert.equal(deriveReleaseChannel(parseSemVer('1.0.0'), 'beta'), 'Beta');
  assert.equal(deriveReleaseChannel(parseSemVer('0.1.0-beta.1'), 'rc'), 'RC');
});

test('createAppVersionConfig works cleanly both WITH and WITHOUT Git or build-date metadata', () => {
  // Case 1: Full CI/Git metadata available
  const withGit = createAppVersionConfig({
    packageName: 'heyroq',
    version: '0.1.0-beta.1',
    buildDate: '2026-11-17T10:00:00.000Z',
    gitCommitSha: 'A1B2C3D4E5F60718',
  });

  assert.equal(withGit.gitCommitSha, 'a1b2c3d');
  assert.equal(withGit.buildDateShort, '2026-11-17');
  assert.equal(withGit.buildId, '0.1.0-beta.1+20261117.a1b2c3d');

  // Case 2: Git metadata unavailable (e.g., AI Studio container or tarball build)
  const withoutGit = createAppVersionConfig({
    packageName: 'heyroq',
    version: '0.1.0-beta.1',
    buildDate: '2026-11-17T10:00:00.000Z',
    gitCommitSha: null,
  });

  assert.equal(withoutGit.gitCommitSha, null);
  assert.equal(withoutGit.buildId, '0.1.0-beta.1+20261117');

  // Case 3: Neither Git nor buildDate available
  const localFallback = createAppVersionConfig({
    packageName: 'heyroq',
    version: '0.1.0-beta.1',
    buildDate: null,
    gitCommitSha: 'not-a-valid-hex-sha!;SECRET=123',
  });

  assert.equal(localFallback.gitCommitSha, null);
  assert.equal(localFallback.buildDate, null);
  assert.equal(localFallback.buildId, '0.1.0-beta.1+local');
});

test('Sanitizers reject non-hex Git SHAs and invalid dates to prevent secret or command-output leakage', () => {
  assert.equal(sanitizeGitSha('deadbeef123456'), 'deadbee');
  assert.equal(sanitizeGitSha('AIzaSyFakeKey123456789'), null);
  assert.equal(sanitizeGitSha('fatal: not a git repository'), null);
  assert.equal(sanitizeGitSha(undefined), null);

  assert.deepEqual(normalizeBuildDate('invalid-date'), {
    iso: null,
    shortDate: null,
    compactDate: null,
  });

  assert.equal(formatBuildIdentifier('0.1.0-beta.1', null, null), '0.1.0-beta.1+local');
});

test('vite.config.ts never injects process.env or API secrets into client defines', () => {
  const viteConfigSource = readFileSync(path.join(ROOT_DIR, 'vite.config.ts'), 'utf8');

  assert.ok(viteConfigSource.includes('__HEYROQ_PACKAGE_NAME__'));
  assert.ok(viteConfigSource.includes('__HEYROQ_APP_VERSION__'));
  assert.ok(viteConfigSource.includes('__HEYROQ_BUILD_DATE__'));
  assert.ok(viteConfigSource.includes('__HEYROQ_GIT_COMMIT_SHA__'));
  assert.equal(
    viteConfigSource.includes('GEMINI_API_KEY'),
    false,
    'vite.config.ts must not expose GEMINI_API_KEY to client defines'
  );
  assert.equal(
    /define\s*:\s*\{[^}]*process\.env/s.test(viteConfigSource),
    false,
    'vite.config.ts must not serialize process.env into client bundle'
  );
});

test('Legal & Support config uses verified internal routes and confirmed operational help@rainbyte.studio mailbox by default, while honoring explicit overrides', () => {
  // Default runtime state uses verified internal routes (/about, /privacy, /terms, /support) and confirmed operational mailbox
  assert.equal(BRAND_LEGAL_SUPPORT.about.status, 'verified');
  assert.equal(BRAND_LEGAL_SUPPORT.about.href, '/about');
  assert.equal(BRAND_LEGAL_SUPPORT.privacyPolicy.status, 'verified');
  assert.equal(BRAND_LEGAL_SUPPORT.privacyPolicy.href, '/privacy');
  assert.equal(BRAND_LEGAL_SUPPORT.privacyPolicy.isInternalRoute, true);
  assert.equal(BRAND_LEGAL_SUPPORT.termsOfService.status, 'verified');
  assert.equal(BRAND_LEGAL_SUPPORT.termsOfService.href, '/terms');
  assert.equal(BRAND_LEGAL_SUPPORT.termsOfService.isInternalRoute, true);
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.status, 'verified');
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.href, '/support');
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.proposedEmail, 'help@rainbyte.studio');
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.mailboxOperationalConfirmed, true);
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.mailtoHref, 'mailto:help@rainbyte.studio');

  // Explicit opt-out override disables mailtoHref when supportMailboxConfirmed is false
  const optedOutMailbox = resolveLegalAndSupportConfig({
    supportMailboxConfirmed: false,
  });
  assert.equal(optedOutMailbox.supportContact.mailboxOperationalConfirmed, false);
  assert.equal(optedOutMailbox.supportContact.mailtoHref, null);

  // When internal defaults are disabled and no URLs provided, marks as pending_review with null hrefs
  const unconfiguredExternalOnly = resolveLegalAndSupportConfig({
    useInternalRoutesDefault: false,
  });
  assert.equal(unconfiguredExternalOnly.privacyPolicy.status, 'pending_review');
  assert.equal(unconfiguredExternalOnly.privacyPolicy.href, null);
  assert.equal(unconfiguredExternalOnly.termsOfService.status, 'pending_review');
  assert.equal(unconfiguredExternalOnly.termsOfService.href, null);
  assert.equal(unconfiguredExternalOnly.supportContact.status, 'pending_review');
  assert.equal(unconfiguredExternalOnly.supportContact.href, null);

  // Rejects insecure http:// URLs, javascript: URIs, and malformed emails
  const invalidInputs = resolveLegalAndSupportConfig({
    privacyPolicyUrl: 'http://insecure.example.com/privacy',
    termsOfServiceUrl: 'javascript:alert(1)',
    supportContact: 'not-an-email',
  });
  assert.equal(invalidInputs.privacyPolicy.status, 'pending_review');
  assert.equal(invalidInputs.privacyPolicy.href, null);
  assert.equal(invalidInputs.termsOfService.status, 'pending_review');
  assert.equal(invalidInputs.termsOfService.href, null);
  assert.equal(invalidInputs.supportContact.status, 'pending_review');
  assert.equal(invalidInputs.supportContact.href, null);

  // Accepts verified https:// URLs and confirmed operational mailbox
  const verified = resolveLegalAndSupportConfig({
    privacyPolicyUrl: 'https://rainbyte.studio/privacy',
    termsOfServiceUrl: 'https://rainbyte.studio/terms',
    supportContact: 'help@rainbyte.studio',
    supportMailboxConfirmed: true,
  });
  assert.equal(verified.privacyPolicy.status, 'verified');
  assert.equal(verified.privacyPolicy.href, 'https://rainbyte.studio/privacy');
  assert.equal(verified.termsOfService.status, 'verified');
  assert.equal(verified.termsOfService.href, 'https://rainbyte.studio/terms');
  assert.equal(verified.supportContact.status, 'verified');
  assert.equal(verified.supportContact.href, 'mailto:help@rainbyte.studio');
  assert.equal(verified.supportContact.mailboxOperationalConfirmed, true);
  assert.equal(verified.supportContact.mailtoHref, 'mailto:help@rainbyte.studio');
});

test('MINI Solaris Orange Metallic brand palette, 3+1 typography system, Wordmark component, and zero legacy coral or period wordmark remain', () => {
  assert.equal(BRAND_IDENTITY.productName, 'Heyroq');
  assert.equal(BRAND_IDENTITY.wordmarkText, 'heyroq');
  assert.equal(BRAND_IDENTITY.colors.solarisPrimary, '#E87924');
  assert.equal(BRAND_IDENTITY.colors.solarisHighlight, '#FF9B43');
  assert.equal(BRAND_IDENTITY.colors.solarisDeep, '#B95318');

  assert.deepEqual(FONT_FAMILIES, {
    brand: 'Momo Signature',
    heading: 'Space Grotesk',
    body: 'Manrope',
    mono: 'JetBrains Mono',
  });

  assert.deepEqual(FONT_WEIGHTS, {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  });

  const indexHtml = readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(
    indexHtml.includes('family=Momo+Signature'),
    'index.html must load Momo Signature 400 for the heyroq wordmark'
  );
  assert.equal(
    indexHtml.includes('Pacifico'),
    false,
    'index.html must not load retired Pacifico font'
  );
  assert.ok(
    indexHtml.includes('family=Space+Grotesk:wght@500;600;700'),
    'index.html must load Space Grotesk weights 500, 600, 700'
  );
  assert.ok(
    indexHtml.includes('family=Manrope:wght@400;500;600;700'),
    'index.html must load Manrope weights 400, 500, 600, 700'
  );
  assert.ok(
    indexHtml.includes('family=JetBrains+Mono:wght@400;500'),
    'index.html must load JetBrains Mono weights 400, 500'
  );
  assert.equal(
    indexHtml.includes('Plus+Jakarta+Sans'),
    false,
    'index.html must not load retired Plus Jakarta Sans'
  );
  assert.ok(indexHtml.includes('display=swap'), 'Google Fonts must use display=swap');

  const cssSource = readFileSync(path.join(ROOT_DIR, 'src/index.css'), 'utf8');
  assert.ok(cssSource.includes('--brand-primary: #E87924'));
  assert.ok(cssSource.includes('--brand-highlight: #FF9B43'));
  assert.ok(cssSource.includes('--brand-deep: #B95318'));
  assert.ok(cssSource.includes("font-family: 'Manrope Fallback'"));
  assert.ok(cssSource.includes("font-family: 'Space Grotesk Fallback'"));
  assert.ok(cssSource.includes('ascent-override:'));
  assert.ok(cssSource.includes('[data-theme="light"]'));

  const wordmarkSource = readFileSync(
    path.join(ROOT_DIR, 'src/components/Common/Wordmark.tsx'),
    'utf8'
  );
  assert.ok(wordmarkSource.includes('BRAND_IDENTITY.wordmarkText'));
  assert.ok(wordmarkSource.includes('heyroq-wordmark'));

  for (const tokenClass of Object.values(TYPOGRAPHY_TOKENS)) {
    assert.ok(
      cssSource.includes(`.${tokenClass}`),
      `src/index.css must define reusable typography token class .${tokenClass}`
    );
  }

  // Ensure zero legacy coral #FF5F40 or deprecated 'heyroq.' wordmark remain anywhere in src/
  const allSrcFiles = collectFilesRecursively(path.join(ROOT_DIR, 'src'), ['.ts', '.tsx', '.css']);
  for (const file of allSrcFiles) {
    const content = readFileSync(file, 'utf8');
    assert.equal(
      /#ff5f40/i.test(content),
      false,
      `Legacy coral #FF5F40 found in ${path.relative(ROOT_DIR, file)}`
    );
    assert.equal(
      content.includes('heyroq.'),
      false,
      `Deprecated trailing-period wordmark 'heyroq.' found in ${path.relative(ROOT_DIR, file)}`
    );
    assert.equal(
      content.includes('Pacifico'),
      false,
      `Retired Pacifico font reference found in ${path.relative(ROOT_DIR, file)}`
    );
  }
});

test('No hardcoded stale UI version strings remain in src/ and About screen is wired cleanly', () => {
  const srcFiles = collectFilesRecursively(path.join(ROOT_DIR, 'src'), ['.ts', '.tsx']);
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    assert.equal(
      content.includes('v1.0.4'),
      false,
      `Stale hardcoded version string v1.0.4 found in ${path.relative(ROOT_DIR, file)}`
    );
  }

  const appSource = readFileSync(path.join(ROOT_DIR, 'src/App.tsx'), 'utf8');
  const navbarSource = readFileSync(path.join(ROOT_DIR, 'src/components/Navigation/Navbar.tsx'), 'utf8');
  const profileSource = readFileSync(path.join(ROOT_DIR, 'src/components/Profile/UserProfileModal.tsx'), 'utf8');

  assert.ok(appSource.includes('<AboutHeyroqModal'));
  assert.ok(navbarSource.includes('menu-about-heyroq-btn'));
  assert.ok(profileSource.includes('profile-about-heyroq-btn'));
  assert.ok(profileSource.includes('profile-footer-about-btn'));
});
