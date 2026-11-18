import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  Check,
  ExternalLink,
  Mail,
  AlertCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { APP_VERSION, AppVersionConfig } from '../../config/version';
import {
  BRAND_IDENTITY,
  BRAND_LEGAL_SUPPORT,
  BrandLegalAndSupportConfig,
  OPERATOR_IDENTITY,
  PublicLegalResource,
  TYPOGRAPHY_TOKENS,
} from '../../config/brandConfig';
import { AppLink, AppRoute } from '../../utils/appRoutes';
import { Wordmark } from './Wordmark';
import { CloseButton } from './CloseButton';

export interface AboutHeyroqModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionConfig?: AppVersionConfig;
  legalConfig?: BrandLegalAndSupportConfig;
}

export const AboutHeyroqModal: React.FC<AboutHeyroqModalProps> = ({
  isOpen,
  onClose,
  versionConfig = APP_VERSION,
  legalConfig = BRAND_LEGAL_SUPPORT,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  // Manage accessible focus entry and reset collapsed disclosure state on close
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 30);

    return () => {
      clearTimeout(focusTimer);
      setCopiedDiagnostics(false);
      setIsTechnicalOpen(false);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  // Capture-phase Escape handler so closing About on top of Profile does not dismiss Profile underneath
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const commitDisplay = versionConfig.gitCommitSha ?? 'Not available';
  const buildDateDisplay = versionConfig.buildDateShort ?? 'Local workspace';

  const handleCopyBuildDiagnostics = async () => {
    const summaryLines = [
      `${versionConfig.productName} (${versionConfig.packageName})`,
      `Operated by: ${OPERATOR_IDENTITY.name} (${OPERATOR_IDENTITY.websiteUrl})`,
      `Version: ${versionConfig.version}`,
      `Release Channel: ${versionConfig.releaseChannel}`,
      `Build ID: ${versionConfig.buildId}`,
      `Git Commit: ${commitDisplay}`,
      `Build Date: ${versionConfig.buildDate ?? 'Unavailable'}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      setCopiedDiagnostics(true);
      setTimeout(() => setCopiedDiagnostics(false), 2000);
    } catch {
      setCopiedDiagnostics(false);
    }
  };

  const renderResourceRow = (resource: PublicLegalResource, idSuffix: string) => {
    const isMail = Boolean(resource.href?.startsWith('mailto:'));

    if (resource.status === 'verified' && resource.href) {
      if (resource.isInternalRoute) {
        return (
          <AppLink
            key={idSuffix}
            id={`about-resource-${idSuffix}`}
            to={resource.href as AppRoute}
            onBeforeNavigate={onClose}
            className="group min-h-[46px] px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] border-b border-[var(--heyroq-border-subtle)] last:border-b-0 heyroq-focus-ring"
          >
            <span className={`${TYPOGRAPHY_TOKENS.bodyMedium} text-[var(--heyroq-text-primary)]`}>
              {resource.label}
            </span>
            <ChevronRight
              className="w-4 h-4 text-[var(--heyroq-text-muted)] group-hover:text-[var(--heyroq-accent-text)] group-hover:translate-x-0.5 transition-all shrink-0"
              aria-hidden="true"
            />
          </AppLink>
        );
      }

      return (
        <a
          key={idSuffix}
          id={`about-resource-${idSuffix}`}
          href={resource.href}
          target={isMail ? undefined : '_blank'}
          rel={isMail ? undefined : 'noopener noreferrer'}
          className="group min-h-[46px] px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] border-b border-[var(--heyroq-border-subtle)] last:border-b-0 heyroq-focus-ring"
        >
          <span className={`${TYPOGRAPHY_TOKENS.bodyMedium} text-[var(--heyroq-text-primary)]`}>
            {resource.label}
          </span>
          {isMail ? (
            <Mail className="w-4 h-4 text-[var(--heyroq-text-muted)] shrink-0" aria-hidden="true" />
          ) : (
            <ExternalLink
              className="w-4 h-4 text-[var(--heyroq-text-muted)] shrink-0"
              aria-hidden="true"
            />
          )}
        </a>
      );
    }

    return (
      <div
        key={idSuffix}
        id={`about-resource-${idSuffix}`}
        className="min-h-[46px] px-3.5 py-2.5 flex items-center justify-between gap-3 border-b border-[var(--heyroq-border-subtle)] last:border-b-0"
      >
        <span className={`${TYPOGRAPHY_TOKENS.bodyMedium} text-[var(--heyroq-text-primary)]`}>
          {resource.label}
        </span>
        <span
          className={`${TYPOGRAPHY_TOKENS.caption} text-[var(--heyroq-text-muted)] inline-flex items-center gap-1.5`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
          <span>{resource.reviewNote || 'Pending verification'}</span>
        </span>
      </div>
    );
  };

  const modalContent = (
    <div
      id="about-heyroq-backdrop"
      onClick={onClose}
      className="liquid-glass-backdrop fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-heyroq-title"
      aria-describedby="about-heyroq-description"
    >
      <div
        id="about-heyroq-dialog"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-modal w-full sm:max-w-[440px] max-h-[92dvh] sm:max-h-[88vh] overflow-y-auto subtle-glass-scrollbar text-[var(--heyroq-text-primary)] rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 relative"
      >
        {/* Mobile grab handle */}
        <div
          className="w-10 h-1 rounded-full bg-slate-900/15 dark:bg-white/20 mx-auto mb-3 sm:hidden"
          aria-hidden="true"
        />

        {/* Close Button */}
        <CloseButton
          ref={closeButtonRef}
          id="close-about-heyroq-btn"
          onClick={onClose}
          ariaLabel="Close About Heyroq"
          className="absolute top-4 right-4"
        />

        {/* 1–4. Brand Wordmark, Version + Beta Pill, Memorable Headline & Concise Description */}
        <div className="pr-9">
          <div className="flex items-baseline gap-3 flex-wrap">
            <Wordmark id="about-heyroq-wordmark" size="modal" />
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--heyroq-text-muted)]">
              <span className="font-sans tabular-nums">{versionConfig.displayVersion}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[var(--heyroq-accent-text)]">
                {versionConfig.releaseChannel}
              </span>
            </span>
          </div>

          <h2
            id="about-heyroq-title"
            className={`${TYPOGRAPHY_TOKENS.heading2} text-[var(--heyroq-text-primary)] mt-3`}
          >
            Places worth remembering, shared by people who stood there.
          </h2>

          <p
            id="about-heyroq-description"
            className={`${TYPOGRAPHY_TOKENS.body} text-[var(--heyroq-text-secondary)] mt-1.5`}
          >
            {BRAND_IDENTITY.shortDescription}
          </p>
        </div>

        {/* 5. Four Clean Navigation Links */}
        <nav
          aria-label="Heyroq informational and legal pages"
          className="liquid-glass-card mt-5 rounded-2xl overflow-hidden"
        >
          {renderResourceRow(legalConfig.about, 'about-heyroq')}
          {renderResourceRow(legalConfig.privacyPolicy, 'privacy-policy')}
          {renderResourceRow(legalConfig.termsOfService, 'terms-of-service')}
          {renderResourceRow(legalConfig.supportContact, 'support-contact')}
        </nav>

        {/* Collapsed-by-default Technical Information Disclosure */}
        <div className="mt-4">
          <button
            id="about-technical-info-toggle"
            type="button"
            aria-expanded={isTechnicalOpen}
            aria-controls="about-technical-info-panel"
            onClick={() => setIsTechnicalOpen((prev) => !prev)}
            className="w-full min-h-[40px] px-2 py-1.5 rounded-xl flex items-center justify-between text-xs font-medium text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] transition-colors cursor-pointer heyroq-focus-ring"
          >
            <span>Technical Information</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-150 ${
                isTechnicalOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {isTechnicalOpen && (
            <div
              id="about-technical-info-panel"
              className="liquid-glass-card mt-2 rounded-2xl p-3.5 space-y-2.5"
            >
              <dl className="divide-y divide-[var(--heyroq-border-subtle)] text-xs">
                <div className="py-1.5 flex items-center justify-between gap-3">
                  <dt className="text-[var(--heyroq-text-muted)]">Version</dt>
                  <dd
                    id="about-version-value"
                    className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-primary)]`}
                  >
                    {versionConfig.version}
                  </dd>
                </div>
                <div className="py-1.5 flex items-center justify-between gap-3">
                  <dt className="text-[var(--heyroq-text-muted)]">Release Channel</dt>
                  <dd
                    id="about-channel-value"
                    className="font-medium text-[var(--heyroq-text-primary)]"
                  >
                    {versionConfig.releaseChannel} ({versionConfig.packageName})
                  </dd>
                </div>
                <div className="py-1.5 flex items-center justify-between gap-3">
                  <dt className="text-[var(--heyroq-text-muted)]">Build Identifier</dt>
                  <dd
                    id="about-build-id-value"
                    className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-primary)] text-right break-all`}
                  >
                    {versionConfig.buildId}
                  </dd>
                </div>
                <div className="py-1.5 flex items-center justify-between gap-3">
                  <dt className="text-[var(--heyroq-text-muted)]">Commit Revision</dt>
                  <dd className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-secondary)]`}>
                    {commitDisplay}
                  </dd>
                </div>
                <div className="py-1.5 flex items-center justify-between gap-3">
                  <dt className="text-[var(--heyroq-text-muted)]">Build Date</dt>
                  <dd className={`${TYPOGRAPHY_TOKENS.monoMeta} text-[var(--heyroq-text-secondary)]`}>
                    {buildDateDisplay}
                  </dd>
                </div>
              </dl>

              <button
                id="copy-build-info-btn"
                type="button"
                onClick={handleCopyBuildDiagnostics}
                className={`${TYPOGRAPHY_TOKENS.buttonSmall} w-full min-h-[38px] px-3 py-2 rounded-xl border border-[var(--heyroq-border-strong)] bg-slate-900/[0.03] dark:bg-white/[0.05] text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.07] dark:hover:bg-white/10 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer heyroq-focus-ring`}
              >
                {copiedDiagnostics ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                    <span>Copied Build Information</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy Build Information</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 6. Subtle Operator Attribution & Active Support Contact */}
        <div className="mt-4 pt-3.5 border-t border-[var(--heyroq-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-[var(--heyroq-text-muted)]">
          <p>
            Operated by{' '}
            <a
              href={OPERATOR_IDENTITY.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1 heyroq-focus-ring rounded"
            >
              <span>{OPERATOR_IDENTITY.name}</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </p>

          {legalConfig.supportContact.mailboxOperationalConfirmed &&
          legalConfig.supportContact.mailtoHref ? (
            <a
              id="about-support-mailto-link"
              href={legalConfig.supportContact.mailtoHref}
              className="font-medium text-xs text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1 heyroq-focus-ring rounded"
            >
              <Mail className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>{legalConfig.supportContact.proposedEmail}</span>
            </a>
          ) : (
            <span className="font-medium text-xs">{legalConfig.supportContact.proposedEmail}</span>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
