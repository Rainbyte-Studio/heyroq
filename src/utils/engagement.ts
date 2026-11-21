export const preferenceDefaults = {
  likes: true, comments: true, replies: true, follows: true,
  achievements: true, levels: true, geography: true, announcements: true,
  shareActivity: false, shareAchievements: false, shareGeography: false,
};

export type PreferenceKey = keyof typeof preferenceDefaults;
const validId = (id?: string): id is string => Boolean(id && /^[a-zA-Z0-9_:-]{1,160}$/.test(id));

export function engagementDestination(row: {
  pinId?: string; achievementId?: string; actorId?: string; type: string; unavailable?: boolean;
}, uid: string) {
  if (row.unavailable) return null;
  if (validId(row.pinId)) return { type: 'pin', id: row.pinId } as const;
  if ((row.type === 'achievement' && validId(row.achievementId)) || row.type === 'level') {
    if (validId(row.actorId) && row.actorId !== uid) return { type: 'profile', id: row.actorId } as const;
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

export function groupNotifications<T extends { id: string; type: string; at: number; pinId?: string }>(rows: T[]) {
  const groups: T[][] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    const first = last?.[0];
    if (last && first && row.type === 'like' && first.type === 'like' && row.pinId &&
      first.pinId === row.pinId && notificationDay(first.at) === notificationDay(row.at)) {
      last.push(row);
    } else groups.push([row]);
  }
  return groups;
}
