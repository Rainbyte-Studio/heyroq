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

const TERMS_TOC: ReadonlyArray<PageTocItem> = [
  { id: 'terms-operator-scope', label: 'Operator Identity & Agreement' },
  { id: 'terms-eligibility-accounts', label: 'Eligibility & Account Responsibilities' },
  { id: 'terms-acceptable-use', label: 'Acceptable Use' },
  { id: 'terms-ugc-ownership', label: 'User Content & Permissions' },
  { id: 'terms-prohibited-content', label: 'Prohibited Content & Conduct' },
  { id: 'terms-location-third-party', label: 'Location Accuracy & Third-Party Services' },
  { id: 'terms-moderation-reporting', label: 'Moderation & Reporting' },
  { id: 'terms-suspension-termination', label: 'Account Suspension & Termination' },
  { id: 'terms-availability-beta', label: 'Service Availability & Beta Status' },
  { id: 'terms-liability-legal', label: 'Liability Limitations & Legal Terms' },
];

export const TermsOfServicePage: React.FC = () => {
  const supportResource = BRAND_LEGAL_SUPPORT.supportContact;

  return (
    <InfoPageLayout
      activeRoute="/terms"
      kicker="Legal Draft · Community & Platform Terms"
      title="Terms of Service"
      lead="These Terms of Service govern your access to and use of Heyroq, a social location discovery platform operated by Rainbyte Studio."
      metaItems={[
        'Operated by Rainbyte Studio',
        `App Version ${APP_VERSION.displayVersion} (${APP_VERSION.releaseChannel})`,
        'Pre-Publication Legal Review Draft',
      ]}
      tocItems={TERMS_TOC}
    >
      <div className="space-y-11">
        {/* Legal Review Status Callout */}
        <div
          role="note"
          aria-label="Terms of Service legal review notice"
          className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] dark:bg-amber-950/20 p-5 space-y-2"
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className={`${TYPOGRAPHY_TOKENS.label} text-amber-900 dark:text-amber-200`}>
              Pre-Publication Draft — Clauses Flagged for Legal Review
            </span>
          </div>
          <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)] leading-relaxed`}>
            Platform mechanics, authentication rules, and moderation/reporting workflows described
            below match <strong>verified capabilities</strong> in the Heyroq codebase. Contractual
            provisions requiring formal legal review—including statutory operator entity identity,
            minimum age thresholds, content license wording, liability caps, and governing
            jurisdiction—are clearly marked with{' '}
            <strong className="text-amber-800 dark:text-amber-200">[Requires Legal Review]</strong>.
          </p>
        </div>

        {/* 1. Operator Identity & Agreement */}
        <section id="terms-operator-scope" tabIndex={-1} className="scroll-mt-24 space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            01. Operator Identity & Agreement
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Heyroq</strong> is operated by{' '}
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
            ). {OPERATOR_IDENTITY.brandRelationship} By creating an account, dropping pins, posting
            comments, or browsing Heyroq, you agree to comply with these Terms of Service and our{' '}
            <AppLink to="/privacy" className="text-[var(--heyroq-accent-text)] hover:underline">
              Privacy Policy
            </AppLink>
            .
          </p>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Legal Review — Contracting Entity]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              Confirm the exact contracting legal entity name, registered address, and registration
              details behind Rainbyte Studio prior to commercial release. No unverified corporate
              registrations or addresses are assumed in this draft.
            </p>
          </div>
        </section>

        {/* 2. Eligibility & Account Responsibilities */}
        <section id="terms-eligibility-accounts" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            02. Eligibility & Account Responsibilities
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            To create pins, upload photos, like spots, comment, follow explorers, or submit
            moderation reports, you must sign in using a valid Email/Password account or Google
            Sign-In via Firebase Authentication. You are responsible for:
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>Maintaining the confidentiality and security of your login credentials;</li>
            <li>Providing truthful, non-impersonating profile details (username, display name, and biography); and</li>
            <li>All activity conducted under your authenticated account unless you promptly report unauthorized access.</li>
          </ul>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Legal Review — Minimum Age Requirement]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              Confirm the minimum user age threshold (e.g., 13+ or 16+ depending on applicable EEA,
              UK, and international digital consent laws) before public launch.
            </p>
          </div>
        </section>

        {/* 3. Acceptable Use */}
        <section id="terms-acceptable-use" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            03. Acceptable Use
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            Heyroq is designed for authentic, respectful location discovery. You agree to use the
            platform lawfully, respect local communities, private property, environmental
            protections, and local access rules when visiting or sharing real-world places, and
            refrain from interfering with Heyroq&apos;s security rules, progression system, or
            infrastructure.
          </p>
        </section>

        {/* 4. User-Generated Content, Ownership & Permissions */}
        <section id="terms-ugc-ownership" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            04. User-Generated Content, Ownership & Content Permissions
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Your Ownership:</strong> As
            between you and {OPERATOR_IDENTITY.name}, you retain ownership of the photographs,
            descriptions, titles, comments, and profile content you create and upload to Heyroq
            (&ldquo;User Content&rdquo;).
          </p>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">
              Operational License to Display Your Content (Draft):
            </strong>{' '}
            Because Heyroq is a public map platform, when you publish User Content on Heyroq, you
            grant {OPERATOR_IDENTITY.name} a worldwide, non-exclusive, royalty-free, revocable
            operational license to host, store, cache, reproduce, format, and publicly display that
            User Content within Heyroq solely for operating, securing, and promoting the
            functionality of the platform. This license ends when you delete the relevant pin,
            comment, or account, except to the extent copies remain temporarily in technical caches
            or moderation logs.
          </p>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Your Representations:</strong> You
            confirm that you own or have all necessary rights and permissions to upload your User
            Content, and that your uploads do not infringe copyright, trademark, privacy, or
            publicity rights of any third party.
          </p>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Legal Review — Final Content License Scope]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              Legal counsel should confirm the exact scope of sublicensing (e.g., to cloud hosting
              sub-processors such as Google Cloud / Firebase) and whether featured social/editorial
              sharing outside the web app is intended.
            </p>
          </div>
        </section>

        {/* 5. Prohibited Content & Conduct */}
        <section id="terms-prohibited-content" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            05. Prohibited Content & Conduct
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            You may not upload, pin, comment, or share content that:
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-1.5`}>
            <li>Is unlawful, defamatory, fraudulent, sexually explicit, hateful, or harassing;</li>
            <li>Exposes private residences, non-public personal information (doxxing), or restricted security-sensitive sites;</li>
            <li>Encourages trespassing onto restricted private property or entering hazardous locations;</li>
            <li>Contains spam, deceptive commercial advertising, malware, or automated scraping/bot traffic; or</li>
            <li>Attempts to spoof user identities, manipulate like/comment/follow counters, or falsify Explorer Progression XP.</li>
          </ul>
        </section>

        {/* 6. Location Accuracy & Third-Party Services */}
        <section id="terms-location-third-party" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            06. Location Accuracy, Real-World Safety & Third-Party Services
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">
              No Navigation or Safety Guarantee:
            </strong>{' '}
            Pins, coordinates, descriptions, and categories on Heyroq are contributed by community
            members for general discovery only. Neither {OPERATOR_IDENTITY.name} nor Heyroq verifies
            physical site safety, weather conditions, legal public access, opening hours, or terrain
            hazards. Always exercise independent judgment and obey local laws, signage, and safety
            advisories in the real world.
          </p>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            <strong className="text-[var(--heyroq-text-primary)]">Google Maps Platform:</strong> Map
            displays, place search, and geocoding features incorporate Google Maps Platform
            services. When using Heyroq&apos;s map features, you also agree to comply with the{' '}
            <a
              href="https://maps.google.com/help/terms_maps/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1"
            >
              <span>Google Maps / Google Earth Additional Terms of Service</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
            .
          </p>
        </section>

        {/* 7. Moderation & Reporting */}
        <section id="terms-moderation-reporting" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            07. Moderation & Reporting
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-primary)]`}>
            <strong>Verified Codebase Capabilities:</strong>
          </p>
          <ul className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] list-disc pl-5 space-y-2`}>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">User Reporting:</strong>{' '}
              Signed-in users can report pins via the in-app Report dialog (selecting a category
              such as inappropriate content, misleading location, spam, dangerous/restricted
              property, or harassment, plus optional details). Submitted reports are stored in a
              restricted Firestore collection readable only by platform administrators.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">Administrator Review:</strong>{' '}
              Authorized administrators can inspect reported pins through the Moderation Dashboard,
              mark reports as resolved or dismissed, and permanently remove reported pins.
            </li>
            <li>
              <strong className="text-[var(--heyroq-text-primary)]">
                No Pre-Publication Screening:
              </strong>{' '}
              Heyroq does <strong>not</strong> currently run automated pre-publication content
              moderation or real-time AI filtering on user uploads, nor does it currently provide
              user-to-user blocking in the client UI.
            </li>
          </ul>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Legal Review — Notice-and-Action & Appeals Procedures]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              Confirm formal copyright/IP takedown procedures, EU Digital Services Act (DSA)
              notice-and-action requirements (if applicable), and user appeals channels before
              production publication.
            </p>
          </div>
        </section>

        {/* 8. Account Suspension & Termination */}
        <section id="terms-suspension-termination" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            08. Account Suspension & Termination
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            You may stop using Heyroq at any time, delete individual pins and comments directly in
            the app, or request full account deletion as described in our{' '}
            <AppLink to="/privacy" className="text-[var(--heyroq-accent-text)] hover:underline">
              Privacy Policy
            </AppLink>{' '}
            and{' '}
            <AppLink to="/support" className="text-[var(--heyroq-accent-text)] hover:underline">
              Help &amp; Support
            </AppLink>
            . {OPERATOR_IDENTITY.name} reserves the right to remove content that violates these
            Terms or applicable law and to restrict, disable, or delete accounts engaged in abuse,
            security violations, or repeated infringement via administrative backend controls.
          </p>
        </section>

        {/* 9. Service Availability & Beta Status */}
        <section id="terms-availability-beta" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            09. Service Availability & Beta Status
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            Heyroq is currently operating in its{' '}
            <strong className="text-[var(--heyroq-text-primary)]">
              {APP_VERSION.releaseChannel}
            </strong>{' '}
            release channel (<span className="font-mono text-xs">{APP_VERSION.displayVersion}</span>
            ). Features, progression mechanics, categories, and interfaces may be updated, modified,
            suspended, or discontinued at any time without uninterrupted uptime guarantees.
          </p>
        </section>

        {/* 10. Liability Limitations & Legal Terms */}
        <section id="terms-liability-legal" tabIndex={-1} className="scroll-mt-24 pt-8 border-t border-[var(--heyroq-border-subtle)] space-y-3.5 focus:outline-none">
          <h2 className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)]`}>
            10. Disclaimers, Liability Limitations & Legal Terms
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
            To the maximum extent permitted by applicable mandatory law, Heyroq is provided on an
            &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties of
            merchantability, fitness for a particular purpose, or accuracy of user-contributed map
            locations. Nothing in these Terms excludes liability that cannot lawfully be excluded
            under applicable consumer protection statutes.
          </p>
          <div className="liquid-glass-card rounded-xl p-4 space-y-1.5">
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-amber-700 dark:text-amber-200 font-semibold`}>
              [Requires Legal Review — Governing Law, Venue, Liability Cap & Contact]
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-secondary)]`}>
              • <strong>Governing Law &amp; Jurisdiction:</strong> Must be specified by legal counsel
              once the statutory contracting entity and jurisdiction for {OPERATOR_IDENTITY.name}{' '}
              are confirmed (none invented here).<br />
              • <strong>Limitation of Liability &amp; Indemnification:</strong> Confirm exact
              monetary cap and consumer carve-outs appropriate for the chosen jurisdiction.<br />
              • <strong>Support &amp; Legal Contact:</strong> Official contact email is{' '}
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
              )}
              .
            </p>
          </div>
        </section>
      </div>
    </InfoPageLayout>
  );
};
