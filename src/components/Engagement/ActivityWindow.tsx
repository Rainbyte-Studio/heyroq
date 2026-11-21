import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Compass,
  Heart,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  RefreshCw,
  Reply,
  Settings,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import { AppWindow } from '../Common/AppWindow';
import { CloseButton } from '../Common/CloseButton';
import { UserAvatar } from '../Common/UserAvatar';
import {
  EngagementServiceError,
  loadEngagement,
  type EngagementPage,
  type EngagementRow,
} from '../../services/engagementService';
import {
  engagementDestination,
  formatEngagementDescription,
  formatFullDate,
  formatRelativeTime,
  type EngagementErrorInfo,
} from '../../utils/engagement';

type ActivityTab = 'following' | 'mine';

const TYPE_ICONS = {
  like: Heart,
  comment: MessageCircle,
  reply: Reply,
  follow: UserPlus,
  achievement: Trophy,
  level: Sparkles,
  geography: Compass,
  city: Compass,
  country: Compass,
  pin: MapPin,
  xp: Activity,
};

export interface ActivityWindowProps {
  isOpen: boolean;
  uid: string;
  onClose: () => void;
  onOpenSettings: () => void;
  openDestination: (
    destination: NonNullable<ReturnType<typeof engagementDestination>>,
    signal: AbortSignal
  ) => Promise<boolean>;
  returnFocusElementId?: string;
  fallbackFocus?: () => void;
}

export const ActivityWindow: React.FC<ActivityWindowProps> = ({
  isOpen,
  uid,
  onClose,
  onOpenSettings,
  openDestination,
  returnFocusElementId,
  fallbackFocus,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<ActivityTab>('following');
  const [page, setPage] = useState<EngagementPage | null>(null);
  const [errorInfo, setErrorInfo] = useState<EngagementErrorInfo | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const epoch = useRef(0);
  const navigation = useRef<AbortController | null>(null);

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    return () => {
      navigation.current?.abort();
    };
  }, []);

  const reload = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!isOpen || !uid) return;
    const number = ++epoch.current;
    setPage(null);
    setErrorInfo(null);
    setLoadingMore(false);
    if (!online) return () => { epoch.current++; };

    void loadEngagement(tab).then(
      (result) => {
        if (epoch.current === number) setPage(result);
      },
      (failure: unknown) => {
        if (epoch.current !== number) return;
        if (failure instanceof EngagementServiceError) {
          setErrorInfo(failure.info);
        } else {
          setErrorInfo({
            kind: 'unknown',
            code: 'unknown',
            message: 'Activity is temporarily unavailable.',
            detail: 'Try again in a moment.',
            recoverable: true,
          });
        }
      }
    );
    return () => {
      epoch.current++;
    };
  }, [isOpen, uid, tab, online, request]);

  // 30s visibility-aware refresh for Following Activity
  useEffect(() => {
    if (!isOpen || tab !== 'following' || !uid) return;
    function refresh() {
      if (document.visibilityState === 'visible') reload();
    }
    function visibilityChanged() {
      if (document.visibilityState === 'hidden') {
        epoch.current++;
        setPage(null);
      } else {
        refresh();
      }
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visibilityChanged);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.clearInterval(timer);
    };
  }, [isOpen, tab, uid, reload]);

  async function handleLoadMore() {
    if (!page?.next || loadingMore) return;
    const number = epoch.current;
    setLoadingMore(true);
    setErrorInfo(null);
    try {
      const next = await loadEngagement(tab, page.next);
      if (epoch.current === number) {
        setPage({ ...next, items: [...page.items, ...next.items] });
      }
    } catch (err) {
      if (epoch.current === number) {
        setErrorInfo(
          err instanceof EngagementServiceError
            ? err.info
            : {
                kind: 'unknown',
                code: 'unknown',
                message: 'More activity could not load.',
                detail: 'Try again in a moment.',
                recoverable: true,
              }
        );
      }
    } finally {
      if (epoch.current === number) setLoadingMore(false);
    }
  }

  async function handleOpenDestination(
    destination: NonNullable<ReturnType<typeof engagementDestination>>
  ) {
    if (!online) return;
    navigation.current?.abort();
    const controller = new AbortController();
    navigation.current = controller;
    setBusy(true);
    try {
      const opened = await openDestination(destination, controller.signal);
      if (!opened && !controller.signal.aborted) {
        setErrorInfo({
          kind: 'unknown',
          code: 'not-found',
          message: 'This activity is no longer available.',
          detail: 'The spot or profile may have been removed or made private.',
          recoverable: false,
        });
      }
    } catch {
      setErrorInfo({
        kind: 'unknown',
        code: 'unknown',
        message: 'This activity could not be opened.',
        detail: 'Please try again.',
        recoverable: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppWindow
      id="heyroq-activity-window"
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="activity-window-title"
      ariaDescribedBy="activity-window-description"
      size="full"
      zIndexClass="z-[55]"
      initialFocusRef={closeButtonRef}
      returnFocusElementId={returnFocusElementId}
      fallbackFocus={fallbackFocus}
    >
      {/* Window Header */}
      <header className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-900/8 dark:border-white/10 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="activity-window-title"
              className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-[var(--heyroq-text-primary)]"
            >
              Activity
            </h2>
            <p
              id="activity-window-description"
              className="text-xs sm:text-sm text-[var(--heyroq-text-secondary)] mt-0.5 leading-relaxed"
            >
              Public discoveries from explorers you follow and your private timeline.
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              id="activity-window-settings-btn"
              type="button"
              onClick={onOpenSettings}
              aria-label="Activity privacy settings"
              title="Activity privacy settings"
              className="liquid-glass-pill heyroq-focus-ring min-h-[40px] px-3 rounded-full text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <Settings className="w-3.5 h-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
              <span className="hidden sm:inline">Privacy</span>
            </button>
            <CloseButton
              ref={closeButtonRef}
              id="close-activity-window-btn"
              onClick={onClose}
              ariaLabel="Close Activity"
            />
          </div>
        </div>

        {/* Activity Section Tabs */}
        <div
          role="tablist"
          aria-label="Activity sections"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1"
        >
          <button
            role="tab"
            type="button"
            aria-selected={tab === 'following'}
            onClick={() => setTab('following')}
            className={`heyroq-focus-ring min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              tab === 'following'
                ? 'bg-slate-900/[0.08] dark:bg-white/[0.12] text-[var(--heyroq-text-primary)]'
                : 'text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05]'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Following Activity</span>
          </button>

          <button
            role="tab"
            type="button"
            aria-selected={tab === 'mine'}
            onClick={() => setTab('mine')}
            className={`heyroq-focus-ring min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              tab === 'mine'
                ? 'bg-slate-900/[0.08] dark:bg-white/[0.12] text-[var(--heyroq-text-primary)]'
                : 'text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05]'
            }`}
          >
            <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>My Activity</span>
          </button>
        </div>
      </header>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto subtle-glass-scrollbar px-4 sm:px-6 py-4 sm:py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
        <p className="text-xs text-[var(--heyroq-text-secondary)] leading-relaxed">
          {tab === 'following'
            ? 'Only explorers you follow who have opted in to activity sharing appear here. Private spots and restricted coordinates are never shown.'
            : 'Your personal timeline of published spots, XP awards, levels, and geography milestones from the last 90 days. Only visible to you.'}
        </p>

        {!online && (
          <div
            role="status"
            className="liquid-glass-card rounded-2xl p-4 flex items-center gap-3 text-xs sm:text-sm text-[var(--heyroq-text-secondary)]"
          >
            <WifiOff className="w-4 h-4 shrink-0 text-[var(--heyroq-status-warning)]" aria-hidden="true" />
            <span>You’re offline. Connect to load activity.</span>
          </div>
        )}

        {errorInfo && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/35 bg-rose-500/[0.08] p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle
                className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400"
                aria-hidden="true"
              />
              <div className="space-y-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[var(--heyroq-text-primary)]">
                  {errorInfo.message}
                </p>
                <p className="text-xs text-[var(--heyroq-text-secondary)] leading-relaxed">
                  {errorInfo.detail}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={reload}
              className="heyroq-btn-secondary min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap heyroq-focus-ring"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {online && !page && !errorInfo && (
          <div role="status" className="py-10 flex items-center gap-2.5 text-sm text-[var(--heyroq-text-secondary)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
            <span>Loading {tab === 'following' ? 'Following Activity' : 'My Activity'}…</span>
          </div>
        )}

        {page?.limited && tab === 'following' && (
          <p className="text-xs text-[var(--heyroq-text-muted)]">
            Showing activity from the 90 explorers you followed most recently.
          </p>
        )}

        {page && page.items.length === 0 && !errorInfo && (
          <div className="py-12 px-4 text-center space-y-2">
            <Activity className="w-5 h-5 mx-auto text-[var(--heyroq-text-muted)]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
              {tab === 'following' ? 'No shared activity here yet' : 'No personal activity recorded yet'}
            </p>
            <p className="text-xs text-[var(--heyroq-text-secondary)] max-w-sm mx-auto leading-relaxed">
              {tab === 'following'
                ? 'Follow more explorers or wait for people you follow to publish public spots with activity sharing enabled.'
                : 'Your published spots, earned XP, level-ups, and city or country discoveries will appear here.'}
            </p>
          </div>
        )}

        {page && page.items.length > 0 && (
          <div className="space-y-4">
            <ol className="liquid-glass-card rounded-2xl divide-y divide-[var(--heyroq-border-subtle)] overflow-hidden">
              {page.items.map((row: EngagementRow) => {
                const Icon = TYPE_ICONS[row.type as keyof typeof TYPE_ICONS] || Activity;
                const text = formatEngagementDescription(row, tab);
                const destination = engagementDestination(row, uid);

                const rowContent = (
                  <>
                    <span className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-[var(--heyroq-bg-elevated)] border border-[var(--heyroq-border-subtle)]">
                      {tab === 'following' && row.actorId && row.name ? (
                        <UserAvatar
                          uid={row.actorId}
                          displayName={row.name}
                          imageUrl={row.avatar || undefined}
                          size="sm"
                        />
                      ) : (
                        <Icon className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] sm:text-sm font-medium leading-snug text-[var(--heyroq-text-primary)] [overflow-wrap:anywhere]">
                        {text}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--heyroq-text-secondary)] tabular-nums">
                        <time dateTime={new Date(row.at).toISOString()} title={formatFullDate(row.at)}>
                          {formatRelativeTime(row.at)}
                        </time>
                        {tab === 'mine' && row.type !== 'xp' && Boolean(row.xp) && (
                          <span className="text-[var(--heyroq-accent-text)] font-medium">
                            {' '}
                            · +{row.xp} XP
                          </span>
                        )}
                      </span>
                    </span>
                  </>
                );

                return (
                  <li
                    key={row.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 sm:px-5 py-3 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                  >
                    {destination ? (
                      <button
                        type="button"
                        disabled={busy || !online}
                        onClick={() => void handleOpenDestination(destination)}
                        className="heyroq-focus-ring flex flex-1 min-w-0 min-h-[44px] items-center gap-3 text-left rounded-xl cursor-pointer disabled:opacity-60"
                      >
                        {rowContent}
                      </button>
                    ) : (
                      <div className="flex flex-1 min-w-0 min-h-[44px] items-center gap-3">
                        {rowContent}
                      </div>
                    )}

                    {tab === 'following' &&
                      row.actorId &&
                      row.name &&
                      destination?.type === 'pin' && (
                        <button
                          type="button"
                          disabled={busy || !online}
                          aria-label={`Open ${row.name}’s profile`}
                          onClick={() =>
                            void handleOpenDestination({ type: 'profile', id: row.actorId! })
                          }
                          className="heyroq-focus-ring min-h-[40px] sm:min-h-[34px] px-2.5 ml-11 sm:ml-0 rounded-lg text-xs font-medium text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.08] transition cursor-pointer shrink-0 whitespace-nowrap self-start sm:self-center"
                        >
                          View profile
                        </button>
                      )}
                  </li>
                );
              })}
            </ol>

            {page.next && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
                className="heyroq-btn-secondary w-full min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-50 heyroq-focus-ring"
              >
                {loadingMore ? 'Loading more…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </AppWindow>
  );
};
