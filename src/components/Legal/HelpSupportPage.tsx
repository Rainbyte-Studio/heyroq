import React, { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Mail } from 'lucide-react';
import {
  BRAND_LEGAL_SUPPORT,
  OPERATOR_IDENTITY,
  TYPOGRAPHY_TOKENS,
} from '../../config/brandConfig';
import { APP_VERSION } from '../../config/version';
import { AppLink } from '../../utils/appRoutes';
import { InfoPageLayout, PageTocItem } from './InfoPageLayout';

type SupportCategory =
  | 'all'
  | 'account'
  | 'pins'
  | 'social'
  | 'privacy'
  | 'troubleshooting';

interface FaqEntry {
  readonly id: string;
  readonly category: Exclude<SupportCategory, 'all'>;
  readonly question: string;
  readonly answer: string;
}

const SUPPORT_TOC: ReadonlyArray<PageTocItem> = [
  { id: 'support-faq', label: 'Frequently Asked Questions' },
  { id: 'support-account-login', label: 'Account & Login Assistance' },
  { id: 'support-pins-guide', label: 'Creating & Managing Pins' },
  { id: 'support-social-progression', label: 'Likes, Comments, Follows & XP' },
  { id: 'support-privacy-deletion', label: 'Privacy & Account Deletion' },
  { id: 'support-troubleshooting', label: 'Troubleshooting' },
  { id: 'support-contact', label: 'Support Contact Information' },
];

const FAQ_ITEMS: ReadonlyArray<FaqEntry> = [
  {
    id: 'faq-browse-without-account',
    category: 'account',
    question: 'Do I need an account to explore the Heyroq map?',
    answer:
      'No. Anyone can pan the map, filter categories, switch between Recent, Popular, and Trending discovery views, search places, switch Light, Dark, or System appearance, and read public pins without signing in. An account is required when you want to drop pins, upload photos, like spots, post comments, follow explorers, or report content.',
  },
  {
    id: 'faq-google-popup-blocked',
    category: 'account',
    question: 'Why did Continue with Google not complete my sign-in?',
    answer:
      'Google Sign-In opens a secure browser authentication popup. If your browser blocks popups or if the popup window is closed before completion, authentication stops. Allow popups for Heyroq in your browser address bar or sign in using Email and Password instead.',
  },
  {
    id: 'faq-drop-pin-location',
    category: 'pins',
    question: 'How do I choose an exact location when creating a pin?',
    answer:
      'Open Drop Pin (+), then either search for a venue, landmark, or neighborhood using the Google Places search field, or select Pick on Map to tap the exact coordinate directly on the map canvas. Heyroq automatically formats a clean neighborhood/city label when available.',
  },
  {
    id: 'faq-hide-vs-close',
    category: 'pins',
    question: 'What is the difference between HIDE/SHOW on the map and CLOSE on Nearby Spots?',
    answer:
      'HIDE / SHOW toggles the visual display of Heyroq pin markers on the map canvas so you can inspect underlying streets and terrain cleanly without closing your discovery list. CLOSE dismisses the Nearby Spots side panel.',
  },
  {
    id: 'faq-photo-upload-limits',
    category: 'pins',
    question: 'Which photo formats and file sizes are supported?',
    answer:
      'Heyroq supports JPEG, PNG, WebP, GIF, HEIC, and AVIF images up to 10 MB per file for both pin photos and profile avatars.',
  },
  {
    id: 'faq-progression-delete-pin',
    category: 'social',
    question: 'Will deleting an old pin reduce my Explorer Level or unlocked badges?',
    answer:
      'No. Your active pin count updates to reflect currently published pins, while historical lifetime XP, Explorer Level, and previously unlocked achievements are preserved.',
  },
  {
    id: 'faq-email-visibility',
    category: 'privacy',
    question: 'Is my email address visible on my public Heyroq profile?',
    answer:
      'No. Heyroq strips email addresses from public Firestore user documents and enforces rules preventing email fields from being written to public profiles. Only your display name, username, avatar, bio, and public activity are shown.',
  },
  {
    id: 'faq-map-geolocation',
    category: 'troubleshooting',
    question: 'Why can Heyroq not center on my current location?',
    answer:
      'Browser geolocation only runs when you click the locate button and grant location permission to your browser. Check your browser site permissions and operating system Location Services if centering fails.',
  },
];

const CATEGORY_FILTERS: ReadonlyArray<{ id: SupportCategory; label: string }> = [
  { id: 'all', label: 'All Topics' },
  { id: 'account', label: 'Account & Login' },
  { id: 'pins', label: 'Pins & Photos' },
  { id: 'social', label: 'Likes, Follows & XP' },
  { id: 'privacy', label: 'Privacy & Deletion' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
];

export const HelpSupportPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory>('all');
  const supportResource = BRAND_LEGAL_SUPPORT.supportContact;

  const filteredFaqs = useMemo(() => {
    if (selectedCategory === 'all') return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <InfoPageLayout
      activeRoute="/support"
      kicker="Help Center & Platform Guidance"
      title="Help & Support"
      lead="Practical guidance for signing in, curating map pins, managing your profile and privacy, troubleshooting common browser issues, and reaching Rainbyte Studio."
      metaItems={[
        'Operated by Rainbyte Studio',
        `App Version ${APP_VERSION.displayVersion} (${APP_VERSION.releaseChannel})`,
      ]}
      tocItems={SUPPORT_TOC}
    >
      <div className="space-y-12">
        {/* 1. Frequently Asked Questions with Interactive Filter */}
        <section id="support-faq" tabIndex={-1} className="scroll-mt-24 space-y-5 focus:outline-none">
          <div>
            <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
              01. Frequently Asked Questions
            </h2>
            <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-muted)] mt-1.5`}>
              Filter common questions by topic or expand any item below.
            </p>
          </div>

          {/* Interactive Segmented Filter Buttons */}
          <div
            role="group"
            aria-label="Filter FAQ topics"
            className="liquid-glass-segmented flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl"
          >
            {CATEGORY_FILTERS.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={active}
                  className={`${TYPOGRAPHY_TOKENS.buttonSmall} min-h-[38px] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer heyroq-focus-ring ${
                    active
                      ? 'heyroq-btn-primary text-white'
                      : 'text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.04] dark:hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-[var(--heyroq-border-subtle)] border-y border-[var(--heyroq-border-subtle)]">
            {filteredFaqs.map((faq) => (
              <details key={faq.id} className="group py-4">
                <summary className="list-none flex items-center justify-between gap-4 cursor-pointer text-left min-h-[42px] heyroq-focus-ring rounded-lg">
                  <span className={`${TYPOGRAPHY_TOKENS.bodyMedium} text-[var(--heyroq-text-primary)] group-hover:text-[var(--heyroq-accent-text)] transition-colors`}>
                    {faq.question}
                  </span>
                  <ChevronDown
                    className="w-4 h-4 text-[var(--heyroq-text-muted)] shrink-0 transition-transform duration-150 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] mt-3 pr-6`}>
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* 2. Account & Login Assistance */}
        <section id="support-account-login" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            02. Account & Login Assistance
          </h2>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Creating an Account:</strong>{' '}
              Select <strong>Sign Up</strong> in the top bar and register with a display name,
              username, email address, and a password of at least 6 characters—or select{' '}
              <strong>Continue with Google</strong>.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Resetting Your Password:</strong>{' '}
              Open <strong>Sign In</strong>, click <strong>Forgot?</strong> next to the password
              field, and submit your registered email address to receive a password reset link via
              Firebase Authentication. If you originally registered via Google Sign-In, manage your
              password through your Google Account settings.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Updating Your Profile:</strong>{' '}
              Open your avatar menu in the top-right corner, choose{' '}
              <strong>My Profile &amp; Spots</strong>, and select <strong>Edit Profile</strong> to
              update your display name, biography, or profile photo.
            </li>
          </ul>
        </section>

        {/* 3. Creating & Managing Pins */}
        <section id="support-pins-guide" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            03. Creating & Managing Pins
          </h2>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Dropping a New Pin:</strong>{' '}
              Click <strong>Drop Pin</strong> (or choose <strong>Drop New Pin</strong> from your
              account menu). Enter a concise title (up to 140 characters), choose a category, add
              optional tags and description (up to 2,000 characters), and select a location via
              Places search or <strong>Pick on Map</strong>.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Editing or Deleting a Pin:
              </strong>{' '}
              Open any pin you authored to edit its details or permanently delete it. Deleting a pin
              also cleans up its uploaded Firebase Storage photos, likes, and comments.
            </li>
          </ul>
        </section>

        {/* 4. Likes, Comments, Follows & XP */}
        <section id="support-social-progression" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            04. Likes, Comments, Follows & Explorer Progression
          </h2>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Likes &amp; Comments:</strong>{' '}
              Signed-in explorers can like pins and post comments up to 1,000 characters. You can
              delete your own comments at any time from the pin detail view.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Following Explorers:</strong>{' '}
              Visit any creator&apos;s profile or open <strong>Find People</strong> from your
              account menu to follow explorers and view follower/following lists.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Progression &amp; Badges:</strong>{' '}
              Open <strong>Progression &amp; Badges</strong> from your account menu to view your
              Explorer Level, total XP, unlocked badges across Exploration, Geography, Discovery,
              Community, and Special categories, and your global Footprint map.
              New city and country bonuses are paused. Previously earned XP and badges remain visible.
              A pin marks a location chosen by its author. Physical presence is unverified.
            </li>
          </ul>
        </section>

        {/* 5. Privacy & Account Deletion */}
        <section id="support-privacy-deletion" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            05. Privacy, Reporting & Account Deletion
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">
              Reporting Inappropriate Content:
            </strong>{' '}
            Open any pin and select the flag button to submit a report to Heyroq administrators with
            a specific violation reason.
          </p>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">
              Deleting Content &amp; Accounts:
            </strong>{' '}
            You can immediately remove individual pins and comments you created directly within the
            application. For full account and associated data erasure requests—or privacy inquiries
            under our{' '}
            <AppLink to="/privacy" className="text-[var(--heyroq-accent-text)] hover:underline">
              Privacy Policy
            </AppLink>
            —contact our support team directly at the address below.
          </p>
        </section>

        {/* 6. Troubleshooting */}
        <section id="support-troubleshooting" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            06. Troubleshooting
          </h2>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Pins appear missing on the map:
              </strong>{' '}
              Check whether the map <strong>SHOW / HIDE</strong> control is currently hiding
              markers, whether a specific category filter (such as Photography or Events) is active
              in the top bar, or whether an active search query is filtering results.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Photo upload fails or times out:
              </strong>{' '}
              Confirm the file is a JPEG, PNG, WebP, GIF, HEIC, or AVIF image under 10 MB and that
              you have a stable connection.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Reporting a bug:</strong> Open{' '}
              <AppLink to="/about" className="text-[var(--heyroq-accent-text)] hover:underline">
                About Heyroq
              </AppLink>{' '}
              and click <strong>Copy Build Info</strong> so you can include your exact version (
              <span className="font-mono text-xs">{APP_VERSION.version}</span>) and Build Identifier
              (<span className="font-mono text-xs">{APP_VERSION.buildId}</span>) in your message.
            </li>
          </ul>
        </section>

        {/* 7. Support Contact Information */}
        <section id="support-contact" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-4 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            07. Support Contact Information
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            Heyroq is operated by{' '}
            <strong className="text-[var(--heyroq-text-primary)]">{OPERATOR_IDENTITY.name}</strong>{' '}
            (
            <a
              href={OPERATOR_IDENTITY.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1"
            >
              <span>{OPERATOR_IDENTITY.websiteUrl}</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
            ). Reach our team directly for account assistance, privacy inquiries, or bug reports:
          </p>

          <div className="liquid-glass-card rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-text-primary)] block`}>
                Official Support Email
              </span>
              <span className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-muted)] block mt-0.5`}>
                Account, technical, moderation &amp; privacy requests
              </span>
            </div>

            {supportResource.mailboxOperationalConfirmed && supportResource.mailtoHref ? (
              <a
                id="support-page-mailto-link"
                href={supportResource.mailtoHref}
                className="heyroq-btn-primary min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-2 shrink-0 heyroq-focus-ring"
              >
                <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{supportResource.proposedEmail}</span>
              </a>
            ) : (
              <span className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-primary)]`}>
                {supportResource.proposedEmail}
              </span>
            )}
          </div>
        </section>
      </div>
    </InfoPageLayout>
  );
};
