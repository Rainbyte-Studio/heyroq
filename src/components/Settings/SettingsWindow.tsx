import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, ChevronRight, LogIn, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { type SettingsSection } from '../../utils/appRoutes';
import { AppWindow } from '../Common/AppWindow';
import { CloseButton } from '../Common/CloseButton';
import { AccountSecuritySection } from './AccountSecuritySection';
import { NotificationsSettingsSection } from './NotificationsSettingsSection';

export interface SettingsWindowProps {
  isOpen: boolean;
  activeSection: SettingsSection;
  mobileView: 'menu' | 'detail';
  onSelectSection: (section: SettingsSection) => void;
  onMobileBackToMenu: () => void;
  onClose: () => void;
  onAccountDeleted?: (deletedUid?: string) => void;
  onOpenHistory?: () => void;
  onOpenActivity?: () => void;
  onRequestAuth?: () => void;
  returnFocusElementId?: string;
  fallbackFocus?: () => void;
}

const SETTINGS_SECTIONS: ReadonlyArray<{
  readonly id: SettingsSection;
  readonly label: string;
  readonly summary: string;
  readonly Icon: typeof Shield;
}> = [
  {
    id: 'account',
    label: 'Account & Security',
    summary: 'Email, password, connected sign-in methods, and account deletion',
    Icon: Shield,
  },
  {
    id: 'notifications',
    label: 'Notifications & Activity',
    summary: 'In-app notifications and follower activity privacy',
    Icon: Bell,
  },
];

export const SettingsWindow: React.FC<SettingsWindowProps> = ({
  isOpen,
  activeSection,
  mobileView,
  onSelectSection,
  onMobileBackToMenu,
  onClose,
  onAccountDeleted,
  onOpenHistory,
  onOpenActivity,
  onRequestAuth,
  returnFocusElementId,
  fallbackFocus,
}) => {
  const { user, firebaseUser, profile, needsProfile, loading } = useAuth();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [stickyNavTop, setStickyNavTop] = useState(104);
  const [accountBusy, setAccountBusy] = useState({ isDeleting: false, isReauthing: false });

  const handleBusyChange = useCallback(
    (next: { isDeleting: boolean; isReauthing: boolean }) => setAccountBusy(next),
    []
  );

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [activeSection, mobileView, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const headerEl = headerRef.current;
    if (!headerEl) return;

    const updateNavOffset = () => {
      const height = Math.round(headerEl.getBoundingClientRect().height);
      if (height > 0) setStickyNavTop(height + 16);
    };

    updateNavOffset();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateNavOffset);
    observer.observe(headerEl);
    return () => observer.disconnect();
  }, [isOpen, mobileView, activeSection]);

  const isSignedIn = Boolean(
    user && firebaseUser && !firebaseUser.isAnonymous && profile?.id === firebaseUser.uid && !needsProfile
  );
  const currentMeta =
    SETTINGS_SECTIONS.find((item) => item.id === activeSection) ?? SETTINGS_SECTIONS[0];

  const renderSectionContent = () => {
    if (loading) {
      return (
        <div role="status" className="py-10 text-sm text-[var(--heyroq-text-secondary)]">
          Loading your account…
        </div>
      );
    }

    if (!isSignedIn || !firebaseUser) {
      return (
        <div className="py-6 space-y-4 max-w-md">
          <div className="space-y-1">
            <h3 className="font-heading text-base font-bold text-[var(--heyroq-text-primary)]">
              Sign in to manage settings
            </h3>
            <p className="text-xs sm:text-sm text-[var(--heyroq-text-secondary)] leading-relaxed">
              Sign in with your Heyroq account to update email, password, notification preferences, and activity privacy.
            </p>
          </div>
          {onRequestAuth && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRequestAuth();
              }}
              className="heyroq-btn-primary min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer heyroq-focus-ring"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      );
    }

    if (activeSection === 'account') {
      return (
        <AccountSecuritySection
          resetSignal={isOpen}
          onBusyStateChange={handleBusyChange}
          onAccountDeleted={() => {
            const deletedUid = firebaseUser.uid;
            onClose();
            onAccountDeleted?.(deletedUid);
          }}
        />
      );
    }

    return (
      <NotificationsSettingsSection
        uid={firebaseUser.uid}
        onOpenHistory={onOpenHistory}
        onOpenActivity={onOpenActivity}
      />
    );
  };

  return (
    <AppWindow
      id="heyroq-settings-window"
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="settings-window-title"
      ariaDescribedBy="settings-window-description"
      size="full"
      zIndexClass="z-[55]"
      disableClose={accountBusy.isDeleting || accountBusy.isReauthing}
      initialFocusRef={closeButtonRef}
      returnFocusElementId={returnFocusElementId}
      fallbackFocus={fallbackFocus}
    >
      {/* Single Scroll Container — mirrors Help & Support (InfoPageLayout) so content scrolls underneath the sticky translucent header */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto subtle-glass-scrollbar flex flex-col"
      >
        {/* Window Header — reuses Help & Support's exact .liquid-glass-nav translucent sticky header */}
        <header
          ref={headerRef}
          className="liquid-glass-nav sticky top-0 z-20 shrink-0 px-4 sm:px-6 py-4 sm:py-5 flex items-start justify-between gap-3"
        >
          <div className="min-w-0 flex-1">
            {/* Mobile Detail Back Navigation (< md) */}
            {mobileView === 'detail' && (
              <div className="md:hidden mb-2">
                <button
                  id="settings-mobile-back-btn"
                  type="button"
                  onClick={onMobileBackToMenu}
                  disabled={accountBusy.isDeleting}
                  className="heyroq-focus-ring -ml-2 px-2 py-1 min-h-[40px] rounded-xl inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.07] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Settings</span>
                </button>
              </div>
            )}

            <h2
              id="settings-window-title"
              className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-[var(--heyroq-text-primary)] truncate"
            >
              <span className="hidden md:inline">Settings</span>
              <span className="md:hidden">
                {mobileView === 'detail' ? currentMeta.label : 'Settings'}
              </span>
            </h2>
            <p
              id="settings-window-description"
              className="text-xs sm:text-sm text-[var(--heyroq-text-secondary)] mt-0.5 leading-relaxed"
            >
              <span className="hidden md:inline">
                Manage your account, security, notifications and privacy.
              </span>
              <span className="md:hidden">
                {mobileView === 'detail'
                  ? currentMeta.summary
                  : 'Manage your account, security, notifications and privacy.'}
              </span>
            </p>
          </div>

          <CloseButton
            ref={closeButtonRef}
            id="close-settings-window-btn"
            onClick={onClose}
            disabled={accountBusy.isDeleting}
            ariaLabel="Close Settings"
            className="shrink-0 mt-0.5"
          />
        </header>

        {/* Desktop Two-Column Split Layout (>= md) */}
        <div className="hidden md:flex grow shrink-0 items-stretch">
          <nav
            aria-label="Settings sections"
            className="w-[224px] lg:w-[244px] shrink-0 border-r border-slate-900/8 dark:border-white/10 p-3.5 lg:p-4"
          >
            <ul className="sticky space-y-1" style={{ top: `${stickyNavTop}px` }}>
              {SETTINGS_SECTIONS.map(({ id, label, Icon }) => {
                const isActive = activeSection === id;
                return (
                  <li key={id}>
                    <button
                      id={`settings-nav-${id}`}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onSelectSection(id)}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left text-[13px] flex items-center gap-2.5 transition-colors cursor-pointer heyroq-focus-ring ${
                        isActive
                          ? 'bg-slate-900/[0.06] dark:bg-white/[0.09] text-[var(--heyroq-text-primary)] font-semibold'
                          : 'text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] font-medium'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--heyroq-text-muted)]'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex-1 min-w-0 px-6 lg:px-8 py-5 sm:py-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
            <div className="max-w-2xl">{renderSectionContent()}</div>
          </div>
        </div>

        {/* Mobile Single-Column Layout (< md) */}
        <div className="md:hidden grow shrink-0 px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {mobileView === 'menu' ? (
            <nav
              aria-label="Settings sections"
              className="liquid-glass-card rounded-2xl overflow-hidden divide-y divide-[var(--heyroq-border-subtle)]"
            >
              {SETTINGS_SECTIONS.map(({ id, label, summary, Icon }) => (
                <button
                  key={id}
                  id={`settings-mobile-nav-${id}`}
                  type="button"
                  onClick={() => onSelectSection(id)}
                  className="w-full min-h-[64px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] transition-colors cursor-pointer group heyroq-focus-ring"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center text-[var(--brand-primary)] shrink-0">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--heyroq-text-primary)] group-hover:text-[var(--heyroq-accent-text)] transition-colors">
                        {label}
                      </p>
                      <p className="text-xs text-[var(--heyroq-text-secondary)] mt-0.5 leading-snug">
                        {summary}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className="w-4 h-4 text-[var(--heyroq-text-muted)] group-hover:text-[var(--heyroq-accent-text)] group-hover:translate-x-0.5 transition-all shrink-0"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </nav>
          ) : (
            <div className="min-w-0">{renderSectionContent()}</div>
          )}
        </div>
      </div>
    </AppWindow>
  );
};
