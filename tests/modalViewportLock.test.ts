import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  acquireModalScrollLock,
  computeVisualViewportRect,
  getActiveModalScrollLockCount,
  reconcileLockedViewportScroll,
  type DocumentLike,
  type WindowLike,
} from '../src/utils/modalViewportLock.ts';

function createMockEnv(initialScrollX = 0, initialScrollY = 0) {
  let scrollX = initialScrollX;
  let scrollY = initialScrollY;
  const scrollCalls: Array<[number, number]> = [];

  const win: WindowLike = {
    innerWidth: 390,
    innerHeight: 664,
    get scrollX() {
      return scrollX;
    },
    get scrollY() {
      return scrollY;
    },
    scrollTo(x: number, y: number) {
      scrollX = x;
      scrollY = y;
      scrollCalls.push([x, y]);
    },
    visualViewport: {
      width: 390,
      height: 664,
      offsetTop: 0,
      offsetLeft: 0,
    },
  };

  const doc: DocumentLike = {
    documentElement: {
      style: {
        overflow: '',
        overscrollBehavior: '',
      },
    },
    body: {
      style: {
        overflow: '',
        overscrollBehavior: '',
        position: '',
        top: '',
        left: '',
        right: '',
        width: '',
      },
    },
  };

  return {
    win,
    doc,
    scrollCalls,
    setRawScroll(x: number, y: number) {
      scrollX = x;
      scrollY = y;
    },
  };
}

test('acquireModalScrollLock locks body at exact prior scroll offset and restores styles and scroll on release', () => {
  const { win, doc, scrollCalls } = createMockEnv(12, 240);
  doc.body.style.overflow = 'auto';

  const release = acquireModalScrollLock(win, doc);
  assert.equal(getActiveModalScrollLockCount(), 1);
  assert.equal(doc.documentElement.style.overflow, 'hidden');
  assert.equal(doc.documentElement.style.overscrollBehavior, 'none');
  assert.equal(doc.body.style.position, 'fixed');
  assert.equal(doc.body.style.top, '-240px');
  assert.equal(doc.body.style.left, '-12px');
  assert.equal(doc.body.style.width, '100%');

  release();
  // Calling release twice must be a safe no-op
  release();

  assert.equal(getActiveModalScrollLockCount(), 0);
  assert.equal(doc.documentElement.style.overflow, '');
  assert.equal(doc.body.style.overflow, 'auto');
  assert.equal(doc.body.style.position, '');
  assert.equal(doc.body.style.top, '');
  assert.equal(doc.body.style.left, '');
  assert.deepEqual(scrollCalls.at(-1), [12, 240]);
});

test('nested modal scroll locks stay active until final release and preserve original scroll coordinates', () => {
  const { win, doc, scrollCalls } = createMockEnv(0, 180);

  const releaseFirst = acquireModalScrollLock(win, doc);
  const releaseSecond = acquireModalScrollLock(win, doc);
  assert.equal(getActiveModalScrollLockCount(), 2);

  releaseFirst();
  assert.equal(getActiveModalScrollLockCount(), 1);
  assert.equal(doc.body.style.position, 'fixed');
  assert.equal(scrollCalls.length, 0);

  releaseSecond();
  assert.equal(getActiveModalScrollLockCount(), 0);
  assert.equal(doc.body.style.position, '');
  assert.deepEqual(scrollCalls.at(-1), [0, 180]);
});

test('reconcileLockedViewportScroll clears spurious iOS keyboard scroll drift while keeping saved background scroll intact', () => {
  const { win, doc, setRawScroll, scrollCalls } = createMockEnv(0, 320);

  const release = acquireModalScrollLock(win, doc);
  // Simulate iOS Safari nudging window.scrollY when keyboard opens/closes
  setRawScroll(0, 148);
  reconcileLockedViewportScroll(win);
  assert.equal(win.scrollY, 0);
  assert.deepEqual(scrollCalls.at(-1), [0, 0]);

  // Releasing still restores the user's true pre-modal scroll position (320)
  release();
  assert.equal(win.scrollY, 320);
  assert.deepEqual(scrollCalls.at(-1), [0, 320]);
});

test('computeVisualViewportRect tracks portrait and landscape iPhone keyboards and falls back safely', () => {
  const portraitOpen = computeVisualViewportRect({
    innerWidth: 390,
    innerHeight: 664,
    scrollTo() {},
    visualViewport: { width: 390, height: 374, offsetTop: 24, offsetLeft: 0 },
  });
  assert.deepEqual(portraitOpen, {
    top: 24,
    left: 0,
    width: 390,
    height: 374,
    keyboardOpen: true,
  });

  const landscapeOpen = computeVisualViewportRect({
    innerWidth: 844,
    innerHeight: 320,
    scrollTo() {},
    visualViewport: { width: 844, height: 158, offsetTop: 12, offsetLeft: 0 },
  });
  assert.deepEqual(landscapeOpen, {
    top: 12,
    left: 0,
    width: 844,
    height: 158,
    keyboardOpen: true,
  });

  const closed = computeVisualViewportRect({
    innerWidth: 390,
    innerHeight: 664,
    scrollTo() {},
    visualViewport: { width: 390, height: 664, offsetTop: 0, offsetLeft: 0 },
  });
  assert.equal(closed.keyboardOpen, false);

  const noVisualViewport = computeVisualViewportRect({
    innerWidth: 1280,
    innerHeight: 800,
    scrollTo() {},
    visualViewport: null,
  });
  assert.deepEqual(noVisualViewport, {
    top: 0,
    left: 0,
    width: 1280,
    height: 800,
    keyboardOpen: false,
  });
});

test('DropPinLocationDialog and LocationAutocompleteInput prevent iOS Safari top-layer shift and landscape zoom', () => {
  const dialogSrc = fs.readFileSync('src/components/Pin/DropPinLocationDialog.tsx', 'utf8');
  assert.ok(dialogSrc.includes('useModalViewportLock'), 'DropPinLocationDialog uses shared modal viewport lock');
  assert.ok(dialogSrc.includes('createPortal'), 'DropPinLocationDialog renders inside a fixed portal');
  assert.ok(!dialogSrc.includes('showModal('), 'DropPinLocationDialog avoids WebKit top-layer showModal scroll shift');

  const inputSrc = fs.readFileSync('src/components/Pin/LocationAutocompleteInput.tsx', 'utf8');
  assert.ok(inputSrc.includes('preventScroll: true'), 'LocationAutocompleteInput focuses with preventScroll: true');
  assert.ok(
    inputSrc.includes('text-base [@media(hover:hover)_and_(pointer:fine)]:text-sm'),
    'LocationAutocompleteInput keeps >=16px font-size on touch devices across portrait and landscape',
  );
});
