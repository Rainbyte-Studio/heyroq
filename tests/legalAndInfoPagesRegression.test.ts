import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ROUTES,
  INFO_PAGE_NAV_ITEMS,
  getDocumentTitleForRoute,
  isInfoPageRoute,
  resolveAppRoute,
} from '../src/utils/appRoutes';
import {
  BRAND_IDENTITY,
  INTERNAL_INFO_ROUTES,
  OPERATOR_IDENTITY,
} from '../src/config/brandConfig';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

test('Route resolver handles direct URLs, trailing slashes, query/hash params, and safe map fallback', () => {
  assert.equal(resolveAppRoute('/about'), '/about');
  assert.equal(resolveAppRoute('/about/'), '/about');
  assert.equal(resolveAppRoute('/ABOUT?from=footer'), '/about');
  assert.equal(resolveAppRoute('/privacy'), '/privacy');
  assert.equal(resolveAppRoute('/privacy#privacy-rights-gdpr'), '/privacy');
  assert.equal(resolveAppRoute('/terms/'), '/terms');
  assert.equal(resolveAppRoute('/support?topic=pins'), '/support');

  // Root and unknown paths fall back safely to map ('/') without breaking refresh
  assert.equal(resolveAppRoute('/'), '/');
  assert.equal(resolveAppRoute(''), '/');
  assert.equal(resolveAppRoute(null), '/');
  assert.equal(resolveAppRoute('/unknown-deep-link'), '/');

  assert.equal(isInfoPageRoute('/about'), true);
  assert.equal(isInfoPageRoute('/privacy'), true);
  assert.equal(isInfoPageRoute('/terms'), true);
  assert.equal(isInfoPageRoute('/support'), true);
  assert.equal(isInfoPageRoute('/'), false);
});

test('Document titles synchronize deterministically across all five Heyroq routes', () => {
  assert.equal(getDocumentTitleForRoute('/'), 'Heyroq');
  assert.equal(getDocumentTitleForRoute('/about'), 'About Heyroq — Heyroq');
  assert.equal(getDocumentTitleForRoute('/privacy'), 'Privacy Policy — Heyroq');
  assert.equal(getDocumentTitleForRoute('/terms'), 'Terms of Service — Heyroq');
  assert.equal(getDocumentTitleForRoute('/support'), 'Help & Support — Heyroq');

  assert.equal(INFO_PAGE_NAV_ITEMS.length, 4);
  assert.deepEqual(
    INFO_PAGE_NAV_ITEMS.map((i) => i.route),
    [APP_ROUTES.about, APP_ROUTES.privacy, APP_ROUTES.terms, APP_ROUTES.support]
  );
  assert.deepEqual(INTERNAL_INFO_ROUTES, {
    about: '/about',
    privacyPolicy: '/privacy',
    termsOfService: '/terms',
    helpAndSupport: '/support',
  });
});

test('Confirmed Rainbyte Studio operator identity and Heyroq brand attribution are consistent', () => {
  assert.equal(BRAND_IDENTITY.productName, 'Heyroq');
  assert.equal(BRAND_IDENTITY.wordmarkText, 'heyroq');
  assert.equal(
    BRAND_IDENTITY.brandAttribution,
    'Heyroq — A social discovery platform by Rainbyte Studio.'
  );
  assert.equal(OPERATOR_IDENTITY.name, 'Rainbyte Studio');
  assert.equal(OPERATOR_IDENTITY.websiteUrl, 'https://rainbyte.studio');
  assert.equal(
    OPERATOR_IDENTITY.brandRelationship,
    'Heyroq is an independent product operated by Rainbyte Studio.'
  );
  assert.equal(OPERATOR_IDENTITY.proposedSupportEmail, 'help@rainbyte.studio');
});

test('All four informational & legal pages exist, provide Back to Map, and never invent unverified legal facts', () => {
  const layoutSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Legal/InfoPageLayout.tsx'),
    'utf8'
  );
  const aboutSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Legal/AboutPage.tsx'),
    'utf8'
  );
  const privacySrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Legal/PrivacyPolicyPage.tsx'),
    'utf8'
  );
  const termsSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Legal/TermsOfServicePage.tsx'),
    'utf8'
  );
  const supportSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Legal/HelpSupportPage.tsx'),
    'utf8'
  );

  // Shared header, keyboard skip link, Back to Map, and footer attribution
  assert.ok(layoutSrc.includes('Skip to main content'));
  assert.ok(layoutSrc.includes('Back to Map'));
  assert.ok(layoutSrc.includes('aria-current={isCurrent ? \'page\' : undefined}'));
  assert.ok(layoutSrc.includes('BRAND_IDENTITY.brandAttribution'));

  // About page uses centralized APP_VERSION and links to /privacy, /terms, and /support
  assert.ok(aboutSrc.includes('APP_VERSION.version'));
  assert.ok(aboutSrc.includes('APP_VERSION.releaseChannel'));
  assert.ok(aboutSrc.includes('to="/privacy"'));
  assert.ok(aboutSrc.includes('to="/terms"'));
  assert.ok(aboutSrc.includes('to="/support"'));

  // Privacy Policy covers verified Firebase/Google Maps details and explicitly marks items requiring confirmation
  assert.ok(privacySrc.includes('Firebase Authentication'));
  assert.ok(privacySrc.includes('Google Maps Platform'));
  assert.ok(privacySrc.includes('europe-west2'));
  assert.ok(privacySrc.includes('[Requires Confirmation'));
  assert.ok(privacySrc.includes('GDPR'));

  // Terms of Service covers verified ReportModal/AdminModal moderation and marks legal review items
  assert.ok(termsSrc.includes('Moderation & Reporting'));
  assert.ok(termsSrc.includes('[Requires Legal Review'));
  assert.ok(termsSrc.includes('to="/privacy"'));

  // Help & Support covers FAQs, login, pins, likes/comments/follows, deletion, troubleshooting, and active help@rainbyte.studio without SLA promises
  assert.ok(supportSrc.includes('Frequently Asked Questions'));
  assert.ok(supportSrc.includes('id="support-page-mailto-link"'));
  assert.ok(supportSrc.includes('supportResource.mailtoHref'));
  assert.equal(
    /within\s+\d+\s*(hours|business days)/i.test(supportSrc),
    false,
    'Help & Support must not invent or promise support response times'
  );
});

test('Navigation integrations wire AuthModal, AboutHeyroqModal, Navbar, UserProfileModal, and App.tsx without requiring auth', () => {
  const appSrc = readFileSync(path.join(ROOT_DIR, 'src/App.tsx'), 'utf8');
  const authModalSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Auth/AuthModal.tsx'),
    'utf8'
  );
  const aboutModalSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Common/AboutHeyroqModal.tsx'),
    'utf8'
  );
  const navbarSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Navigation/Navbar.tsx'),
    'utf8'
  );
  const profileSrc = readFileSync(
    path.join(ROOT_DIR, 'src/components/Profile/UserProfileModal.tsx'),
    'utf8'
  );

  // AppRouterSwitch renders /about, /privacy, /terms, /support directly without gating on user login
  assert.ok(appSrc.includes("case '/about':"));
  assert.ok(appSrc.includes("case '/privacy':"));
  assert.ok(appSrc.includes("case '/terms':"));
  assert.ok(appSrc.includes("case '/support':"));

  // AuthModal links to Terms of Service and Privacy Policy
  assert.ok(authModalSrc.includes('id="auth-terms-link"'));
  assert.ok(authModalSrc.includes('to="/terms"'));
  assert.ok(authModalSrc.includes('id="auth-privacy-link"'));
  assert.ok(authModalSrc.includes('to="/privacy"'));

  // AboutHeyroqModal links to all four pages
  assert.ok(aboutModalSrc.includes('about-heyroq'));
  assert.ok(aboutModalSrc.includes('privacy-policy'));
  assert.ok(aboutModalSrc.includes('terms-of-service'));
  assert.ok(aboutModalSrc.includes('support-contact'));

  // Navbar and UserProfileModal include direct links & operator attribution
  assert.ok(navbarSrc.includes('id="menu-help-support-link"'));
  assert.ok(profileSrc.includes('to="/about"'));
  assert.ok(profileSrc.includes('to="/privacy"'));
  assert.ok(profileSrc.includes('to="/terms"'));
  assert.ok(profileSrc.includes('to="/support"'));
  assert.ok(profileSrc.includes('OPERATOR_IDENTITY.name'));
});
