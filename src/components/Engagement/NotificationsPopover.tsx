import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
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
import { UserAvatar } from '../Common/UserAvatar';
import { CloseButton } from '../Common/CloseButton';
import {
  changeNotification,
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
  groupNotifications,
  notificationDay,
  type EngagementErrorInfo,
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

export interface NotificationsPopoverProps {
  uid: string;
  unread: number;
  revision: number;
  offline: boolean;
  listenerReady: boolean;
  retryListener: () => void;
  close: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  openDestination: (
    destination: NonNullable<ReturnType<typeof engagementDestination>>,
    signal: AbortSignal
  ) => Promise<boolean>;
  fallbackFocus: () => void;
}

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  uid,
  unread,
  revision,
  offline,
  listenerReady,
  retryListener,
  close,
  onOpenSettings,
  onOpenHistory,
  openDestination,
  fallbackFocus,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [page, setPage] = useState<EngagementPage | null>(null);
  const [errorInfo, setErrorInfo] = useState<EngagementErrorInfo | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const epoch = useRef(0);
  const navigation = useRef<AbortController | null>(null);
  const [positionStyle, setPositionStyle] = useState<{ top: number; right: number }>({
    top: 64,
    right: 16,
  });

  // Restore focus cleanly on unmount
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      navigation.current?.abort();
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      } else {
        fallbackFocus();
      }
    };
  }, [fallbackFocus]);

  // Anchor compact desktop popover cleanly beneath #nav-notifications-btn
  useLayoutEffect(() => {
    function updatePosition() {
      const bell = document.getElementById('nav-notifications-btn');
      if (!bell) return;
      const rect = bell.getBoundingClientRect();
      setPositionStyle({
        top: Math.round(rect.bottom + 8),
        right: Math.max(12, Math.round(window.innerWidth - rect.right)),
      });
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, []);

  // Dismiss on Escape or click outside (desktop popover)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const bell = document.getElementById('nav-notifications-btn');
      if (panelRef.current?.contains(target) || bell?.contains(target)) {
        return;
      }
      close();
    }
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [close]);

  // Browser online/offline tracking
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

  const reload = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
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
  }, [uid, online, revision, request]);

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

  async function openRow(row: EngagementRow) {
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

  function goToSettings() {
    close();
    onOpenSettings();
  }

  function goToHistory() {
    close();
    onOpenHistory();
  }

  function renderRow(row: EngagementRow) {
    const Icon = TYPE_ICONS[row.type as keyof typeof TYPE_ICONS] || Bell;
    const text = formatEngagementDescription(row, 'inbox');
    const destination = engagementDestination(row, uid);
    const isUnread = !row.read;

    const innerContent = (
      <>
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--heyroq-bg-elevated)] border border-[var(--heyroq-border-subtle)]">
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
            className={`block text-[13px] leading-snug [overflow-wrap:anywhere] text-[var(--heyroq-text-primary)] ${
              isUnread ? 'font-semibold' : 'font-normal'
            }`}
          >
            {text}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--heyroq-text-secondary)]">
            {isUnread && <span className="font-semibold text-[var(--heyroq-accent-text)]">Unread · </span>}
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
        className={`rounded-xl transition-colors ${
          isUnread
            ? 'bg-[var(--brand-primary)]/[0.08]'
            : 'hover:bg-[var(--heyroq-bg-subtle)]'
        }`}
      >
        {destination ? (
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => void openRow(row)}
            className="heyroq-focus-ring flex w-full min-h-[48px] items-start gap-3 rounded-xl px-2.5 py-2 text-left cursor-pointer disabled:opacity-60"
          >
            {innerContent}
          </button>
        ) : (
          <div className="flex min-h-[48px] items-start gap-3 px-2.5 py-2">{innerContent}</div>
        )}

        <div className="flex items-center justify-end gap-1 px-2 pb-1.5 text-xs text-[var(--heyroq-text-secondary)]">
          {isUnread && (
            <button
              type="button"
              disabled={busy || offline || !online}
              onClick={() => void mutate('read', row)}
              className="heyroq-focus-ring min-h-[36px] md:min-h-[28px] px-2 rounded-lg font-medium hover:text-[var(--heyroq-text-primary)] hover:bg-[var(--heyroq-bg-subtle)] transition cursor-pointer disabled:opacity-45"
            >
              Mark as read
            </button>
          )}
          <button
            type="button"
            disabled={busy || offline || !online}
            onClick={() => void mutate('delete', row)}
            aria-label={`Delete notification. ${text}`}
            className="heyroq-focus-ring min-h-[36px] md:min-h-[28px] px-2 rounded-lg font-medium hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--heyroq-bg-subtle)] inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-45"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </li>
    );
  }

  const groups = groupNotifications<EngagementRow>(page?.items ?? []);
  const isOffline = !online || offline;

  return createPortal(
    <div
      ref={panelRef}
      id="heyroq-notifications-popover"
      role="dialog"
      aria-labelledby={titleId}
      style={
        {
          '--inbox-top': `${positionStyle.top}px`,
          '--inbox-right': `${positionStyle.right}px`,
        } as React.CSSProperties
      }
      className="fixed z-50 inset-0 h-[100dvh] w-full flex flex-col bg-[var(--heyroq-bg-surface)] text-[var(--heyroq-text-primary)] md:inset-auto md:top-[var(--inbox-top)] md:right-[var(--inbox-right)] md:h-auto md:w-[384px] md:max-h-[min(540px,calc(100dvh-var(--inbox-top)-16px))] md:rounded-2xl md:border md:border-[var(--glass-border-strong)] md:shadow-[var(--heyroq-shadow-popover)] overflow-hidden"
    >
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between gap-2 border-b border-[var(--heyroq-border-subtle)] px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
        <div className="min-w-0 flex items-baseline gap-2">
          <h2 id={titleId} className="font-heading text-base font-semibold tracking-tight">
            Notifications
          </h2>
          {unread > 0 && (
            <span className="text-xs font-semibold text-[var(--heyroq-accent-text)] tabular-nums">
              {unread > 99 ? '99+' : unread} unread
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            id="notifications-popover-settings-btn"
            type="button"
            onClick={goToSettings}
            aria-label="Notification settings"
            title="Notification settings"
            className="heyroq-focus-ring w-11 h-11 md:w-9 md:h-9 rounded-full flex items-center justify-center text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-[var(--heyroq-bg-subtle)] transition cursor-pointer"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>
          <CloseButton
            ref={closeRef}
            onClick={close}
            ariaLabel="Close Notifications"
          />
        </div>
      </header>

      {/* Compact Action Bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[var(--heyroq-border-subtle)] px-4 py-2 text-xs bg-[var(--heyroq-bg-canvas)]/60">
        <button
          type="button"
          disabled={!unread || busy || isOffline}
          onClick={() => void mutate('readAll')}
          className="heyroq-focus-ring min-h-[36px] md:min-h-[30px] px-2 -ml-2 rounded-lg font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Mark all as read</span>
        </button>

        <button
          id="notifications-popover-view-history-btn"
          type="button"
          onClick={goToHistory}
          className="heyroq-focus-ring min-h-[36px] md:min-h-[30px] px-2 -mr-2 rounded-lg font-semibold text-[var(--heyroq-accent-text)] hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          <span>View history</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain subtle-glass-scrollbar px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-3"
      >
        {!online && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-[var(--heyroq-border-subtle)] bg-[var(--heyroq-bg-canvas)] p-3.5 text-xs text-[var(--heyroq-text-secondary)]"
          >
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-[var(--heyroq-status-warning)]" aria-hidden="true" />
            <span>You’re offline. Connect to load notifications.</span>
          </div>
        )}

        {errorInfo && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3.5 space-y-2.5"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle
                className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400"
                aria-hidden="true"
              />
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--heyroq-text-primary)]">
                  {errorInfo.message}
                </p>
                <p className="text-[11px] text-[var(--heyroq-text-secondary)] leading-relaxed">
                  {errorInfo.detail}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-6">
              <button
                type="button"
                onClick={() => {
                  if (!listenerReady) retryListener();
                  reload();
                }}
                className="heyroq-btn-secondary min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer heyroq-focus-ring"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={goToSettings}
                className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] cursor-pointer heyroq-focus-ring"
              >
                Settings
              </button>
            </div>
          </div>
        )}

        {online && !page && !errorInfo && (
          <div role="status" className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[var(--heyroq-text-secondary)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
            <span>Loading notifications…</span>
          </div>
        )}

        {page && !page.items.length && !errorInfo && (
          <div className="py-10 px-4 text-center space-y-1.5">
            <Bell className="w-5 h-5 mx-auto text-[var(--heyroq-text-muted)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--heyroq-text-primary)]">
              You’re all caught up
            </p>
            <p className="text-xs text-[var(--heyroq-text-secondary)]">
              Likes, comments, new followers, and milestone unlocks will show up here.
            </p>
          </div>
        )}

        {page && page.items.length > 0 && (
          <div className="space-y-4">
            {(['Today', 'Yesterday', 'Earlier'] as const).map((day) => {
              const dated = groups.filter((group) => notificationDay(group[0].at) === day);
              if (!dated.length) return null;
              return (
                <section key={day} aria-label={day} className="space-y-1.5">
                  <h3 className="px-2 text-[11px] font-semibold text-[var(--heyroq-text-muted)]">
                    {day}
                  </h3>
                  <ul className="space-y-1">
                    {dated.map((group) =>
                      group.length === 1 ? (
                        renderRow(group[0])
                      ) : (
                        <li key={group[0].id}>
                          <details className="rounded-xl bg-[var(--heyroq-bg-elevated)]/65 px-2.5 py-1">
                            <summary className="heyroq-focus-ring flex min-h-[42px] cursor-pointer items-center justify-between gap-2 rounded-lg text-[13px] font-semibold text-[var(--heyroq-text-primary)]">
                              <span className="truncate">
                                {group.length} likes on {group[0].title || 'your spot'}
                              </span>
                              {group.some((row) => !row.read) && (
                                <span className="text-[11px] font-semibold text-[var(--heyroq-accent-text)] shrink-0">
                                  Unread
                                </span>
                              )}
                            </summary>
                            <ul className="space-y-1 pt-1 pb-1.5">{group.map(renderRow)}</ul>
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
                className="heyroq-btn-secondary w-full min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 heyroq-focus-ring"
              >
                {loadingMore ? 'Loading more…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
