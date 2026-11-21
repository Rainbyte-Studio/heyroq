export const preferenceDefaults = {
  likes: true,
  comments: true,
  replies: true,
  follows: true,
  achievements: true,
  levels: true,
  geography: true,
  announcements: true,
  shareActivity: false,
  shareAchievements: false,
  shareGeography: false,
};

export type PreferenceKey = keyof typeof preferenceDefaults;

export type NotificationFilterCategory = 'all' | 'social' | 'progression';

export type EngagementErrorKind =
  | 'unauthenticated'
  | 'permission-denied'
  | 'endpoint-unavailable'
  | 'index-required'
  | 'offline'
  | 'unknown';

export interface EngagementErrorInfo {
  kind: EngagementErrorKind;
  code: string;
  message: string;
  detail: string;
  recoverable: boolean;
}

export interface PreferenceDescriptor {
  readonly key: PreferenceKey;
  readonly title: string;
  readonly detail: string;
}

export const NOTIFICATION_PREFERENCE_ITEMS: ReadonlyArray<PreferenceDescriptor> = [
  {
    key: 'likes',
    title: 'Likes on my spots',
    detail: 'When someone likes a public spot you published.',
  },
  {
    key: 'comments',
    title: 'Comments on my spots',
    detail: 'When an explorer leaves a comment on one of your spots.',
  },
  {
    key: 'replies',
    title: 'Replies to my comments',
    detail: 'When someone replies directly to a comment you posted.',
  },
  {
    key: 'follows',
    title: 'New followers',
    detail: 'When another explorer starts following your profile.',
  },
  {
    key: 'achievements',
    title: 'Achievement unlocks',
    detail: 'When you unlock a new Explorer badge or milestone.',
  },
  {
    key: 'levels',
    title: 'Level-up notifications',
    detail: 'When your earned XP advances you to a new Explorer level.',
  },
  {
    key: 'geography',
    title: 'Geography discovery notifications',
    detail: 'When a verified spot rewards a new city or country discovery.',
  },
  {
    key: 'announcements',
    title: 'Platform announcements',
    detail: 'Important Heyroq product updates and release notices.',
  },
];

export const ACTIVITY_PRIVACY_ITEMS: ReadonlyArray<PreferenceDescriptor> = [
  {
    key: 'shareActivity',
    title: 'Share public activity with followers',
    detail: 'Allow people who follow you to see your newly published public spots in Following Activity.',
  },
  {
    key: 'shareAchievements',
    title: 'Share achievement milestones',
    detail: 'Include gold and platinum badge unlocks when public activity sharing is enabled.',
  },
  {
    key: 'shareGeography',
    title: 'Share city and country discoveries',
    detail: 'Include verified city and country discoveries linked to public spots when activity sharing is enabled.',
  },
];

const validId = (id?: string): id is string => Boolean(id && /^[a-zA-Z0-9_:-]{1,160}$/.test(id));

export function engagementDestination(
  row: {
    pinId?: string;
    achievementId?: string;
    actorId?: string;
    type: string;
    unavailable?: boolean;
  },
  uid: string
) {
  if (row.unavailable) return null;
  if (validId(row.pinId)) return { type: 'pin', id: row.pinId } as const;
  if ((row.type === 'achievement' && validId(row.achievementId)) || row.type === 'level') {
    if (validId(row.actorId) && row.actorId !== uid) {
      return { type: 'profile', id: row.actorId } as const;
    }
    return { type: 'progression', id: row.achievementId } as const;
  }
  if (validId(row.actorId)) return { type: 'profile', id: row.actorId } as const;
  return null;
}

export function notificationDay(at: number, now = new Date()) {
  const time = new Date(at).toDateString();
  if (time === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return time === yesterday.toDateString() ? 'Yesterday' : 'Earlier';
}

export function groupNotifications<T extends { id: string; type: string; at: number; pinId?: string }>(
  rows: T[]
) {
  const groups: T[][] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    const first = last?.[0];
    if (
      last &&
      first &&
      row.type === 'like' &&
      first.type === 'like' &&
      row.pinId &&
      first.pinId === row.pinId &&
      notificationDay(first.at) === notificationDay(row.at)
    ) {
      last.push(row);
    } else {
      groups.push([row]);
    }
  }
  return groups;
}

const SOCIAL_TYPES = new Set(['like', 'comment', 'reply', 'follow']);
const PROGRESSION_TYPES = new Set(['achievement', 'level', 'geography', 'city', 'country', 'xp']);

export function filterNotificationsByCategory<T extends { type: string }>(
  rows: readonly T[],
  filter: NotificationFilterCategory
): T[] {
  if (filter === 'all') return [...rows];
  if (filter === 'social') return rows.filter((row) => SOCIAL_TYPES.has(row.type));
  return rows.filter((row) => PROGRESSION_TYPES.has(row.type));
}

export function extractFirebaseErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown';
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim()) {
    return code.trim().toLowerCase();
  }
  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
      return 'permission-denied';
    }
    if (lower.includes('unauthenticated')) return 'unauthenticated';
    if (lower.includes('failed-precondition') || lower.includes('requires an index')) {
      return 'failed-precondition';
    }
    if (lower.includes('not-found') || lower.includes('404')) return 'not-found';
    if (lower.includes('offline') || lower.includes('network')) return 'unavailable';
  }
  return 'unknown';
}

export function classifyEngagementError(
  error: unknown,
  scope: 'callable' | 'settings' | 'state'
): EngagementErrorInfo {
  const rawCode = extractFirebaseErrorCode(error);
  const normalized = rawCode.replace(/^(functions|firestore|auth)\//, '');
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isBrowserOffline) {
    return {
      kind: 'offline',
      code: rawCode,
      message:
        scope === 'settings'
          ? 'You are offline. Reconnect to load your notification settings.'
          : 'You are offline. Reconnect to load notifications and activity.',
      detail: 'Network connection is currently unavailable.',
      recoverable: true,
    };
  }

  if (normalized === 'unauthenticated') {
    return {
      kind: 'unauthenticated',
      code: rawCode,
      message: 'Your session expired. Sign in again to continue.',
      detail: 'Firebase Authentication credentials were missing or expired.',
      recoverable: true,
    };
  }

  if (normalized === 'permission-denied') {
    if (scope === 'settings' || scope === 'state') {
      return {
        kind: 'permission-denied',
        code: rawCode,
        message:
          scope === 'settings'
            ? 'Notification settings could not load due to Firestore access rules.'
            : 'Notification inbox state could not sync due to Firestore access rules.',
        detail:
          'Firestore denied access to notificationPreferences/settings or notificationState/inbox. Verify your account is active and that the latest firestore.rules are deployed to the named database.',
        recoverable: true,
      };
    }
    return {
      kind: 'permission-denied',
      code: rawCode,
      message: 'Notifications and activity are not accessible for this account right now.',
      detail: 'The server rejected access because the account profile is inactive or locked.',
      recoverable: false,
    };
  }

  if (normalized === 'failed-precondition') {
    return {
      kind: 'index-required',
      code: rawCode,
      message: 'Notifications and activity are waiting on a required database index.',
      detail:
        'A required Firestore composite index from firestore.indexes.json is missing or still building in the named database.',
      recoverable: true,
    };
  }

  if (
    scope === 'callable' &&
    (normalized === 'not-found' || normalized === 'internal' || normalized === 'unavailable')
  ) {
    return {
      kind: 'endpoint-unavailable',
      code: rawCode,
      message: 'Notifications and activity are temporarily unavailable.',
      detail:
        'The engagementV1 callable function in europe-west2 could not be reached (not deployed or temporarily unreachable).',
      recoverable: true,
    };
  }

  if (normalized === 'unavailable' || normalized === 'deadline-exceeded') {
    return {
      kind: 'offline',
      code: rawCode,
      message:
        scope === 'settings'
          ? 'Settings could not load right now.'
          : 'Notifications and activity are temporarily unavailable.',
      detail: 'The Firebase service could not be reached. Please try again in a moment.',
      recoverable: true,
    };
  }

  return {
    kind: 'unknown',
    code: rawCode,
    message:
      scope === 'settings'
        ? 'Settings could not load.'
        : 'Notifications and activity could not load.',
    detail: `Unexpected error (${rawCode}). Check browser console diagnostics for details.`,
    recoverable: true,
  };
}

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatFullDate(at: number): string {
  return fullDateFormatter.format(at);
}

export function formatRelativeTime(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return relativeFormatter.format(-minutes, 'minute');
  if (minutes < 1440) return relativeFormatter.format(-Math.floor(minutes / 60), 'hour');
  if (minutes < 10_080) return relativeFormatter.format(-Math.floor(minutes / 1440), 'day');
  return fullDateFormatter.format(at);
}

export function formatEngagementDescription(
  row: {
    type: string;
    name?: string;
    title?: string;
    xp?: number | null;
    level?: number | null;
    unavailable?: boolean;
  },
  context: 'inbox' | 'history' | 'following' | 'mine'
): string {
  const actor = row.name || 'An explorer';
  const subject = context === 'following' ? actor : 'You';
  const spot = row.title || 'a spot';
  if (row.unavailable) return 'This activity is no longer available.';
  switch (row.type) {
    case 'like':
      return `${actor} liked ${row.title || 'your spot'}.`;
    case 'comment':
      return `${actor} commented on ${row.title || 'your spot'}.`;
    case 'reply':
      return `${actor} replied to your comment${row.title ? ` on ${row.title}` : ''}.`;
    case 'follow':
      return `${actor} followed you.`;
    case 'pin':
      return `${subject} published ${spot}.`;
    case 'xp':
      return `You earned ${row.xp} XP${row.title ? ` for ${row.title}` : ''}.`;
    case 'level':
      return `You reached level ${row.level}.`;
    case 'achievement':
      return `${subject} unlocked ${row.title || 'an achievement'}.`;
    case 'city':
      return `${subject} discovered ${row.title || 'a new city'}.`;
    case 'country':
      return `${subject} discovered ${row.title || 'a new country'}.`;
    case 'geography':
      return `You earned a geography reward${row.title ? ` for ${row.title}` : ''}.`;
    default:
      return row.title || 'Heyroq update';
  }
}
