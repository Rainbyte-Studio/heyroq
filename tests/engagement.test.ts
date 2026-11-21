import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTIVITY_PRIVACY_ITEMS,
  NOTIFICATION_PREFERENCE_ITEMS,
  classifyEngagementError,
  engagementDestination,
  filterNotificationsByCategory,
  groupNotifications,
  notificationDay,
  preferenceDefaults,
} from '../src/utils/engagement';
import {
  consumePendingMapDestination,
  getDocumentTitleForRoute,
  getSettingsSectionFromRoute,
  isEngagementPageRoute,
  isSettingsRoute,
  resolveAppRoute,
  setPendingMapDestination,
} from '../src/utils/appRoutes';

const ROOT = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('existing accounts have notifications on and activity sharing off', () => {
  assert.deepEqual(
    Object.entries(preferenceDefaults)
      .filter(([key]) => key.startsWith('share'))
      .map(([, enabled]) => enabled),
    [false, false, false]
  );
  assert.ok(
    Object.entries(preferenceDefaults)
      .filter(([key]) => !key.startsWith('share'))
      .every(([, enabled]) => enabled)
  );
  assert.equal(NOTIFICATION_PREFERENCE_ITEMS.length, 8);
  assert.equal(ACTIVITY_PRIVACY_ITEMS.length, 3);
});

test('notification links use only validated IDs and known destinations', () => {
  assert.deepEqual(engagementDestination({ type: 'like', pinId: 'a-pin_12' }, 'me'), { type: 'pin', id: 'a-pin_12' });
  assert.equal(engagementDestination({ type: 'like', pinId: 'https://external.test' }, 'me'), null);
  assert.equal(engagementDestination({ type: 'pin', pinId: '../untrusted' }, 'me'), null);
  assert.equal(engagementDestination({ type: 'pin', pinId: 'removed', unavailable: true }, 'me'), null);
  assert.deepEqual(engagementDestination({ type: 'achievement', achievementId: 'gold_badge' }, 'me'), {
    type: 'progression',
    id: 'gold_badge',
  });
  assert.deepEqual(
    engagementDestination({ type: 'achievement', achievementId: 'gold_badge', actorId: 'explorer' }, 'me'),
    { type: 'profile', id: 'explorer' }
  );
});

test('groups adjacent likes for the same pin and day while preserving per-notification actions', () => {
  const now = new Date();
  const earlier = new Date(now);
  earlier.setDate(now.getDate() - 2);
  const like = { type: 'like', pinId: 'one', at: +now };
  const groups = groupNotifications([
    { ...like, id: '1' },
    { ...like, id: '2' },
    { ...like, id: '3', type: 'comment' },
    { ...like, id: '4' },
    { ...like, id: '5', at: +earlier },
  ]);
  assert.deepEqual(
    groups.map((group) => group.map((row) => row.id)),
    [['1', '2'], ['3'], ['4'], ['5']]
  );
  assert.equal(notificationDay(+now, now), 'Today');
  assert.equal(notificationDay(+earlier, now), 'Earlier');
  earlier.setDate(earlier.getDate() + 1);
  assert.equal(notificationDay(+earlier, now), 'Yesterday');
});

test('filterNotificationsByCategory separates all, social, and progression notifications', () => {
  const rows = [
    { id: '1', type: 'like' },
    { id: '2', type: 'comment' },
    { id: '3', type: 'reply' },
    { id: '4', type: 'follow' },
    { id: '5', type: 'achievement' },
    { id: '6', type: 'level' },
    { id: '7', type: 'geography' },
    { id: '8', type: 'city' },
    { id: '9', type: 'country' },
    { id: '10', type: 'xp' },
    { id: '11', type: 'announcement' },
  ];

  assert.equal(filterNotificationsByCategory(rows, 'all').length, 11);
  assert.deepEqual(
    filterNotificationsByCategory(rows, 'social').map((row) => row.type),
    ['like', 'comment', 'reply', 'follow']
  );
  assert.deepEqual(
    filterNotificationsByCategory(rows, 'progression').map((row) => row.type),
    ['achievement', 'level', 'geography', 'city', 'country', 'xp']
  );
});

test('classifyEngagementError maps Firebase callable and Firestore errors into actionable diagnostics', () => {
  const notFound = classifyEngagementError({ code: 'functions/not-found' }, 'callable');
  assert.equal(notFound.kind, 'endpoint-unavailable');
  assert.match(notFound.detail, /engagementV1/i);

  const unavailable = classifyEngagementError({ code: 'functions/unavailable' }, 'callable');
  assert.equal(unavailable.kind, 'endpoint-unavailable');

  const unauth = classifyEngagementError({ code: 'functions/unauthenticated' }, 'callable');
  assert.equal(unauth.kind, 'unauthenticated');

  const indexErr = classifyEngagementError({ code: 'functions/failed-precondition' }, 'callable');
  assert.equal(indexErr.kind, 'index-required');
  assert.match(indexErr.detail, /firestore\.indexes\.json/i);

  const settingsPerm = classifyEngagementError({ code: 'permission-denied' }, 'settings');
  assert.equal(settingsPerm.kind, 'permission-denied');
  assert.match(settingsPerm.detail, /firestore\.rules/i);

  const statePerm = classifyEngagementError({ code: 'permission-denied' }, 'state');
  assert.equal(statePerm.kind, 'permission-denied');
  assert.match(statePerm.detail, /notificationState\/inbox/i);

  const callablePerm = classifyEngagementError({ code: 'functions/permission-denied' }, 'callable');
  assert.equal(callablePerm.kind, 'permission-denied');
  assert.equal(callablePerm.recoverable, false);
});

test('SPA routes synchronize unified Settings, Notifications History, and Activity windows', () => {
  assert.equal(resolveAppRoute('/settings'), '/settings');
  assert.equal(resolveAppRoute('/settings/account'), '/settings/account');
  assert.equal(resolveAppRoute('/settings/notifications'), '/settings/notifications');
  assert.equal(resolveAppRoute('/notifications'), '/notifications');
  assert.equal(resolveAppRoute('/activity'), '/activity');

  assert.equal(isSettingsRoute('/settings'), true);
  assert.equal(isSettingsRoute('/settings/account'), true);
  assert.equal(isSettingsRoute('/settings/notifications'), true);
  assert.equal(isSettingsRoute('/notifications'), false);

  assert.equal(getSettingsSectionFromRoute('/settings'), 'account');
  assert.equal(getSettingsSectionFromRoute('/settings/account'), 'account');
  assert.equal(getSettingsSectionFromRoute('/settings/notifications'), 'notifications');

  assert.equal(isEngagementPageRoute('/notifications'), true);
  assert.equal(isEngagementPageRoute('/activity'), true);
  assert.equal(isEngagementPageRoute('/settings'), false);

  assert.equal(getDocumentTitleForRoute('/settings'), 'Settings — Heyroq');
  assert.equal(getDocumentTitleForRoute('/settings/account'), 'Settings — Heyroq');
  assert.equal(
    getDocumentTitleForRoute('/settings/notifications'),
    'Notifications & Activity — Settings — Heyroq'
  );
  assert.equal(getDocumentTitleForRoute('/notifications'), 'Notifications — Heyroq');
  assert.equal(getDocumentTitleForRoute('/activity'), 'Activity — Heyroq');

  setPendingMapDestination({ type: 'pin', id: 'spot_42' });
  assert.deepEqual(consumePendingMapDestination(), { type: 'pin', id: 'spot_42' });
  assert.equal(consumePendingMapDestination(), null);
});

test('Unified SettingsWindow, NotificationsHistoryWindow, ActivityWindow, and NotificationsPopover align with Profile/About window architecture and preserve live map state', () => {
  const appWindow = readSource('src/components/Common/AppWindow.tsx');
  const settingsWindow = readSource('src/components/Settings/SettingsWindow.tsx');
  const notificationsPopover = readSource('src/components/Engagement/NotificationsPopover.tsx');
  const historyWindow = readSource('src/components/Engagement/NotificationsHistoryWindow.tsx');
  const activityWindow = readSource('src/components/Engagement/ActivityWindow.tsx');
  const navbar = readSource('src/components/Navigation/Navbar.tsx');
  const app = readSource('src/App.tsx');

  // Shared window architecture matching Profile & About Liquid Glass conventions
  assert.match(appWindow, /liquid-glass-backdrop/);
  assert.match(appWindow, /liquid-glass-modal/);
  assert.match(appWindow, /role="dialog"/);
  assert.match(appWindow, /aria-modal="true"/);
  assert.match(appWindow, /max-w-2xl sm:max-w-3xl lg:max-w-4xl/);
  assert.match(appWindow, /addEventListener\('keydown', handleKeyDown, true\)/);

  // Unified Settings window copy, sections, mobile back navigation & CloseButton
  assert.match(settingsWindow, /<AppWindow/);
  assert.match(settingsWindow, /<CloseButton/);
  assert.match(settingsWindow, /Settings/);
  assert.match(settingsWindow, /Manage your account, security, notifications and privacy\./);
  assert.match(settingsWindow, /Account & Security/);
  assert.match(settingsWindow, /Notifications & Activity/);
  assert.match(settingsWindow, /id="settings-mobile-back-btn"/);

  // Compact Notifications Popover remains anchored & triggers unified Settings + History window
  assert.match(notificationsPopover, /md:w-\[384px\]/);
  assert.match(notificationsPopover, /<CloseButton/);
  assert.match(notificationsPopover, /onOpenSettings/);
  assert.match(notificationsPopover, /onOpenHistory/);

  // Full-content Notification History & Activity windows reuse AppWindow + CloseButton
  assert.match(historyWindow, /<AppWindow/);
  assert.match(historyWindow, /<CloseButton/);
  assert.match(historyWindow, /All notifications/);
  assert.match(historyWindow, /Achievements & progression/);

  assert.match(activityWindow, /<AppWindow/);
  assert.match(activityWindow, /<CloseButton/);
  assert.match(activityWindow, /Following Activity/);
  assert.match(activityWindow, /My Activity/);

  // Navbar profile menu exposes unified Settings and Activity with focus restoration
  assert.match(navbar, /id="menu-settings-btn"/);
  assert.match(navbar, /id="menu-activity-btn"/);
  assert.match(navbar, /id="nav-notifications-btn"/);
  assert.match(navbar, /profileMenuButtonRef\.current\?\.focus/);

  // App keeps HeyroqMainApp mounted across window routes (preserving live map state)
  assert.match(app, /<SettingsWindow/);
  assert.match(app, /<NotificationsHistoryWindow/);
  assert.match(app, /<ActivityWindow/);
  assert.match(app, /<NotificationsPopover/);
  assert.match(app, /return <HeyroqMainApp activeRoute=\{activeRoute\} \/>/);
  assert.doesNotMatch(app, /EngagementPanel|SettingsPage|NotificationsHistoryPage|ActivityPage/);

  // Obsolete standalone pages & old EngagementPanel are removed
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/Navigation/EngagementPanel.tsx')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/Common/AppPageShell.tsx')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/Settings/SettingsPage.tsx')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/Engagement/NotificationsHistoryPage.tsx')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/Engagement/ActivityPage.tsx')), false);
});

test('Window headers, Profile sticky scroll & mobile actions, Profile dropdown tokens, and Notifications settings hover stay consistent', () => {
  const indexCss = readSource('src/index.css');
  const profile = readSource('src/components/Profile/UserProfileModal.tsx');
  const about = readSource('src/components/Common/AboutHeyroqModal.tsx');
  const settings = readSource('src/components/Settings/SettingsWindow.tsx');
  const history = readSource('src/components/Engagement/NotificationsHistoryWindow.tsx');
  const activity = readSource('src/components/Engagement/ActivityWindow.tsx');
  const achievements = readSource('src/components/Profile/AchievementsModal.tsx');
  const navbar = readSource('src/components/Navigation/Navbar.tsx');
  const popover = readSource('src/components/Engagement/NotificationsPopover.tsx');

  // 1. Shared translucent window header primitive derived from .liquid-glass-nav tokens
  assert.match(indexCss, /\.liquid-glass-nav,\s*\.heyroq-window-header\s*\{/);
  assert.ok(
    indexCss.includes('.liquid-glass-modal-surface'),
    'src/index.css must define .liquid-glass-modal-surface for sibling window backdrop layers'
  );
  const appWindow = readSource('src/components/Common/AppWindow.tsx');
  assert.match(
    appWindow,
    /liquid-glass-modal-surface absolute inset-0 rounded-\[inherit\] pointer-events-none/,
    'AppWindow must isolate its backdrop-filter on a sibling surface layer so sticky headers blur scrolled content natively'
  );
  assert.match(
    settings,
    /ref=\{scrollContainerRef\}[\s\S]*<header[\s\S]*className="liquid-glass-nav sticky top-0 z-20/,
    'SettingsWindow must reuse Help & Support .liquid-glass-nav sticky header inside its single scroll container'
  );
  for (const [name, src] of [
    ['UserProfileModal', profile],
    ['AboutHeyroqModal', about],
    ['NotificationsHistoryWindow', history],
    ['ActivityWindow', activity],
    ['AchievementsModal', achievements],
  ] as const) {
    assert.ok(
      src.includes('heyroq-window-header'),
      `${name} must use the shared .heyroq-window-header translucent header primitive`
    );
  }

  // 2. Profile sticky header inside scroll container with header-aware settings offset
  assert.match(profile, /ref=\{profileHeaderRef\}[\s\S]*heyroq-window-header sticky top-0 z-20/);
  assert.ok(profile.includes('stickyHeaderOffset'));

  // 3. Mobile Profile actions prioritize Edit Profile above paired About & Settings
  assert.match(profile, /grid grid-cols-2 sm:flex sm:items-center/);
  assert.match(profile, /col-span-2 sm:col-span-1 sm:order-3[\s\S]*Edit Profile/);
  assert.match(profile, /id="profile-about-heyroq-btn"[\s\S]*sm:order-1/);
  assert.match(profile, /id="profile-settings-btn"[\s\S]*sm:order-2/);

  // 4. Authenticated profile dropdown uses primary text contrast & preserves Moderation/Sign Out semantics
  const menuBlock = navbar.slice(navbar.indexOf('role="menu"'), navbar.indexOf('Sign Out') + 120);
  assert.ok(menuBlock.includes('text-[var(--heyroq-text-primary)]'));
  assert.ok(menuBlock.includes('text-amber-700 dark:text-amber-400'));
  assert.ok(menuBlock.includes('text-[var(--heyroq-accent-text)]'));

  // 5. Notifications popover settings button uses neutral gray hover/active treatment matching CloseButton
  const settingsBtnMatch = popover.match(/id="notifications-popover-settings-btn"[\s\S]*?<\/button>/);
  assert.ok(settingsBtnMatch, 'NotificationsPopover must render #notifications-popover-settings-btn');
  assert.ok(settingsBtnMatch[0].includes('hover:bg-[#202124]/[0.10]'));
  assert.ok(settingsBtnMatch[0].includes('dark:hover:bg-white/[0.14]'));
  assert.ok(settingsBtnMatch[0].includes('active:scale-95'));
  assert.ok(settingsBtnMatch[0].includes('aria-label="Notification settings"'));
});

