import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface AppWindowProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaLabel?: string;
  size?: 'full' | 'compact';
  zIndexClass?: string;
  disableClose?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusElementId?: string;
  fallbackFocus?: () => void;
  children: React.ReactNode;
}

/**
 * Shared in-app window architecture aligned with Heyroq's Profile and About windows.
 * Renders over the live map workspace via portal so closing always preserves map state,
 * manages capture-phase Escape handling, and restores keyboard focus to the trigger.
 */
export const AppWindow: React.FC<AppWindowProps> = ({
  id,
  isOpen,
  onClose,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaLabel,
  size = 'full',
  zIndexClass = 'z-[55]',
  disableClose = false,
  initialFocusRef,
  returnFocusElementId,
  fallbackFocus,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus({ preventScroll: true });
      } else {
        dialogRef.current?.focus({ preventScroll: true });
      }
    }, 20);

    return () => {
      window.clearTimeout(focusTimer);
      const explicitTarget = returnFocusElementId
        ? document.getElementById(returnFocusElementId)
        : null;
      if (explicitTarget instanceof HTMLElement && explicitTarget.isConnected) {
        explicitTarget.focus({ preventScroll: true });
        return;
      }
      const prev = previousFocusRef.current;
      if (prev && prev !== document.body && prev.isConnected) {
        prev.focus({ preventScroll: true });
        return;
      }
      fallbackFocus?.();
    };
  }, [isOpen, initialFocusRef, returnFocusElementId, fallbackFocus]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableClose) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, disableClose, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const sizeClass =
    size === 'compact'
      ? 'sm:max-w-[440px] rounded-t-[28px] sm:rounded-[28px]'
      : 'max-w-2xl sm:max-w-3xl lg:max-w-4xl rounded-[24px] sm:rounded-[32px]';

  const wrapperAlignClass =
    size === 'compact'
      ? 'items-end sm:items-center p-0 sm:p-4'
      : 'items-center p-2.5 sm:p-4';

  const content = (
    <div
      id={`${id}-backdrop`}
      onClick={() => {
        if (!disableClose) onClose();
      }}
      className={`liquid-glass-backdrop fixed inset-0 ${zIndexClass} flex justify-center ${wrapperAlignClass} animate-in fade-in duration-150 motion-reduce:animate-none`}
    >
      <div
        ref={dialogRef}
        id={id}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={`liquid-glass-modal ${sizeClass} w-full max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col text-[var(--heyroq-text-primary)] relative focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
