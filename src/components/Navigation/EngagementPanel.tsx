import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Activity, Bell, Check, Compass, Heart, MapPin, MessageCircle, Reply, Sparkles, Trophy, UserPlus, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { UserAvatar } from '../Common/UserAvatar';
import {
  changeNotification, loadEngagement, saveEngagementSetting, subscribeToEngagementSettings,
  type EngagementPage, type EngagementRow, type EngagementView,
} from '../../services/engagementService';
import { engagementDestination, groupNotifications, notificationDay, type PreferenceKey } from '../../utils/engagement';

const button = 'heyroq-focus-ring min-h-11 min-w-11 rounded-full px-3 font-semibold hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-55';
const secondary = 'text-[var(--heyroq-text-secondary)]';
const icons = {
  like: Heart, comment: MessageCircle, reply: Reply, follow: UserPlus, achievement: Trophy,
  level: Sparkles, geography: Compass, city: Compass, country: Compass, pin: MapPin, xp: Activity,
};
const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(at: number) {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return relative.format(-minutes, 'minute');
  if (minutes < 1440) return relative.format(-Math.floor(minutes / 60), 'hour');
  if (minutes < 10_080) return relative.format(-Math.floor(minutes / 1440), 'day');
  return fullDate.format(at);
}

function description(row: EngagementRow, view: EngagementView) {
  const actor = row.name || 'An explorer';
  const subject = view === 'following' ? actor : 'You';
  const spot = row.title || 'a spot';
  if (row.unavailable) return 'This activity is no longer available.';
  switch (row.type) {
    case 'like': return actor + ' liked ' + (row.title || 'your spot') + '.';
    case 'comment': return actor + ' commented on ' + (row.title || 'your spot') + '.';
    case 'reply': return actor + ' replied to your comment' + (row.title ? ' on ' + row.title : '') + '.';
    case 'follow': return actor + ' followed you.';
    case 'pin': return subject + ' published ' + spot + '.';
    case 'xp': return 'You earned ' + row.xp + ' XP' + (row.title ? ' for ' + row.title : '') + '.';
    case 'level': return 'You reached level ' + row.level + '.';
    case 'achievement': return subject + ' unlocked ' + (row.title || 'an achievement') + '.';
    case 'city': return subject + ' discovered ' + (row.title || 'a new city') + '.';
    case 'country': return subject + ' discovered ' + (row.title || 'a new country') + '.';
    case 'geography': return 'You earned a geography reward' + (row.title ? ' for ' + row.title : '') + '.';
    default: return row.title || 'Heyroq update';
  }
}

const settings: { key: PreferenceKey; title: string; detail?: string }[] = [
  { key: 'likes', title: 'Likes on my pins' },
  { key: 'comments', title: 'Comments on my pins' },
  { key: 'replies', title: 'Replies to my comments' },
  { key: 'follows', title: 'New followers' },
  { key: 'achievements', title: 'Achievement unlocks' },
  { key: 'levels', title: 'Level-ups' },
  { key: 'geography', title: 'Geography discoveries' },
  { key: 'announcements', title: 'Important product announcements' },
  { key: 'shareActivity', title: 'Show my public activity to followers', detail: 'Share your published public spots in Following Activity.' },
  { key: 'shareAchievements', title: 'Share major achievements', detail: 'Also show gold and platinum achievements while public activity sharing is on.' },
  { key: 'shareGeography', title: 'Share city and country discoveries', detail: 'Also show geography milestones linked to public spots while public activity sharing is on.' },
];

function EngagementSettings({ uid }: { uid: string }) {
  const [values, setValues] = useState<Record<PreferenceKey, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => subscribeToEngagementSettings(uid, (current, cached) => {
    setValues(current);
    setOffline(cached);
  }, () => setError('Settings could not load.')), [uid, attempt]);
  async function save(key: PreferenceKey, checked: boolean) {
    setSaving(true);
    setError('');
    try { await saveEngagementSetting(uid, key, checked); }
    catch { setError('Your preference could not be saved.'); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-5 px-4 py-3 sm:px-6">
      {error && <p role="alert">{error} <button className={button} onClick={() => { setError(''); setAttempt(n => n + 1); }}>Retry</button></p>}
      {!values && !error && <p role="status">Loading preferences…</p>}
      {values && <>
        <p role="status" className={'text-sm ' + secondary}>
          {offline ? 'Connect to the internet to change preferences.' : saving ? 'Saving…' : 'Preferences are synced across your devices.'}
        </p>
        {[settings.slice(0, 8), settings.slice(8)].map((group, index) => (
          <fieldset key={group[0].key} className="space-y-1">
            <legend className="mb-2 font-bold">{index ? 'Activity privacy' : 'In-app notifications'}</legend>
            {index === 1 && <p className={'mb-2 text-sm ' + secondary}>Sharing is off until you turn it on. My Activity is private.</p>}
            {group.map(({ key, title, detail }) => (
              <label key={key} className="flex min-h-12 items-center gap-4 rounded-xl bg-black/[.03] px-3 py-2 dark:bg-white/[.05]">
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {title}
                  {detail && <span id={'engagement-setting-' + key} className={'mt-1 block text-xs ' + secondary}>{detail}</span>}
                </span>
                <input type="checkbox" checked={values[key]} disabled={saving || offline}
                  aria-describedby={detail ? 'engagement-setting-' + key : undefined}
                  className="heyroq-focus-ring h-5 w-5 shrink-0 accent-[var(--brand-primary)]"
                  onChange={event => void save(key, event.currentTarget.checked)} />
              </label>
            ))}
          </fieldset>
        ))}
      </>}
    </div>
  );
}

type Props = {
  uid: string;
  view: EngagementView;
  setView: (value: EngagementView) => void;
  close: () => void;
  unread: number;
  revision: number;
  offline: boolean;
  openDestination: (destination: NonNullable<ReturnType<typeof engagementDestination>>) => Promise<boolean>;
  fallbackFocus: () => void;
};

export function EngagementPanel({ uid, view, setView, close, unread, revision, offline, openDestination, fallbackFocus }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [page, setPage] = useState<EngagementPage | null>(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const epoch = useRef(0);
  const heading = view === 'settings' ? 'Notifications & Activity' : view === 'following' || view === 'mine' ? 'Activity' : 'Notifications';
  const isInbox = view === 'inbox' || view === 'history';
  const action = isInbox ? 'inbox' : view === 'settings' ? null : view;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) trigger.focus();
      else fallbackFocus();
    };
  }, [fallbackFocus]);

  useEffect(() => {
    function update() { setOnline(navigator.onLine); }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const reload = useCallback(() => setRequest(n => n + 1), []);
  const inboxRevision = isInbox ? revision : 0;
  useEffect(() => {
    const number = ++epoch.current;
    setPage(null);
    setError('');
    setLoadingMore(false);
    if (action && online) {
      void loadEngagement(action).then(result => {
        if (epoch.current === number) setPage(result);
      }, () => {
        if (epoch.current === number) setError('This view could not load.');
      });
    }
    return () => { epoch.current++; };
  }, [uid, action, online, inboxRevision, request]);

  useEffect(() => {
    if (view !== 'following') return;
    function refresh() { if (document.visibilityState === 'visible') reload(); }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [view, reload]);

  async function more() {
    if (!page?.next || !action || loadingMore) return;
    const number = epoch.current;
    setLoadingMore(true);
    setError('');
    try {
      const next = await loadEngagement(action, page.next);
      if (epoch.current === number) setPage({ ...next, items: [...page.items, ...next.items] });
    } catch {
      if (epoch.current === number) setError('More activity could not load.');
    } finally {
      if (epoch.current === number) setLoadingMore(false);
    }
  }

  async function mutate(operation: 'read' | 'delete' | 'readAll', row?: EngagementRow) {
    setBusy(true);
    setError('');
    try { await changeNotification(operation, row?.id); }
    catch { setError('Your inbox could not be updated.'); }
    finally {
      setBusy(false);
      if (document.activeElement === document.body) closeRef.current?.focus();
    }
  }

  async function open(row: EngagementRow) {
    const destination = engagementDestination(row, uid);
    if (!destination) return;
    setBusy(true);
    try {
      if (!await openDestination(destination)) {
        setError('This activity is no longer available.');
        return;
      }
      if (isInbox && !row.read) await changeNotification('read', row.id).catch(() => {});
      close();
    } catch {
      setError('This activity could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  function renderRow(row: EngagementRow) {
    const Icon = icons[row.type as keyof typeof icons] || Bell;
    const text = description(row, view);
    const destination = engagementDestination(row, uid);
    const detail = <>
      <span className="flex min-h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
        {row.actorId && row.name && (view === 'following' || isInbox)
          ? <UserAvatar uid={row.actorId} displayName={row.name} imageUrl={row.avatar || undefined} size="sm" />
          : <Icon className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className={'block break-words ' + (isInbox && !row.read ? 'font-bold' : 'font-medium')}>{text}</span>
        <span className={'block text-xs ' + secondary}>
          {isInbox && !row.read && 'Unread · '}
          <time dateTime={new Date(row.at).toISOString()} title={fullDate.format(row.at)}>{relativeTime(row.at)}</time>
          {view === 'mine' && row.type !== 'xp' && Boolean(row.xp) && ' · +' + row.xp + ' XP'}
        </span>
      </span>
    </>;
    return (
      <li key={row.id} className="rounded-2xl border border-[var(--heyroq-border-subtle)] px-2 py-1">
        {destination ? (
          <button type="button" disabled={busy} onClick={() => void open(row)}
            className="heyroq-focus-ring flex w-full min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm">{detail}</button>
        ) : <div className="flex min-h-12 items-center gap-3 px-2 py-1.5 text-sm">{detail}</div>}
        {view === 'following' && row.actorId && row.name && destination?.type === 'pin' && (
          <button type="button" className={button + ' ml-[52px] text-xs ' + secondary}
            aria-label={'Open ' + row.name + '’s profile'}
            disabled={busy} onClick={() => void open({ ...row, pinId: undefined, achievementId: undefined })}>
            View profile
          </button>
        )}
        {isInbox && (
          <div className={'flex flex-wrap justify-end gap-x-1 text-xs ' + secondary}>
            {!row.read && <button className={button} type="button" disabled={busy || offline} onClick={() => void mutate('read', row)}>Mark as read</button>}
            <button className={button} type="button" disabled={busy || offline} onClick={() => void mutate('delete', row)}
              aria-label={'Delete notification. ' + text}>Delete</button>
          </div>
        )}
      </li>
    );
  }

  const groups = groupNotifications<EngagementRow>(page?.items ?? []);
  const compact = view === 'inbox';
  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); close(); }}
      className={'fixed m-0 max-h-none max-w-none overflow-hidden bg-[var(--heyroq-bg-surface)] text-[var(--heyroq-text-primary)] shadow-2xl backdrop:bg-black/40 ' +
        'inset-0 h-[100dvh] w-screen md:inset-auto md:rounded-3xl md:border md:border-[var(--heyroq-border-subtle)] ' +
        (compact ? 'md:top-16 md:right-5 md:h-auto md:max-h-[min(76vh,700px)] md:w-[420px]'
          : 'md:inset-0 md:m-auto md:h-[min(80dvh,780px)] md:w-[min(680px,90vw)]')}>
      <div className={'flex min-h-0 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:p-0 ' +
        (compact ? 'h-full md:h-auto md:max-h-[min(76vh,700px)]' : 'h-full')}>
        <header className="flex items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <h2 id={titleId} className="text-lg font-bold">{heading}</h2>
          <button ref={closeRef} className={button} type="button" aria-label={'Close ' + heading} onClick={close}><X className="h-5 w-5" /></button>
        </header>
        {isInbox && (
          <div className="flex flex-wrap items-center justify-between gap-x-2 px-4 text-xs sm:px-6">
            <button className={button} type="button" disabled={!unread || busy || offline} onClick={() => void mutate('readAll')}>
              <Check className="mr-1 inline h-4 w-4" aria-hidden /> Mark all as read
            </button>
            <button className={button} type="button" onClick={() => setView(compact ? 'history' : 'inbox')}>{compact ? 'View history' : 'Compact view'}</button>
          </div>
        )}
        {(view === 'following' || view === 'mine') && (
          <div role="group" aria-label="Activity timeline" className="flex gap-2 px-4 sm:px-6">
            {([['following', 'Following'], ['mine', 'My Activity']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}
                className={button + ' text-sm aria-pressed:bg-black/10 dark:aria-pressed:bg-white/15'}>{label}</button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {view === 'settings' ? <EngagementSettings uid={uid} /> : (
            <div className="px-4 pb-4 pt-2 sm:px-6">
              {!online && <p role="status">You’re offline. Connect to load {isInbox ? 'notifications' : 'activity'}.</p>}
              {error && <p role="alert" className="text-sm">{error} <button className={button} onClick={reload}>Retry</button></p>}
              {online && !page && !error && <p role="status" className={secondary}>Loading…</p>}
              {page?.limited && <p className={'mb-2 text-xs ' + secondary}>Showing activity from the 90 people you followed most recently.</p>}
              {page && !page.items.length && <p className={'py-7 text-center text-sm ' + secondary}>
                {isInbox ? 'You’re all caught up.' : view === 'following' ? 'No shared activity here yet.' : 'Your discoveries and milestones will appear here.'}
              </p>}
              {isInbox ? (
                ['Today', 'Yesterday', 'Earlier'].map(day => {
                  const dated = groups.filter(group => notificationDay(group[0].at) === day);
                  if (!dated.length) return null;
                  return <section key={day} aria-label={day} className="mb-3">
                    <h3 className={'mb-2 text-xs font-semibold ' + secondary}>{day}</h3>
                    <ul className="space-y-2">
                      {dated.map(group => group.length === 1 ? renderRow(group[0]) : (
                        <li key={group[0].id}>
                          <details className="rounded-2xl bg-black/5 px-3 dark:bg-white/10">
                            <summary className="heyroq-focus-ring flex min-h-11 cursor-pointer items-center rounded-xl text-sm font-semibold">
                              {group.length} likes on {group[0].title || 'your spot'}{group.some(row => !row.read) ? ' · Unread' : ''}
                            </summary>
                            <ul className="space-y-2 pb-2">{group.map(renderRow)}</ul>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </section>;
                })
              ) : <ol className="space-y-2">{page?.items.map(renderRow)}</ol>}
              {page?.next && <button className={button + ' mt-2 w-full text-sm'} disabled={loadingMore} onClick={() => void more()}>
                {loadingMore ? 'Loading more…' : 'Load more'}
              </button>}
            </div>
          )}
        </div>
      </div>
    </dialog>, document.body,
  );
}
