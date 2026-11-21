import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engagementDestination, groupNotifications, notificationDay, preferenceDefaults } from '../src/utils/engagement';

test('existing accounts have notifications on and activity sharing off', () => {
  assert.deepEqual(Object.entries(preferenceDefaults).filter(([key]) => key.startsWith('share')).map(([, enabled]) => enabled), [false, false, false]);
  assert.ok(Object.entries(preferenceDefaults).filter(([key]) => !key.startsWith('share')).every(([, enabled]) => enabled));
});

test('notification links use only validated IDs and known destinations', () => {
  assert.deepEqual(engagementDestination({ type: 'like', pinId: 'a-pin_12' }, 'me'), { type: 'pin', id: 'a-pin_12' });
  assert.equal(engagementDestination({ type: 'like', pinId: 'https://external.test' }, 'me'), null);
  assert.equal(engagementDestination({ type: 'pin', pinId: '../untrusted' }, 'me'), null);
  assert.equal(engagementDestination({ type: 'pin', pinId: 'removed', unavailable: true }, 'me'), null);
  assert.deepEqual(engagementDestination({ type: 'achievement', achievementId: 'gold_badge' }, 'me'), { type: 'progression', id: 'gold_badge' });
  assert.deepEqual(engagementDestination({ type: 'achievement', achievementId: 'gold_badge', actorId: 'explorer' }, 'me'), { type: 'profile', id: 'explorer' });
});

test('groups adjacent likes for the same pin and day while preserving per-notification actions', () => {
  const now = new Date();
  const earlier = new Date(now);
  earlier.setDate(now.getDate() - 2);
  const like = { type: 'like', pinId: 'one', at: +now };
  const groups = groupNotifications([
    { ...like, id: '1' }, { ...like, id: '2' }, { ...like, id: '3', type: 'comment' },
    { ...like, id: '4' }, { ...like, id: '5', at: +earlier },
  ]);
  assert.deepEqual(groups.map(group => group.map(row => row.id)), [['1', '2'], ['3'], ['4'], ['5']]);
  assert.equal(notificationDay(+now, now), 'Today');
  assert.equal(notificationDay(+earlier, now), 'Earlier');
  earlier.setDate(earlier.getDate() + 1);
  assert.equal(notificationDay(+earlier, now), 'Yesterday');
});
