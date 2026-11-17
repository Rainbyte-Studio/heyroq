import React, { useEffect, useRef } from 'react';
import { ArrowLeft, ExternalLink, Mail } from 'lucide-react';
import { APP_VERSION } from '../../config/version';
import {
  BRAND_IDENTITY,
  BRAND_LEGAL_SUPPORT,
  OPERATOR_IDENTITY,
  TYPOGRAPHY_TOKENS,
} from '../../config/brandConfig';
import { AppLink, INFO_PAGE_NAV_ITEMS, InfoPageRoute } from '../../utils/appRoutes';
import { ThemePopoverButton, ThemeSelector } from '../Common/ThemeSelector';
import { Wordmark } from '../Common/Wordmark';

export interface PageTocItem {
  readonly id: string;
  readonly label: string;
}

export interface InfoPageLayoutProps {
  activeRoute: InfoPageRoute;
  kicker: string;
  title: string;
  lead: string;
  metaItems?: ReadonlyArray<string>;
  tocItems?: ReadonlyArray<PageTocItem>;
  children: React.ReactNode;
}

export const InfoPageLayout: React.FC<InfoPageLayoutProps> = ({
  activeRoute,
  kicker,
  title,
  lead,
  metaItems = [],
  tocItems = [],
  children,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to top cleanly whenever switching between /about, /privacy, /terms, and /support
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [activeRoute]);

  const handleJumpToSection = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    const targetEl = document.getElementById(sectionId);
    if (!targetEl) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    targetEl.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    targetEl.focus({ preventScroll: true });
  };

  return (
    <div
      id={`heyroq-info-page-${activeRoute.slice(1)}`}
      ref={scrollContainerRef}
      className="h-screen h-[100dvh] w-full overflow-y-auto subtle-glass-scrollbar bg-[var(--heyroq-bg-canvas)] text-[var(--heyroq-text-primary)] font-sans selection:bg-[var(--brand-primary)] selection:text-white flex flex-col"
    >
      {/* Keyboard Skip Link */}
      <a
        href="#info-page-main"
        onClick={(e) => handleJumpToSection(e, 'info-page-main')}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-[var(--brand-cta-bg)] focus:text-white focus:font-semibold focus:text-sm focus:shadow-xl"
      >
        Skip to main content
      </a>

      {/* Strict 3-Zone Sticky Liquid Glass Top Bar */}
      <header className="liquid-glass-nav sticky top-0 z-40 h-14 sm:h-16 shrink-0">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-8 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <AppLink
            to="/"
            aria-label="Heyroq — Return to interactive map"
            className="inline-flex items-center whitespace-nowrap shrink-0 heyroq-focus-ring rounded-md py-0.5"
          >
            <Wordmark size="header" />
          </AppLink>

          {/* Zone 2: 4 Concise Single-Line Navigation Links */}
          <nav
            aria-label="Informational and legal pages"
            className="hidden md:flex items-center gap-7"
          >
            {INFO_PAGE_NAV_ITEMS.map((item) => {
              const isCurrent = item.route === activeRoute;
              return (
                <AppLink
                  key={item.route}
                  to={item.route}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`${TYPOGRAPHY_TOKENS.nav} py-1 whitespace-nowrap shrink-0 transition-colors heyroq-focus-ring rounded ${
                    isCurrent
                      ? 'text-[var(--heyroq-text-primary)] underline decoration-[var(--brand-primary)] decoration-2 underline-offset-8'
                      : 'text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] hover:underline hover:decoration-[var(--heyroq-border-strong)] hover:underline-offset-8'
                  }`}
                >
                  {item.shortLabel}
                </AppLink>
              );
            })}
          </nav>

          {/* Zone 3: Appearance Switcher + Back to Map */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ThemePopoverButton id="info-header-appearance-btn" />
            <AppLink
              id="info-header-back-to-map"
              to="/"
              className={`${TYPOGRAPHY_TOKENS.buttonSmall} heyroq-btn-primary min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0 heyroq-focus-ring`}
            >
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Back to Map</span>
            </AppLink>
          </div>
        </div>
      </header>

      {/* Non-sticky Mobile / Narrow-Tablet Page Switcher */}
      <nav
        aria-label="Mobile informational navigation"
        className="md:hidden border-b border-[var(--heyroq-border-subtle)] bg-[var(--heyroq-bg-surface)]"
      >
        <div className="max-w-6xl mx-auto px-4 py-1.5 flex items-center gap-5 overflow-x-auto no-scrollbar">
          {INFO_PAGE_NAV_ITEMS.map((item) => {
            const isCurrent = item.route === activeRoute;
            return (
              <AppLink
                key={item.route}
                to={item.route}
                aria-current={isCurrent ? 'page' : undefined}
                className={`${TYPOGRAPHY_TOKENS.nav} min-h-[44px] inline-flex items-center whitespace-nowrap shrink-0 transition-colors heyroq-focus-ring rounded px-1 ${
                  isCurrent
                    ? 'text-[var(--heyroq-text-primary)] underline decoration-[var(--brand-primary)] decoration-2 underline-offset-8'
                    : 'text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)]'
                }`}
              >
                {item.fullTitle}
              </AppLink>
            );
          })}
        </div>
      </nav>

      {/* Main Editorial Content */}
      <main
        id="info-page-main"
        tabIndex={-1}
        className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 pt-10 sm:pt-14 pb-16 sm:pb-24 focus:outline-none"
      >
        {/* Editorial Hero Header */}
        <header className="pb-8 sm:pb-10 border-b border-[var(--heyroq-border-subtle)]">
          <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-accent-text)] font-semibold`}>
            {kicker}
          </p>

          <h1
            className={`${TYPOGRAPHY_TOKENS.headingDisplay} text-[var(--heyroq-text-primary)] mt-2.5 max-w-3xl`}
          >
            {title}
          </h1>

          <p
            className={`${TYPOGRAPHY_TOKENS.bodyLarge} text-[var(--heyroq-text-secondary)] mt-4 max-w-2xl`}
          >
            {lead}
          </p>

          {metaItems.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--heyroq-text-muted)]">
              {metaItems.map((meta, idx) => (
                <React.Fragment key={meta}>
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <span>{meta}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </header>

        {/* Body Grid: Optional Desktop Sticky TOC + Comfortable Reading Column */}
        {tocItems.length > 0 ? (
          <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-10 xl:gap-16 items-start">
            <aside
              aria-label="On this page"
              className="lg:sticky lg:top-24 pb-6 lg:pb-0 border-b lg:border-b-0 border-[var(--heyroq-border-subtle)]"
            >
              <p className={`${TYPOGRAPHY_TOKENS.caption} font-semibold text-[var(--heyroq-text-muted)] mb-3`}>
                On this page
              </p>
              <ul className="space-y-1">
                {tocItems.map((item, idx) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(e) => handleJumpToSection(e, item.id)}
                      className="py-1.5 text-[13px] leading-snug text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] transition-colors flex items-baseline gap-2 heyroq-focus-ring rounded"
                    >
                      <span className="font-medium text-[11px] text-[var(--heyroq-text-muted)] tabular-nums shrink-0">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <span>{item.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="min-w-0 max-w-[72ch]">{children}</div>
          </div>
        ) : (
          <div className="mt-10 sm:mt-12">{children}</div>
        )}
      </main>

      {/* Consistent Application & Operator Attribution Footer */}
      <footer className="border-t border-[var(--heyroq-border-subtle)] bg-[var(--heyroq-bg-surface)] shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-12">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 pb-8 border-b border-[var(--heyroq-border-subtle)]">
            <div className="max-w-md space-y-2">
              <AppLink
                to="/"
                className="inline-flex items-center heyroq-focus-ring rounded"
              >
                <Wordmark size="footer" />
              </AppLink>
              <p className={`${TYPOGRAPHY_TOKENS.bodyMedium} text-[var(--heyroq-text-primary)]`}>
                {BRAND_IDENTITY.brandAttribution}
              </p>
              <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-muted)]`}>
                {OPERATOR_IDENTITY.brandRelationship}{' '}
                <a
                  href={OPERATOR_IDENTITY.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1 heyroq-focus-ring rounded"
                >
                  <span>{OPERATOR_IDENTITY.websiteDisplay}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                </a>
              </p>
              {BRAND_LEGAL_SUPPORT.supportContact.mailboxOperationalConfirmed &&
                BRAND_LEGAL_SUPPORT.supportContact.mailtoHref && (
                  <p className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-muted)]`}>
                    Support:{' '}
                    <a
                      href={BRAND_LEGAL_SUPPORT.supportContact.mailtoHref}
                      className="font-medium text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1 heyroq-focus-ring rounded"
                    >
                      <Mail className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{BRAND_LEGAL_SUPPORT.supportContact.proposedEmail}</span>
                    </a>
                  </p>
                )}
            </div>

            <div className="flex flex-col sm:items-end gap-4">
              <div className="flex flex-wrap gap-x-7 gap-y-2 items-center">
                <AppLink
                  to="/"
                  className={`${TYPOGRAPHY_TOKENS.nav} min-h-[40px] inline-flex items-center text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:underline underline-offset-4 whitespace-nowrap heyroq-focus-ring rounded`}
                >
                  Interactive Map
                </AppLink>
                {INFO_PAGE_NAV_ITEMS.map((item) => (
                  <AppLink
                    key={item.route}
                    to={item.route}
                    aria-current={item.route === activeRoute ? 'page' : undefined}
                    className={`${TYPOGRAPHY_TOKENS.nav} min-h-[40px] inline-flex items-center whitespace-nowrap heyroq-focus-ring rounded ${
                      item.route === activeRoute
                        ? 'text-[var(--heyroq-text-primary)] underline decoration-[var(--brand-primary)] underline-offset-4'
                        : 'text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:underline underline-offset-4'
                    }`}
                  >
                    {item.fullTitle}
                  </AppLink>
                ))}
              </div>

              <div className="w-full sm:w-64">
                <ThemeSelector compact idPrefix="info-footer-theme" />
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--heyroq-text-muted)]">
            <p>
              © {new Date().getFullYear()} {BRAND_IDENTITY.productName} · Operated by{' '}
              <a
                href={OPERATOR_IDENTITY.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:underline heyroq-focus-ring rounded"
              >
                {OPERATOR_IDENTITY.name}
              </a>
            </p>
            <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-[11px] text-[var(--heyroq-text-muted)]">
              <span>{APP_VERSION.packageName}</span>
              <span aria-hidden="true">·</span>
              <span>{APP_VERSION.displayVersion}</span>
              <span aria-hidden="true">·</span>
              <span>{APP_VERSION.releaseChannel}</span>
              <span aria-hidden="true">·</span>
              <span>Build {APP_VERSION.buildId}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
