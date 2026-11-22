import { useEffect, useLayoutEffect, useState } from 'react';

export interface VisualViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
  keyboardOpen: boolean;
}

export interface VisualViewportLike {
  width: number;
  height: number;
  offsetTop?: number;
  offsetLeft?: number;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
}

export interface WindowLike {
  innerWidth: number;
  innerHeight: number;
  scrollX?: number;
  scrollY?: number;
  pageXOffset?: number;
  pageYOffset?: number;
  scrollTo: (x: number, y: number) => void;
  visualViewport?: VisualViewportLike | null;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
}

export interface DocumentLike {
  documentElement: {
    style: {
      overflow: string;
      overscrollBehavior: string;
    };
  };
  body: {
    style: {
      overflow: string;
      overscrollBehavior: string;
      position: string;
      top: string;
      left: string;
      right: string;
      width: string;
    };
  };
}

interface SavedScrollLockState {
  scrollX: number;
  scrollY: number;
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
}

const KEYBOARD_HEIGHT_THRESHOLD_PX = 120;

let activeLockCount = 0;
let savedState: SavedScrollLockState | null = null;

/**
 * Computes the active visual viewport rectangle so fixed modals remain inside
 * the visible area above the iOS Safari virtual keyboard in both portrait and
 * landscape orientations.
 */
export function computeVisualViewportRect(
  win: WindowLike | undefined = typeof window !== 'undefined' ? window : undefined,
): VisualViewportRect {
  if (!win) {
    return { top: 0, left: 0, width: 0, height: 0, keyboardOpen: false };
  }

  const vv = win.visualViewport;
  if (!vv) {
    return {
      top: 0,
      left: 0,
      width: Math.max(0, Math.round(win.innerWidth)),
      height: Math.max(0, Math.round(win.innerHeight)),
      keyboardOpen: false,
    };
  }

  const width = Math.max(0, Math.round(vv.width));
  const height = Math.max(0, Math.round(vv.height));
  const top = Math.max(0, Math.round(vv.offsetTop ?? 0));
  const left = Math.max(0, Math.round(vv.offsetLeft ?? 0));
  const keyboardOpen = win.innerHeight - vv.height > KEYBOARD_HEIGHT_THRESHOLD_PX;

  return { top, left, width, height, keyboardOpen };
}

/**
 * Reference-counted background scroll lock that pins `document.body` at the
 * exact prior scroll offset (`top: -scrollY`) so iOS Safari keyboard focus
 * cannot shift the underlying application header or map layout.
 * Restores all inline styles and the exact saved scroll position on release.
 */
export function acquireModalScrollLock(
  win: WindowLike | undefined = typeof window !== 'undefined' ? window : undefined,
  doc: DocumentLike | undefined = typeof document !== 'undefined' ? document : undefined,
): () => void {
  if (!win || !doc?.body || !doc?.documentElement) {
    return () => {};
  }

  if (activeLockCount === 0) {
    const scrollX = Math.round(win.scrollX ?? win.pageXOffset ?? 0);
    const scrollY = Math.round(win.scrollY ?? win.pageYOffset ?? 0);

    savedState = {
      scrollX,
      scrollY,
      htmlOverflow: doc.documentElement.style.overflow,
      htmlOverscrollBehavior: doc.documentElement.style.overscrollBehavior,
      bodyOverflow: doc.body.style.overflow,
      bodyOverscrollBehavior: doc.body.style.overscrollBehavior,
      bodyPosition: doc.body.style.position,
      bodyTop: doc.body.style.top,
      bodyLeft: doc.body.style.left,
      bodyRight: doc.body.style.right,
      bodyWidth: doc.body.style.width,
    };

    doc.documentElement.style.overflow = 'hidden';
    doc.documentElement.style.overscrollBehavior = 'none';

    doc.body.style.overflow = 'hidden';
    doc.body.style.overscrollBehavior = 'none';
    doc.body.style.position = 'fixed';
    doc.body.style.top = scrollY === 0 ? '0px' : `${-scrollY}px`;
    doc.body.style.left = scrollX === 0 ? '0px' : `${-scrollX}px`;
    doc.body.style.right = '0';
    doc.body.style.width = '100%';
  }

  activeLockCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeLockCount = Math.max(0, activeLockCount - 1);

    if (activeLockCount === 0 && savedState) {
      const state = savedState;
      savedState = null;

      doc.documentElement.style.overflow = state.htmlOverflow;
      doc.documentElement.style.overscrollBehavior = state.htmlOverscrollBehavior;

      doc.body.style.overflow = state.bodyOverflow;
      doc.body.style.overscrollBehavior = state.bodyOverscrollBehavior;
      doc.body.style.position = state.bodyPosition;
      doc.body.style.top = state.bodyTop;
      doc.body.style.left = state.bodyLeft;
      doc.body.style.right = state.bodyRight;
      doc.body.style.width = state.bodyWidth;

      win.scrollTo(state.scrollX, state.scrollY);
    }
  };
}

/**
 * While a fixed-body scroll lock is active, the user's real scroll position is
 * preserved in `body.style.top`, so any non-zero root scroll offset is strictly
 * spurious iOS Safari keyboard drift. Reconciling it back to (0, 0) while locked
 * keeps the background header anchored without altering the saved scroll position.
 */
export function reconcileLockedViewportScroll(
  win: WindowLike | undefined = typeof window !== 'undefined' ? window : undefined,
): void {
  if (!win || activeLockCount === 0) return;
  const currentX = win.scrollX ?? win.pageXOffset ?? 0;
  const currentY = win.scrollY ?? win.pageYOffset ?? 0;
  if (currentX !== 0 || currentY !== 0) {
    win.scrollTo(0, 0);
  }
}

export function getActiveModalScrollLockCount(): number {
  return activeLockCount;
}

/**
 * React hook combining reference-counted body scroll lock with live
 * `window.visualViewport` sizing for keyboard-safe fixed modals on iOS Safari.
 */
export function useModalViewportLock(active: boolean): VisualViewportRect {
  const [rect, setRect] = useState<VisualViewportRect>(() => computeVisualViewportRect());

  useLayoutEffect(() => {
    if (!active) return;
    return acquireModalScrollLock();
  }, [active]);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    let rafId: number | null = null;
    let wasKeyboardOpen = computeVisualViewportRect().keyboardOpen;

    const syncViewport = () => {
      const next = computeVisualViewportRect();
      if (wasKeyboardOpen && !next.keyboardOpen) {
        reconcileLockedViewportScroll();
      } else if (!next.keyboardOpen && next.top === 0) {
        reconcileLockedViewportScroll();
      }
      wasKeyboardOpen = next.keyboardOpen;

      setRect(prev =>
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.keyboardOpen === next.keyboardOpen
          ? prev
          : next,
      );
    };

    const scheduleSync = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        syncViewport();
      });
    };

    const handleFocusOut = () => {
      scheduleSync();
    };

    syncViewport();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', scheduleSync);
    vv?.addEventListener('scroll', scheduleSync);
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);
    document.addEventListener('focusout', handleFocusOut, true);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      vv?.removeEventListener('resize', scheduleSync);
      vv?.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      document.removeEventListener('focusout', handleFocusOut, true);
    };
  }, [active]);

  return rect;
}
