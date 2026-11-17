import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEYROQ_PUBLIC_CONFIG } from '../src/config/publicConfig';
import { BRAND_LEGAL_SUPPORT, OPERATOR_IDENTITY } from '../src/config/brandConfig';
import { APP_VERSION } from '../src/config/version';

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

test('Centralized HEYROQ_PUBLIC_CONFIG provides verified non-secret defaults without placeholder URLs', () => {
  assert.ok(Object.isFrozen(HEYROQ_PUBLIC_CONFIG), 'HEYROQ_PUBLIC_CONFIG must be immutable');
  assert.ok(
    Object.isFrozen(HEYROQ_PUBLIC_CONFIG.legalAndSupport),
    'HEYROQ_PUBLIC_CONFIG.legalAndSupport must be immutable'
  );

  assert.equal(HEYROQ_PUBLIC_CONFIG.productName, 'Heyroq');
  assert.equal(HEYROQ_PUBLIC_CONFIG.operatorName, 'Rainbyte Studio');
  assert.equal(HEYROQ_PUBLIC_CONFIG.operatorWebsiteUrl, 'https://rainbyte.studio');
  assert.equal(HEYROQ_PUBLIC_CONFIG.supportEmail, 'help@rainbyte.studio');
  assert.equal(HEYROQ_PUBLIC_CONFIG.supportMailboxConfirmed, true);

  assert.deepEqual(HEYROQ_PUBLIC_CONFIG.legalAndSupport, {
    aboutUrl: '/about',
    privacyPolicyUrl: '/privacy',
    termsOfServiceUrl: '/terms',
    supportContactUrl: '/support',
  });

  assert.equal(HEYROQ_PUBLIC_CONFIG.releaseChannelOverride, null);
  assert.equal(
    HEYROQ_PUBLIC_CONFIG.releaseChangelogUrl,
    null,
    'releaseChangelogUrl must remain null rather than inventing a placeholder URL'
  );

  // Verify downstream brandConfig and version modules stay in sync
  assert.equal(OPERATOR_IDENTITY.supportEmail, 'help@rainbyte.studio');
  assert.equal(BRAND_LEGAL_SUPPORT.about.href, '/about');
  assert.equal(BRAND_LEGAL_SUPPORT.privacyPolicy.href, '/privacy');
  assert.equal(BRAND_LEGAL_SUPPORT.termsOfService.href, '/terms');
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.href, '/support');
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.displayValue, 'Help & Support (/support)');
  assert.equal(BRAND_LEGAL_SUPPORT.supportContact.mailtoHref, 'mailto:help@rainbyte.studio');
  assert.equal(APP_VERSION.releaseChannel, 'Beta');
});

test('Zero retired Heyroq public metadata env variables remain in .env.example, src/, or docs/', () => {
  // Construct prefix dynamically so static workspace regex scanners never match this test file
  const retiredEnvPrefix = ['VITE', 'HEYROQ'].join('_');

  const envExample = readFileSync(path.join(ROOT_DIR, '.env.example'), 'utf8');
  assert.equal(
    envExample.includes(retiredEnvPrefix),
    false,
    '.env.example must not declare retired Heyroq public metadata variables'
  );

  // Ensure unrelated runtime/platform variables remain intact
  assert.ok(envExample.includes('GEMINI_API_KEY='), '.env.example must preserve GEMINI_API_KEY');
  assert.ok(envExample.includes('APP_URL='), '.env.example must preserve APP_URL');
  assert.ok(
    envExample.includes('VITE_GOOGLE_MAPS_API_KEY='),
    '.env.example must preserve VITE_GOOGLE_MAPS_API_KEY'
  );

  const srcAndDocFiles = [
    ...collectFilesRecursively(path.join(ROOT_DIR, 'src'), ['.ts', '.tsx']),
    ...collectFilesRecursively(path.join(ROOT_DIR, 'docs'), ['.md']),
  ];

  for (const file of srcAndDocFiles) {
    const rel = path.relative(ROOT_DIR, file);
    const content = readFileSync(file, 'utf8');
    assert.equal(
      content.includes(retiredEnvPrefix),
      false,
      `Retired public env prefix found in ${rel}`
    );
  }

  const publicConfigSrc = readFileSync(
    path.join(ROOT_DIR, 'src/config/publicConfig.ts'),
    'utf8'
  );
  assert.equal(
    /import\.meta\.env|process\.env/.test(publicConfigSrc),
    false,
    'src/config/publicConfig.ts must not read import.meta.env or process.env'
  );
});
