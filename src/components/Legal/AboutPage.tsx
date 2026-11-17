import React, { useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { APP_VERSION } from '../../config/version';
import {
  BRAND_IDENTITY,
  BRAND_LEGAL_SUPPORT,
  OPERATOR_IDENTITY,
  TYPOGRAPHY_TOKENS,
} from '../../config/brandConfig';
import { AppLink } from '../../utils/appRoutes';
import { InfoPageLayout } from './InfoPageLayout';

const KEY_FEATURES: ReadonlyArray<{
  readonly index: string;
  readonly title: string;
  readonly description: string;
}> = [
  {
    index: '01',
    title: 'Interactive Vector Map & Geohash Discovery',
    description:
      'Explore community-curated pins across cities, neighborhoods, trails, and coastlines on an interactive Google Maps canvas with viewport-aware geohash loading and one-tap marker visibility controls.',
  },
  {
    index: '02',
    title: 'Curated Categories & Instant Local Sorting',
    description:
      'Filter discoveries across Hidden Gems, Food, Travel, Nature, Photography, Events, and Activities, and switch effortlessly between Recent, Popular, and Trending views.',
  },
  {
    index: '03',
    title: 'Rich Community Pins & Visual Storytelling',
    description:
      'Drop pins using Google Places search or direct map coordinate picking, attach original photography up to 10 MB, and add context-rich descriptions and tags for fellow explorers.',
  },
  {
    index: '04',
    title: 'Social Connections & Authentic Engagement',
    description:
      'Like memorable spots, join conversations in pin comments, follow trusted explorers, and browse curated creator profiles without exposing private account email addresses.',
  },
  {
    index: '05',
    title: 'Explorer Progression & Geographic Footprint',
    description:
      'Track lifetime explored cities and countries, unlock exploration achievements, and earn server-verified Explorer XP that preserves your historical milestones.',
  },
  {
    index: '06',
    title: 'Community Reporting & Safety Controls',
    description:
      'Flag inaccurate, unsafe, or inappropriate pins directly for administrator moderation review while retaining full control to edit or delete your own pins and comments.',
  },
];

export const AboutPage: React.FC = () => {
  const [copiedBuild, setCopiedBuild] = useState(false);

  const commitDisplay = APP_VERSION.gitCommitSha ?? 'Not available';
  const buildDateDisplay = APP_VERSION.buildDateShort ?? 'Local workspace';

  const handleCopyBuildInfo = async () => {
    const lines = [
      `${BRAND_IDENTITY.productName} (${APP_VERSION.packageName})`,
      `Operated by: ${OPERATOR_IDENTITY.name} (${OPERATOR_IDENTITY.websiteUrl})`,
      `Version: ${APP_VERSION.version}`,
      `Release Channel: ${APP_VERSION.releaseChannel}`,
      `Build Identifier: ${APP_VERSION.buildId}`,
      `Commit Revision: ${commitDisplay}`,
      `Build Date: ${APP_VERSION.buildDate ?? 'Unavailable'}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedBuild(true);
      setTimeout(() => setCopiedBuild(false), 2000);
    } catch {
      setCopiedBuild(false);
    }
  };

  return (
    <InfoPageLayout
      activeRoute="/about"
      kicker="About the Platform"
      title={BRAND_IDENTITY.brandAttribution}
      lead="Heyroq brings people together around real-world places worth remembering—from quiet neighborhood coffee bars and golden-hour viewpoints to local cultural gatherings and scenic trails."
      metaItems={[
        `Version ${APP_VERSION.displayVersion}`,
        `${APP_VERSION.releaseChannel} Channel`,
        `Operated by ${OPERATOR_IDENTITY.name}`,
      ]}
    >
      <div className="space-y-14 sm:space-y-16">
        {/* Section 1: Mission & Social Location Discovery */}
        <section
          aria-labelledby="about-mission-heading"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start"
        >
          <div className="lg:col-span-5">
            <h2
              id="about-mission-heading"
              className={`${TYPOGRAPHY_TOKENS.heading1} text-[var(--heyroq-text-primary)]`}
            >
              Why social location discovery matters
            </h2>
          </div>
          <div className="lg:col-span-7 space-y-4 max-w-[68ch]">
            <p className={`${TYPOGRAPHY_TOKENS.bodyLarge} text-[var(--heyroq-text-primary)]`}>
              Traditional directories rank places by advertising spend or generic star averages.
              Heyroq is built around a simpler idea: the best places in any city or landscape are
              discovered through people who actually stood there and cared enough to share what
              made the moment special.
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
              Every pin on Heyroq pairs geographic coordinates on an interactive map with human
              context—photographs, category curation, neighborhood labels, and community
              conversation. Whether you are documenting spots in your home city or exploring
              somewhere unfamiliar, Heyroq turns the map into a living social atlas.
            </p>
          </div>
        </section>

        {/* Section 2: Key Platform Features */}
        <section
          aria-labelledby="about-features-heading"
          className="pt-12 border-t border-[var(--heyroq-border-subtle)]"
        >
          <div className="max-w-2xl mb-8">
            <h2
              id="about-features-heading"
              className={`${TYPOGRAPHY_TOKENS.heading1} text-[var(--heyroq-text-primary)]`}
            >
              How Heyroq works
            </h2>
            <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-muted)] mt-2`}>
              Built for responsive exploration across desktop, tablet, and mobile browsers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
            {KEY_FEATURES.map((feature) => (
              <div key={feature.index} className="pt-5 border-t border-[var(--heyroq-border-subtle)]">
                <span className="font-mono text-xs text-[var(--heyroq-accent-text)] font-semibold tabular-nums">
                  {feature.index}.
                </span>
                <h3 className={`${TYPOGRAPHY_TOKENS.heading3} text-[var(--heyroq-text-primary)] mt-2`}>
                  {feature.title}
                </h3>
                <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] mt-2`}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Operator Attribution & Brand Relationship */}
        <section
          aria-labelledby="about-operator-heading"
          className="pt-12 border-t border-[var(--heyroq-border-subtle)] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start"
        >
          <div className="lg:col-span-5">
            <h2
              id="about-operator-heading"
              className={`${TYPOGRAPHY_TOKENS.heading1} text-[var(--heyroq-text-primary)]`}
            >
              Operated by Rainbyte Studio
            </h2>
            <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-muted)] mt-2`}>
              Independent product stewardship and engineering.
            </p>
          </div>

          <div className="lg:col-span-7 space-y-4 max-w-[68ch]">
            <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)]`}>
              <strong className="text-[var(--heyroq-text-primary)]">
                {OPERATOR_IDENTITY.brandRelationship}
              </strong>{' '}
              Heyroq maintains its own dedicated product identity, design language, and community
              focus while drawing on the product engineering and operational stewardship of{' '}
              <a
                href={OPERATOR_IDENTITY.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1 heyroq-focus-ring rounded"
              >
                <span>{OPERATOR_IDENTITY.name}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </a>
              .
            </p>
            <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-muted)]`}>
              Official operator website:{' '}
              <a
                href={OPERATOR_IDENTITY.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--heyroq-text-primary)] hover:underline underline-offset-4 heyroq-focus-ring rounded"
              >
                {OPERATOR_IDENTITY.websiteUrl}
              </a>
            </p>
          </div>
        </section>

        {/* Section 4: Centralized Version, Release Channel & Build Information */}
        <section
          aria-labelledby="about-version-heading"
          className="pt-12 border-t border-[var(--heyroq-border-subtle)] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start"
        >
          <div className="lg:col-span-5">
            <h2
              id="about-version-heading"
              className={`${TYPOGRAPHY_TOKENS.heading1} text-[var(--heyroq-text-primary)]`}
            >
              Release & build metadata
            </h2>
            <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-muted)] mt-2`}>
              Populated automatically from Heyroq&apos;s canonical Semantic Versioning
              configuration.
            </p>
            <button
              id="about-page-copy-build-btn"
              type="button"
              onClick={handleCopyBuildInfo}
              className={`${TYPOGRAPHY_TOKENS.buttonSmall} liquid-glass-card mt-5 min-h-[42px] px-4 py-2 rounded-xl hover:bg-slate-900/[0.04] dark:hover:bg-white/10 text-[var(--heyroq-text-primary)] inline-flex items-center gap-2 transition-colors cursor-pointer heyroq-focus-ring`}
            >
              {copiedBuild ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  <span>Copied Build Summary</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[var(--heyroq-text-muted)]" aria-hidden="true" />
                  <span>Copy Build Info</span>
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-7">
            <dl className="divide-y divide-[var(--heyroq-border-subtle)] border-y border-[var(--heyroq-border-subtle)]">
              <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <dt className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-text-muted)]`}>
                  Product & Package
                </dt>
                <dd className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-primary)]`}>
                  {BRAND_IDENTITY.productName} ({APP_VERSION.packageName})
                </dd>
              </div>
              <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <dt className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-text-muted)]`}>
                  Application Version
                </dt>
                <dd
                  id="about-page-version"
                  className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-primary)]`}
                >
                  {APP_VERSION.version}
                </dd>
              </div>
              <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <dt className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-text-muted)]`}>
                  Release Channel
                </dt>
                <dd
                  id="about-page-channel"
                  className={`${TYPOGRAPHY_TOKENS.bodyMedium} text-[var(--heyroq-text-primary)]`}
                >
                  {APP_VERSION.releaseChannel}
                </dd>
              </div>
              <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <dt className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-text-muted)]`}>
                  Build Identifier
                </dt>
                <dd
                  id="about-page-build-id"
                  className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-primary)] break-all`}
                >
                  {APP_VERSION.buildId}
                </dd>
              </div>
              <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <dt className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-text-muted)]`}>
                  Commit & Build Date
                </dt>
                <dd className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-secondary)]`}>
                  {commitDisplay} · {buildDateDisplay}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Section 5: Legal & Support Destinations */}
        <section
          aria-labelledby="about-legal-links-heading"
          className="pt-12 border-t border-[var(--heyroq-border-subtle)]"
        >
          <h2
            id="about-legal-links-heading"
            className={`${TYPOGRAPHY_TOKENS.heading1} text-[var(--heyroq-text-primary)]`}
          >
            Legal & support resources
          </h2>
          <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-muted)] mt-2 max-w-2xl`}>
            Review how Heyroq handles personal and location data, community terms of use, and
            platform support.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
            <AppLink
              to="/privacy"
              className="liquid-glass-card group p-6 rounded-2xl hover:border-[var(--brand-primary)]/60 transition-colors flex flex-col justify-between gap-6 heyroq-focus-ring"
            >
              <div>
                <h3 className={`${TYPOGRAPHY_TOKENS.heading3} text-[var(--heyroq-text-primary)] group-hover:text-[var(--heyroq-accent-text)] transition-colors`}>
                  Privacy Policy
                </h3>
                <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] mt-2`}>
                  Details on Firebase Authentication, public profiles, Google Maps services, image
                  storage, and GDPR privacy rights.
                </p>
              </div>
              <span className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-accent-text)] inline-flex items-center gap-1.5`}>
                <span>Read Privacy Policy</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </AppLink>

            <AppLink
              to="/terms"
              className="liquid-glass-card group p-6 rounded-2xl hover:border-[var(--brand-primary)]/60 transition-colors flex flex-col justify-between gap-6 heyroq-focus-ring"
            >
              <div>
                <h3 className={`${TYPOGRAPHY_TOKENS.heading3} text-[var(--heyroq-text-primary)] group-hover:text-[var(--heyroq-accent-text)] transition-colors`}>
                  Terms of Service
                </h3>
                <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] mt-2`}>
                  Community rules, user-generated content permissions, location disclaimers,
                  reporting, and service terms.
                </p>
              </div>
              <span className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-accent-text)] inline-flex items-center gap-1.5`}>
                <span>Read Terms of Service</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </AppLink>

            <AppLink
              to="/support"
              className="liquid-glass-card group p-6 rounded-2xl hover:border-[var(--brand-primary)]/60 transition-colors flex flex-col justify-between gap-6 heyroq-focus-ring"
            >
              <div>
                <h3 className={`${TYPOGRAPHY_TOKENS.heading3} text-[var(--heyroq-text-primary)] group-hover:text-[var(--heyroq-accent-text)] transition-colors`}>
                  Help & Support
                </h3>
                <p className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] mt-2`}>
                  Account assistance, creating and managing pins, troubleshooting, privacy
                  requests, and direct support ({BRAND_LEGAL_SUPPORT.supportContact.proposedEmail}).
                </p>
              </div>
              <span className={`${TYPOGRAPHY_TOKENS.label} text-[var(--heyroq-accent-text)] inline-flex items-center gap-1.5`}>
                <span>Open Help & Support</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </AppLink>
          </div>
        </section>
      </div>
    </InfoPageLayout>
  );
};
