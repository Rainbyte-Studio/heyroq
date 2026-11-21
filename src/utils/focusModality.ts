export type FocusModality = 'keyboard' | 'pointer';

export const FOCUS_MODALITY_ATTR = 'data-focus-modality';

const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'OS',
]);

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export interface KeyboardEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
}

interface MediaQueryCapableWindow {
  matchMedia?: (query: string) => { matches: boolean };
}

interface EventTargetWithListeners {
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) => void;
}

interface DocumentLike {
  documentElement: {
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  };
}

function isTextEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== 'object') return false;

  const candidate = target as {
    tagName?: unknown;
    type?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => string | null;
  };

  if (candidate.isContentEditable === true) return true;
  if (typeof candidate.getAttribute === 'function') {
    const contentEditable = candidate.getAttribute('contenteditable');
    if (contentEditable === '' || contentEditable === 'true' || contentEditable === 'plaintext-only') {
      return true;
    }
  }

  const tagName = typeof candidate.tagName === 'string' ? candidate.tagName.toUpperCase() : '';
  if (tagName === 'TEXTAREA') return true;
  if (tagName === 'INPUT') {
    const inputType = typeof candidate.type === 'string' ? candidate.type.toLowerCase() : 'text';
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }
  return false;
}

/**
 * Determines whether a keydown event represents intentional keyboard navigation
 * (including external hardware keyboards on iPhone/iPad and Option+Tab on macOS Safari).
 * Ignores bare modifier keys, browser shortcuts, and software-keyboard typing in text fields.
 */
export function shouldSwitchToKeyboardModality(event: KeyboardEventLike): boolean {
  const { key } = event;
  if (!key || MODIFIER_KEYS.has(key)) return false;

  // Tab (including Shift+Tab and Safari Option+Tab) always signals keyboard navigation.
  if (key === 'Tab') return true;

  // Ignore modifier shortcuts (e.g. Cmd+C, Ctrl+R, Alt+Left) so pointer sessions stay clean.
  if (event.metaKey || event.ctrlKey || event.altKey) return false;

  // Inside text inputs (e.g. iOS virtual keyboard), only Tab and Escape switch to keyboard rings.
  if (isTextEditableTarget(event.target)) {
    return key === 'Escape';
  }

  return true;
}

/**
 * Touch-primary devices (phones/tablets without fine hover pointers) start in pointer
 * modality so initial programmatic focus never flashes an orange ring before the first tap.
 * Any hardware keyboard press immediately transitions to keyboard modality.
 */
export function getInitialFocusModality(
  win: MediaQueryCapableWindow | undefined = typeof window !== 'undefined' ? window : undefined
): FocusModality {
  try {
    if (win?.matchMedia?.('(hover: none) and (pointer: coarse)').matches) {
      return 'pointer';
    }
  } catch {
    // Fall back safely to keyboard modality if matchMedia is unavailable.
  }
  return 'keyboard';
}

export function setFocusModality(
  modality: FocusModality,
  doc: DocumentLike | undefined = typeof document !== 'undefined' ? document : undefined
): void {
  if (!doc?.documentElement) return;
  if (doc.documentElement.getAttribute(FOCUS_MODALITY_ATTR) !== modality) {
    doc.documentElement.setAttribute(FOCUS_MODALITY_ATTR, modality);
  }
}

export function getFocusModality(
  doc: DocumentLike | undefined = typeof document !== 'undefined' ? document : undefined
): FocusModality {
  return doc?.documentElement?.getAttribute(FOCUS_MODALITY_ATTR) === 'pointer'
    ? 'pointer'
    : 'keyboard';
}

/**
 * Attaches capture-phase modality listeners to distinguish pointer/touch interactions
 * from keyboard navigation (including external keyboards on iOS/iPadOS).
 */
export function initFocusModalityTracking(
  win: (EventTargetWithListeners & MediaQueryCapableWindow) | undefined = typeof window !== 'undefined'
    ? window
    : undefined,
  doc: DocumentLike | undefined = typeof document !== 'undefined' ? document : undefined
): () => void {
  if (!win || !doc?.documentElement) return () => {};

  if (!doc.documentElement.getAttribute(FOCUS_MODALITY_ATTR)) {
    setFocusModality(getInitialFocusModality(win), doc);
  }

  const handlePointerInput = () => {
    setFocusModality('pointer', doc);
  };

  const handleKeyDown = (event: Event) => {
    if (shouldSwitchToKeyboardModality(event as KeyboardEvent)) {
      setFocusModality('keyboard', doc);
    }
  };

  const pointerOptions: AddEventListenerOptions = { capture: true, passive: true };
  win.addEventListener('pointerdown', handlePointerInput, pointerOptions);
  win.addEventListener('touchstart', handlePointerInput, pointerOptions);
  win.addEventListener('mousedown', handlePointerInput, pointerOptions);
  win.addEventListener('keydown', handleKeyDown, true);

  return () => {
    win.removeEventListener('pointerdown', handlePointerInput, true);
    win.removeEventListener('touchstart', handlePointerInput, true);
    win.removeEventListener('mousedown', handlePointerInput, true);
    win.removeEventListener('keydown', handleKeyDown, true);
  };
}

let trackingInitialized = false;

/**
 * Idempotent app-level initializer safe to call from entry points and shared dialogs.
 */
export function ensureFocusModalityTracking(): void {
  if (trackingInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  trackingInitialized = true;
  initFocusModalityTracking(window, document);
}
