import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bell,
  Check,
  Compass,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Reply,
  Settings,
  Sparkles,
  Trash2,
  Trophy,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import { AppWindow } from '../Common/AppWindow';
import { CloseButton } from '../Common/CloseButton';
import { UserAvatar } from '../Common/UserAvatar';
import {
  changeNotification,
  EngagementServiceError,
  loadEngagement,
  type EngagementPage,
  type EngagementRow,
} from '../../services/engagementService';
import {
  engagementDestination,
  filterNotificationsByCategory,
  formatEngagementDescription,
  formatFullDate,
  formatRelativeTime,
  groupNotifications,
  notificationDay,
  type EngagementErrorInfo,
  type NotificationFilterCategory,
} from '../../utils/engagement';

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

const FILTER_TABS: ReadonlyArray<{
  readonly id: NotificationFilterCategory;
  readonly label: string;
}> = [
  { id: 'all', label: 'All notifications' },
  { id: 'social', label: 'Social' },
  { id: 'progression', label: 'Achievements & progression' },
];

export interface NotificationsHistoryWindowProps {
  isOpen: boolean;
  uid: string;
  unread: number;
  revision: number;
  offline: boolean;
  listenerReady: boolean;
  retryListener: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
  openDestination: (
    destination: NonNullable<ReturnType<typeof engagementDestination>>,
    signal: AbortSignal
  ) => Promise<boolean>;
  returnFocusElementId?: string;
  fallbackFocus?: () => void;
}

export const NotificationsHistoryWindow: React.FC<NotificationsHistoryWindowProps> = ({
  isOpen,
  uid,
  unread,
  revision,
  offline,
  listenerReady,
  retryListener,
  onClose,
  onOpenSettings,
  openDestination,
  returnFocusElementId,
  fallbackFocus,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [filter, setFilter] = useState<NotificationFilterCategory>('all');
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

    void loadEngagement('inbox').then(
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
            message: 'Notifications are temporarily unavailable.',
            detail: 'Try again in a moment.',
            recoverable: true,
          });
        }
      }
    );
    return () => {
      epoch.current++;
    };
  }, [isOpen, uid, online, revision, request]);

  async function handleLoadMore() {
    if (!page?.next || loadingMore) return;
    const number = epoch.current;
    setLoadingMore(true);
    setErrorInfo(null);
    try {
      const next = await loadEngagement('inbox', page.next);
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
                message: 'More notifications could not load.',
                detail: 'Try again in a moment.',
                recoverable: true,
              }
        );
      }
    } finally {
      if (epoch.current === number) setLoadingMore(false);
    }
  }

  async function mutate(operation: 'read' | 'delete' | 'readAll', row?: EngagementRow) {
    setBusy(true);
    setErrorInfo(null);
    try {
      await changeNotification(operation, row?.id);
      if (!listenerReady) reload();
    } catch (err) {
      setErrorInfo(
        err instanceof EngagementServiceError
          ? err.info
          : {
              kind: 'unknown',
              code: 'unknown',
              message: 'Your inbox could not be updated.',
              detail: 'Try again in a moment.',
              recoverable: true,
            }
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenRow(row: EngagementRow) {
    const destination = engagementDestination(row, uid);
    if (!destination || !online) return;
    navigation.current?.abort();
    const controller = new AbortController();
    navigation.current = controller;
    setBusy(true);
    try {
      const opened = await openDestination(destination, controller.signal);
      if (!opened) {
        if (controller.signal.aborted) return;
        setErrorInfo({
          kind: 'unknown',
          code: 'not-found',
          message: 'This activity is no longer available.',
          detail: 'The spot or profile may have been removed or made private.',
          recoverable: false,
        });
        return;
      }
      if (!row.read) {
        await changeNotification('read', row.id).catch(() => {});
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

  const filteredItems = useMemo(
    () => filterNotificationsByCategory(page?.items ?? [], filter),
    [page?.items, filter]
  );
  const groups = useMemo(() => groupNotifications(filteredItems), [filteredItems]);
  const isOffline = !online || offline;

  function renderRow(row: EngagementRow) {
    const Icon = TYPE_ICONS[row.type as keyof typeof TYPE_ICONS] || Bell;
    const text = formatEngagementDescription(row, 'history');
    const destination = engagementDestination(row, uid);
    const isUnread = !row.read;

    const detail = (
      <>
        <span className="relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-[var(--heyroq-bg-elevated)] border border-[var(--heyroq-border-subtle)]">
          {row.actorId && row.name ? (
            <UserAvatar
              uid={row.actorId}
              displayName={row.name}
              imageUrl={row.avatar || undefined}
              size="sm"
            />
          ) : (
            <Icon className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
          )}
          {isUnread && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--brand-primary)] ring-2 ring-[var(--heyroq-bg-surface)]"
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-[13px] sm:text-sm leading-snug [overflow-wrap:anywhere] text-[var(--heyroq-text-primary)] ${
              isUnread ? 'font-semibold' : 'font-normal'
            }`}
          >
            {text}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--heyroq-text-secondary)]">
            {isUnread && (
              <span className="font-semibold text-[var(--heyroq-accent-text)]">Unread · </span>
            )}
            <time dateTime={new Date(row.at).toISOString()} title={formatFullDate(row.at)}>
              {formatRelativeTime(row.at)}
            </time>
          </span>
        </span>
      </>
    );

    return (
      <li
        key={row.id}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 sm:px-5 py-3 transition-colors ${
          isUnread ? 'bg-[var(--brand-primary)]/[0.06]' : 'hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04]'
        }`}
      >
        {destination ? (
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => void handleOpenRow(row)}
            className="heyroq-focus-ring flex flex-1 min-w-0 min-h-[44px] items-center gap-3 text-left rounded-xl cursor-pointer disabled:opacity-60"
          >
            {detail}
          </button>
        ) : (
          <div className="flex flex-1 min-w-0 min-h-[44px] items-center gap-3">{detail}</div>
        )}

        <div className="flex items-center justify-end gap-1.5 shrink-0 pl-11 sm:pl-0 text-xs text-[var(--heyroq-text-secondary)]">
          {isUnread && (
            <button
              type="button"
              disabled={busy || isOffline}
              onClick={() => void mutate('read', row)}
              className="heyroq-focus-ring min-h-[40px] sm:min-h-[34px] px-2.5 rounded-lg font-medium hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.08] transition cursor-pointer disabled:opacity-45 whitespace-nowrap"
            >
              Mark as read
            </button>
          )}
          <button
            type="button"
            disabled={busy || isOffline}
            onClick={() => void mutate('delete', row)}
            aria-label={`Delete notification. ${text}`}
            className="heyroq-focus-ring min-h-[40px] sm:min-h-[34px] px-2.5 rounded-lg font-medium hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.08] inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-45 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </li>
    );
  }

  return (
    <AppWindow
      id="heyroq-notifications-history-window"
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="notifications-history-title"
      ariaDescribedBy="notifications-history-description"
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
              id="notifications-history-title"
              className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-[var(--heyroq-text-primary)]"
            >
              Notifications
            </h2>
            <p
              id="notifications-history-description"
              className="text-xs sm:text-sm text-[var(--heyroq-text-secondary)] mt-0.5 leading-relaxed"
            >
              Review likes, comments, replies, followers, and Explorer milestones.
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              id="notifications-history-settings-btn"
              type="button"
              onClick={onOpenSettings}
              aria-label="Notification settings"
              title="Notification settings"
              className="liquid-glass-pill heyroq-focus-ring min-h-[40px] px-3 rounded-full text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <Settings className="w-3.5 h-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
              <span className="hidden sm:inline">Preferences</span>
            </button>
            <CloseButton
              ref={closeButtonRef}
              id="close-notifications-history-btn"
              onClick={onClose}
              ariaLabel="Close Notifications"
            />
          </div>
        </div>

        {/* Filter Tabs + Mark All Read */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div
            role="tablist"
            aria-label="Filter notification history"
            className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full"
          >
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setFilter(tab.id)}
                  className={`heyroq-focus-ring min-h-[40px] px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900/[0.08] dark:bg-white/[0.12] text-[var(--heyroq-text-primary)]'
                      : 'text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!unread || busy || isOffline}
            onClick={() => void mutate('readAll')}
            className="heyroq-focus-ring min-h-[38px] px-2.5 rounded-xl text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mark all as read</span>
          </button>
        </div>
      </header>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto subtle-glass-scrollbar px-4 sm:px-6 py-4 sm:py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-5">
        {!online && (
          <div
            role="status"
            className="liquid-glass-card rounded-2xl p-4 flex items-center gap-3 text-xs sm:text-sm text-[var(--heyroq-text-secondary)]"
          >
            <WifiOff className="w-4 h-4 shrink-0 text-[var(--heyroq-status-warning)]" aria-hidden="true" />
            <span>You’re offline. Connect to load notification history.</span>
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
              onClick={() => {
                if (!listenerReady) retryListener();
                reload();
              }}
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
            <span>Loading notification history…</span>
          </div>
        )}

        {page && filteredItems.length === 0 && !errorInfo && (
          <div className="py-12 px-4 text-center space-y-2">
            <Bell className="w-5 h-5 mx-auto text-[var(--heyroq-text-muted)]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
              {filter === 'all'
                ? 'You’re all caught up'
                : filter === 'social'
                  ? 'No social notifications yet'
                  : 'No achievement or progression notifications yet'}
            </p>
            <p className="text-xs text-[var(--heyroq-text-secondary)] max-w-sm mx-auto leading-relaxed">
              {filter === 'all'
                ? 'Recent notifications from the last 90 days appear here.'
                : 'Switch back to All notifications or explore more spots to see updates here.'}
            </p>
          </div>
        )}

        {page && filteredItems.length > 0 && (
          <div className="space-y-5">
            {(['Today', 'Yesterday', 'Earlier'] as const).map((day) => {
              const dated = groups.filter((group) => notificationDay(group[0].at) === day);
              if (!dated.length) return null;
              return (
                <section key={day} aria-label={day} className="space-y-2">
                  <h3 className="text-xs font-semibold text-[var(--heyroq-text-muted)] px-1">
                    {day}
                  </h3>
                  <ul className="liquid-glass-card rounded-2xl divide-y divide-[var(--heyroq-border-subtle)] overflow-hidden">
                    {dated.map((group) =>
                      group.length === 1 ? (
                        renderRow(group[0])
                      ) : (
                        <li key={group[0].id} className="px-4 sm:px-5 py-2.5">
                          <details>
                            <summary className="heyroq-focus-ring flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-lg text-sm font-semibold text-[var(--heyroq-text-primary)]">
                              <span>
                                {group.length} likes on {group[0].title || 'your spot'}
                              </span>
                              {group.some((row) => !row.read) && (
                                <span className="text-xs font-semibold text-[var(--heyroq-accent-text)] shrink-0">
                                  Unread
                                </span>
                              )}
                            </summary>
                            <ul className="mt-2 divide-y divide-[var(--heyroq-border-subtle)] border-t border-[var(--heyroq-border-subtle)]">
                              {group.map(renderRow)}
                            </ul>
                          </details>
                        </li>
                      )
                    )}
                  </ul>
                </section>
              );
            })}

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
