import React from 'react';
import { AlertCircle, ExternalLink, Mail } from 'lucide-react';
import {
  BRAND_LEGAL_SUPPORT,
  OPERATOR_IDENTITY,
  TYPOGRAPHY_TOKENS,
} from '../../config/brandConfig';
import { APP_VERSION } from '../../config/version';
import { AppLink } from '../../utils/appRoutes';
import { InfoPageLayout, PageTocItem } from './InfoPageLayout';

const PRIVACY_TOC: ReadonlyArray<PageTocItem> = [
  { id: 'privacy-operator', label: 'Operator Identity & Scope' },
  { id: 'privacy-account-auth', label: 'Account Information & Authentication' },
  { id: 'privacy-public-content', label: 'Public Profiles & User Content' },
  { id: 'privacy-location-maps', label: 'Location & Map Functionality' },
  { id: 'privacy-google-maps', label: 'Google Maps & Places Services' },
  { id: 'privacy-firebase', label: 'Firebase Services & Cloud Processing' },
  { id: 'privacy-images', label: 'Uploaded Images & Media' },
  { id: 'privacy-social-activity', label: 'Likes, Comments, Follows & Progression' },
  { id: 'privacy-retention-deletion', label: 'Data Retention & Account Deletion' },
  { id: 'privacy-rights-gdpr', label: 'Privacy Rights, GDPR & Contact' },
];

export const PrivacyPolicyPage: React.FC = () => {
  const supportResource = BRAND_LEGAL_SUPPORT.supportContact;

  return (
    <InfoPageLayout
      activeRoute="/privacy"
      kicker="Legal Draft · Privacy & Data Protection"
      title="Privacy Policy"
      lead="This Privacy Policy explains how Heyroq, operated by Rainbyte Studio, collects, uses, stores, and shares information when you browse the map, create an account, publish pins, or interact with the community."
      metaItems={[
        'Operated by Rainbyte Studio',
        `App Version ${APP_VERSION.displayVersion}`,
        'Pre-Publication Legal Review Draft',
      ]}
      tocItems={PRIVACY_TOC}
    >
      <div className="space-y-11">
        {/* Top Transparency Banner Distinguishing Verified Code Facts vs Legal Confirmation Items */}
        <div
          role="note"
          aria-label="Legal review status notice"
          className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] dark:bg-amber-950/20 p-5 space-y-2"
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className={`${TYPOGRAPHY_TOKENS.label} text-amber-900 dark:text-amber-200`}>
              Pre-Publication Draft — Items Flagged for Legal & Product Confirmation
            </span>
          </div>
          <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)] leading-relaxed`}>
            Technical data flows in this document reflect <strong>verified implementation details</strong>{' '}
            in the current Heyroq codebase, and{' '}
            <span className="font-mono text-[var(--heyroq-text-primary)]">
              {supportResource.proposedEmail}
            </span>{' '}
            is active for privacy inquiries. Clauses requiring formal legal counsel confirmation—such
            as statutory registered entity details, postal address, and fixed backup retention
            periods—are explicitly marked with{' '}
            <strong className="text-amber-800 dark:text-amber-200">[Requires Confirmation]</strong>.
          </p>
        </div>

        {/* 1. Operator Identity & Scope */}
        <section id="privacy-operator" tabIndex={-1} className="scroll-mt-24 space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            01. Operator Identity & Scope
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Heyroq</strong> is an independent
            social location discovery platform operated by{' '}
            <strong className="text-[var(--heyroq-text-primary)]">{OPERATOR_IDENTITY.name}</strong> (
            <a
              href={OPERATOR_IDENTITY.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1"
            >
              <span>{OPERATOR_IDENTITY.websiteUrl}</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
            ). This policy applies to the Heyroq web application, interactive map, user profiles,
            and associated cloud services.
          </p>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Confirmation — Controller Statutory Details]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              Rainbyte Studio is identified as the operator of Heyroq. Before commercial or GA
              publication, confirm whether &ldquo;Rainbyte Studio&rdquo; is a trading name or a
              registered legal entity, and insert the verified legal entity name (if applicable),
              registered office postal address, registration/VAT number (if applicable), and lead
              data protection supervisory authority.
            </p>
          </div>
        </section>

        {/* 2. Account Information & Authentication */}
        <section id="privacy-account-auth" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            02. Account Information & Authentication
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Verified Implementation:</strong>{' '}
            You may browse the Heyroq map, search spots, and read legal pages without creating an
            account. When you register or sign in, authentication is handled via{' '}
            <strong>Firebase Authentication</strong> using one of two supported methods:
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Email &amp; Password:</strong>{' '}
              Collects your email address, password (cryptographically hashed and managed by
              Firebase Authentication—never stored in plaintext or readable by Heyroq client code),
              chosen display name, and username. Password reset requests send recovery emails
              directly through Firebase Authentication.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Google Sign-In:</strong>{' '}
              Authenticates via Google OAuth popup and receives your Google account UID, email
              address, display name, and profile photo URL (if provided by Google).
            </li>
          </ul>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">
              Email Privacy Separation (Verified):
            </strong>{' '}
            Heyroq&apos;s Firestore Security Rules and client profile service explicitly strip and
            prohibit storing your <code className="font-mono text-xs">email</code> field inside
            publicly readable <code className="font-mono text-xs">users/&#123;userId&#125;</code>{' '}
            profile documents. Your email address remains in Firebase Authentication for login,
            account recovery, and security verification.
          </p>
        </section>

        {/* 3. Public Profiles & User-Generated Content */}
        <section id="privacy-public-content" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            03. Public Profiles & User-Generated Content
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Verified Implementation:</strong>{' '}
            Heyroq is a public social discovery platform. Information you publish to your profile or
            the map is publicly readable by anyone visiting the application (including
            unauthenticated visitors):
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Public Profile Fields:</strong>{' '}
              Display name, username, lowercase search prefixes, biography (up to 1,000 characters),
              optional custom uploaded avatar image URL (when no custom photo is uploaded, Heyroq
              renders a deterministic initials avatar client-side from your display name and user ID
              with zero third-party avatar requests), follower/following counts, and active pin
              count.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Published Pins:</strong> Pin
              title (up to 140 characters), description (up to 2,000 characters), category, tags,
              latitude/longitude coordinates, geohash, place label, city/country metadata, uploaded
              image URLs, creation timestamp, and author display identity.
            </li>
          </ul>
          <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-muted)]`}>
            Do not include private residential addresses, confidential personal details, or
            sensitive personal data in public pins, bios, photos, or comments.
          </p>
        </section>

        {/* 4. Location & Map Functionality */}
        <section id="privacy-location-maps" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            04. Location & Map Functionality
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Verified Implementation:</strong>{' '}
            Heyroq processes two distinct types of location data:
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                On-Demand Device Geolocation:
              </strong>{' '}
              Heyroq requests your browser&apos;s device location (
              <code className="font-mono text-xs">navigator.geolocation.getCurrentPosition</code>)
              only when you actively trigger the map&apos;s locate action and grant permission in
              your browser. Heyroq does <strong>not</strong> perform continuous background location
              tracking, and your live device coordinates are not persisted to Firestore unless you
              explicitly choose to create and publish a pin at those coordinates.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Pin &amp; Viewport Coordinates:
              </strong>{' '}
              Map viewport bounds are used to query nearby pins via geohash ranges, and coordinates
              you select when dropping a pin are stored publicly on that pin document.
            </li>
          </ul>
        </section>

        {/* 5. Google Maps & Places Services */}
        <section id="privacy-google-maps" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            05. Google Maps & Places Services
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Verified Implementation:</strong>{' '}
            Interactive map rendering, place search autocomplete, place geometry lookup, and reverse
            geocoding (converting a clicked map coordinate into a readable neighborhood/city label)
            are powered by <strong>Google Maps Platform</strong> (Maps JavaScript API, Places API,
            and Geocoding API).
          </p>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            When you view the map or type a place query, your browser communicates directly with
            Google servers (which receive technical request data such as IP address, map tile
            requests, and search terms). Google&apos;s processing of that data is governed by the{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1"
            >
              <span>Google Privacy Policy</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
            .
          </p>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            When geography XP verification is enabled, Heyroq sends the coordinates of a newly
            published pin to Geoapify to identify its containing city and country. The request includes
            only the pin&apos;s latitude and longitude. See the{' '}
            <a className="underline" href="https://www.geoapify.com/privacy-policy/">Geoapify Privacy Policy</a>.
          </p>
        </section>

        {/* 6. Firebase Services & Cloud Processing */}
        <section id="privacy-firebase" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            06. Firebase Authentication, Firestore, Storage & Cloud Functions
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Verified Implementation:</strong>{' '}
            Heyroq relies on Google Cloud / Firebase infrastructure as data processors to operate
            core application features:
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Firebase Authentication:</strong>{' '}
              Manages account credentials, OAuth tokens, session tokens, and password resets.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Cloud Firestore:</strong> Stores
              public user profiles, pins, likes, comments, follow relationships, progression
              summaries, achievements, XP event ledgers, and moderation reports under strict
              document-level Security Rules.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Cloud Storage for Firebase:
              </strong>{' '}
              Stores user-uploaded pin photographs and custom profile avatars.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Cloud Functions for Firebase:
              </strong>{' '}
              Server-side triggers and callable functions deployed in the{' '}
              <code className="font-mono text-xs">europe-west2</code> (London) region maintain
              authoritative like/comment/follow counters, compute Explorer Progression XP, clean up
              deleted pin assets, and execute server-side account deletion workflows.
            </li>
          </ul>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Confirmation — Infrastructure Regions & Sub-Processor List]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              While Cloud Functions specify <code className="font-mono">europe-west2</code>, confirm
              the exact configured multi-region/regional locations for the named Firestore database,
              Firebase Storage bucket, and Google Cloud Run hosting environment, and confirm whether
              any analytics, error-monitoring, or transactional email providers will be enabled in
              production.
            </p>
          </div>
        </section>

        {/* 7. Uploaded Images & Media */}
        <section id="privacy-images" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            07. Uploaded Images & Media
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Verified Implementation:</strong>{' '}
            Authenticated users can upload images in JPEG, PNG, WebP, GIF, HEIC, or AVIF format up
            to <strong>10 MB per file</strong> to user-scoped paths (
            <code className="font-mono text-xs">pins/&#123;userId&#125;/...</code> and{' '}
            <code className="font-mono text-xs">profile-images/&#123;userId&#125;/...</code>).
            Uploaded images are publicly accessible via their Storage download URLs so they can
            render on the map and profiles, and include upload metadata (
            <code className="font-mono text-xs">uploadedBy</code> UID and timestamp).
          </p>
          <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-muted)]`}>
            Note: Heyroq does not currently strip embedded camera EXIF metadata client-side prior to
            upload; users should remove sensitive camera metadata before uploading if desired, or
            product owners should confirm whether server/client EXIF stripping will be added.
          </p>
        </section>

        {/* 8. Likes, Comments, Follows & Activity */}
        <section id="privacy-social-activity" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            08. Likes, Comments, Follows & Activity
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-primary)]`}>
            <strong>Verified Implementation:</strong>
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Likes &amp; Comments:</strong>{' '}
              Liking a pin creates a record under{' '}
              <code className="font-mono text-xs">pins/&#123;pinId&#125;/likes/&#123;userId&#125;</code>
              ; commenting stores your comment text (up to 1,000 characters), author UID, display
              name, avatar URL, and timestamp. Both are publicly readable.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Follows:</strong> Following
              another user records public follower/following documents so follower lists and counts
              remain accurate.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Explorer Progression &amp; Reports:
              </strong>{' '}
              Summary progression levels and unlocked badges are publicly visible on profiles,
              whereas detailed XP event ledgers (<code className="font-mono text-xs">xpEvents</code>
              ) are restricted by Security Rules to the account owner and administrators. Content
              reports submitted via the Report dialog are visible strictly to administrators.
            </li>
          </ul>
        </section>

        {/* 9. Data Retention & Account Deletion */}
        <section id="privacy-retention-deletion" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            09. Data Retention & Account Deletion
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-primary)]`}>
            <strong>Verified Deletion Controls:</strong>
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Pins &amp; Comments:</strong>{' '}
              You can delete your own pins and comments directly inside Heyroq at any time. Deleting
              a pin triggers cleanup of its likes, comments, and associated Firebase Storage photos
              under <code className="font-mono text-xs">pins/&#123;userId&#125;/</code>. Replacing a
              custom profile photo removes the superseded file in{' '}
              <code className="font-mono text-xs">profile-images/&#123;userId&#125;/</code>.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                Self-Service Account Deletion:
              </strong>{' '}
              Authenticated users can permanently delete their account at any time from{' '}
              <strong>Profile &rarr; Settings &rarr; Account &amp; Security &rarr; Delete Account</strong>{' '}
              (after explicit confirmation and recent identity reauthentication). Invoking the{' '}
              <code className="font-mono text-xs">deleteUserAccount</code> Cloud Function locks
              account recreation, removes authored likes, comments, follow links, pins, Storage
              files, public profile subcollections, and the Firebase Authentication account record.
            </li>
          </ul>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Confirmation — Infrastructure Log &amp; Tombstone Retention Periods]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              Define and confirm specific retention periods for anonymized moderation reports (
              <code className="font-mono">reports/&#123;reportId&#125;</code>), account-deletion
              tombstone locks (<code className="font-mono">accountDeletionLocks/&#123;uid&#125;</code>
              ), and Google Cloud / Firebase infrastructure logs and backups. No retention durations
              have been assumed in this draft.
            </p>
          </div>
        </section>

        {/* 10. User Privacy Rights, GDPR & Contact Procedures */}
        <section id="privacy-rights-gdpr" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            10. User Privacy Rights, GDPR Considerations & Contact Procedures
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            Depending on where you live—including the European Economic Area (EEA), the United
            Kingdom, and Switzerland under the GDPR / UK GDPR—you may have the right to:
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-1.5`}>
            <li>Access a copy of the personal data held about you;</li>
            <li>Rectify inaccurate profile information or edit your published pins;</li>
            <li>Request erasure (&ldquo;right to be forgotten&rdquo;) of your account and personal data;</li>
            <li>Restrict or object to certain processing activities;</li>
            <li>Receive your data in a portable, machine-readable format where applicable;</li>
            <li>Withdraw consent (such as revoking browser geolocation permission in your device/browser settings) without affecting prior lawful processing; and</li>
            <li>Lodge a complaint with your local data protection supervisory authority.</li>
          </ul>

          <div className="liquid-glass-card rounded-xl p-4 space-y-2">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Confirmation — GDPR Lawful Bases & International Transfers]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              • <strong>Lawful Bases (Draft for Legal Review):</strong> Confirm the final GDPR
              Article 6(1) mapping—typically performance of a contract (Art. 6(1)(b)) for account,
              pin, and social functionality; consent (Art. 6(1)(a)) for optional browser
              geolocation; and legitimate interests (Art. 6(1)(f)) for platform security, abuse
              prevention, and moderation.<br />
              • <strong>International Data Transfers:</strong> Google Cloud / Firebase and Google
              Maps Platform may process data across global infrastructure; confirm applicable
              Standard Contractual Clauses (SCCs) / Data Privacy Framework disclosures.<br />
              • <strong>Privacy &amp; Data-Rights Contact:</strong> Contact{' '}
              {supportResource.mailboxOperationalConfirmed && supportResource.mailtoHref ? (
                <a
                  href={supportResource.mailtoHref}
                  className="font-mono text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1"
                >
                  <Mail className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{supportResource.proposedEmail}</span>
                </a>
              ) : (
                <span className="font-mono text-[var(--heyroq-text-primary)]">
                  {supportResource.proposedEmail}
                </span>
              )}{' '}
              (operated by {OPERATOR_IDENTITY.name}), or visit{' '}
              <AppLink to="/support" className="text-[var(--heyroq-accent-text)] hover:underline">
                Help &amp; Support
              </AppLink>
              .
            </p>
          </div>
        </section>
      </div>
    </InfoPageLayout>
  );
};
