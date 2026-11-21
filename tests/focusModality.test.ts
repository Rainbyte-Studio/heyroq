import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FOCUS_MODALITY_ATTR,
  getFocusModality,
  getInitialFocusModality,
  initFocusModalityTracking,
  shouldSwitchToKeyboardModality,
} from '../src/utils/focusModality';

const ROOT_DIR = process.cwd();

function createMockDom(coarseTouchDevice: boolean) {
  const attributes = new Map<string, string>();
  const listeners = new Map<string, Set<EventListener>>();

  const doc = {
    documentElement: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
    },
  };

  const win = {
    matchMedia: (query: string) => ({
      matches: coarseTouchDevice && query === '(hover: none) and (pointer: coarse)',
    }),
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener !== 'function') return;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener !== 'function') return;
      listeners.get(type)?.delete(listener);
    },
    dispatch: (type: string, event: Record<string, unknown> = {}) => {
      for (const listener of listeners.get(type) ?? []) {
        listener(event as unknown as Event);
      }
    },
  };

  return { win, doc, attributes };
}

test('getInitialFocusModality defaults to pointer on coarse touch devices and keyboard on desktop', () => {
  assert.equal(
    getInitialFocusModality({ matchMedia: (q) => ({ matches: q === '(hover: none) and (pointer: coarse)' }) }),
    'pointer'
  );
  assert.equal(
    getInitialFocusModality({ matchMedia: () => ({ matches: false }) }),
    'keyboard'
  );
  assert.equal(getInitialFocusModality(undefined), 'keyboard');
});

test('initFocusModalityTracking distinguishes touch/pointer taps from keyboard navigation and supports iPad/iPhone external keyboards', () => {
  // Simulate iPhone Safari (coarse touch device)
  const { win, doc } = createMockDom(true);
  const cleanup = initFocusModalityTracking(win, doc);

  assert.equal(getFocusModality(doc), 'pointer');
  assert.equal(doc.documentElement.getAttribute(FOCUS_MODALITY_ATTR), 'pointer');

  // Touch tap keeps pointer modality
  win.dispatch('touchstart');
  win.dispatch('pointerdown');
  assert.equal(getFocusModality(doc), 'pointer');

  // Pressing Tab on an external keyboard immediately switches to keyboard modality
  win.dispatch('keydown', { key: 'Tab' });
  assert.equal(getFocusModality(doc), 'keyboard');

  // Tapping the screen switches right back to pointer modality
  win.dispatch('pointerdown');
  assert.equal(getFocusModality(doc), 'pointer');

  // Shift+Tab and Option+Tab (macOS Safari) switch to keyboard modality
  win.dispatch('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(getFocusModality(doc), 'keyboard');

  win.dispatch('mousedown');
  assert.equal(getFocusModality(doc), 'pointer');

  win.dispatch('keydown', { key: 'Tab', altKey: true });
  assert.equal(getFocusModality(doc), 'keyboard');

  // Arrow keys, Enter, Space, and Escape on buttons switch to keyboard modality
  for (const key of ['ArrowDown', 'Enter', ' ', 'Escape']) {
    win.dispatch('pointerdown');
    assert.equal(getFocusModality(doc), 'pointer');
    win.dispatch('keydown', { key, target: { tagName: 'BUTTON' } });
    assert.equal(getFocusModality(doc), 'keyboard', `${key} on button must activate keyboard modality`);
  }

  cleanup();
});

test('shouldSwitchToKeyboardModality ignores bare modifiers, shortcut combos, and on-screen text input typing', () => {
  // Bare modifier keys must not trigger keyboard rings
  for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']) {
    assert.equal(shouldSwitchToKeyboardModality({ key }), false);
  }

  // Shortcut combos (except Tab) must not flip pointer sessions
  assert.equal(shouldSwitchToKeyboardModality({ key: 'c', metaKey: true }), false);
  assert.equal(shouldSwitchToKeyboardModality({ key: 'r', ctrlKey: true }), false);
  assert.equal(shouldSwitchToKeyboardModality({ key: 'ArrowLeft', altKey: true }), false);

  // Typing in text inputs / textareas / contenteditable must not flip pointer modality
  const textInput = { tagName: 'INPUT', type: 'text' };
  const searchInput = { tagName: 'INPUT', type: 'search' };
  const textarea = { tagName: 'TEXTAREA' };
  const editableDiv = { tagName: 'DIV', isContentEditable: true };

  assert.equal(shouldSwitchToKeyboardModality({ key: 'a', target: textInput }), false);
  assert.equal(shouldSwitchToKeyboardModality({ key: 'Enter', target: searchInput }), false);
  assert.equal(shouldSwitchToKeyboardModality({ key: 'Backspace', target: textarea }), false);
  assert.equal(shouldSwitchToKeyboardModality({ key: 'a', target: editableDiv }), false);

  // Tab and Escape inside text inputs DO switch to keyboard modality
  assert.equal(shouldSwitchToKeyboardModality({ key: 'Tab', target: textInput }), true);
  assert.equal(shouldSwitchToKeyboardModality({ key: 'Escape', target: searchInput }), true);

  // Non-text inputs (checkbox/radio) DO switch on Space / Arrow keys
  assert.equal(shouldSwitchToKeyboardModality({ key: ' ', target: { tagName: 'INPUT', type: 'checkbox' } }), true);
  assert.equal(shouldSwitchToKeyboardModality({ key: 'ArrowRight', target: { tagName: 'INPUT', type: 'radio' } }), true);
});

test('CSS and modal components suppress spurious pointer-modality focus rings while preserving keyboard focus rings and focus restoration', () => {
  const css = readFileSync(path.join(ROOT_DIR, 'src/index.css'), 'utf8');
  const mainTsx = readFileSync(path.join(ROOT_DIR, 'src/main.tsx'), 'utf8');
  const achievementsSrc = readFileSync(path.join(ROOT_DIR, 'src/components/Profile/AchievementsModal.tsx'), 'utf8');
  const appWindowSrc = readFileSync(path.join(ROOT_DIR, 'src/components/Common/AppWindow.tsx'), 'utf8');
  const aboutSrc = readFileSync(path.join(ROOT_DIR, 'src/components/Common/AboutHeyroqModal.tsx'), 'utf8');
  const popoverSrc = readFileSync(path.join(ROOT_DIR, 'src/components/Engagement/NotificationsPopover.tsx'), 'utf8');
  const navbarSrc = readFileSync(path.join(ROOT_DIR, 'src/components/Navigation/Navbar.tsx'), 'utf8');

  // CSS preserves keyboard :focus-visible Solaris Orange rings and scopes suppression strictly to pointer modality
  assert.match(css, /html:not\(\[data-focus-modality="pointer"\]\)\s+\.heyroq-focus-ring:focus-visible/);
  assert.match(css, /outline:\s*2px solid var\(--heyroq-focus-ring\);/);
  assert.match(css, /html\[data-focus-modality="pointer"\]\s+\.heyroq-focus-ring:focus-visible/);
  assert.match(css, /html\[data-focus-modality="pointer"\]\s+button:focus-visible/);
  assert.doesNotMatch(css, /\*\s*\{[^}]*outline\s*:\s*none/, 'Must never introduce global outline: none');

  // Boot & shared windows wire ensureFocusModalityTracking
  assert.ok(mainTsx.includes('ensureFocusModalityTracking()'));
  assert.ok(achievementsSrc.includes('ensureFocusModalityTracking()'));
  assert.ok(appWindowSrc.includes('ensureFocusModalityTracking()'));
  assert.ok(aboutSrc.includes('ensureFocusModalityTracking()'));
  assert.ok(popoverSrc.includes('ensureFocusModalityTracking()'));

  // AchievementsModal preserves focus entry, Tab focus trap, and trigger/fallback focus restoration
  assert.ok(achievementsSrc.includes('closeButtonRef.current?.focus({ preventScroll: true })'));
  assert.ok(achievementsSrc.includes('trigger.focus({ preventScroll: true })'));
  assert.ok(achievementsSrc.includes('fallbackFocusRef?.current?.focus({ preventScroll: true })'));
  assert.ok(achievementsSrc.includes('handleDialogKeyDown'));

  // AboutHeyroqModal and Navbar preserve safe focus restoration
  assert.ok(aboutSrc.includes('closeButtonRef.current?.focus({ preventScroll: true })'));
  assert.ok(aboutSrc.includes('prev.isConnected'));
  assert.match(navbarSrc, /id="menu-about-heyroq-btn"[\s\S]*profileMenuButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});
