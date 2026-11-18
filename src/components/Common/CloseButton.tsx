import React from 'react';
import { X } from 'lucide-react';

export interface CloseButtonProps {
  /** Accessible screen-reader label describing what is being closed (e.g. "Close Profile", "Close Nearby Spots") */
  ariaLabel: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  id?: string;
  disabled?: boolean;
  /**
   * - `embedded` (default): Used inside an already-blurred Liquid Glass modal, panel, sheet, or popover.
   *   Renders a neutral glass-compatible surface with a subtle border and ZERO nested `backdrop-filter`.
   * - `floating`: Used when floating directly over photography or an unblurred canvas (e.g. map preview photo).
   *   Uses `.liquid-glass-floating` (`rgba(255,255,255,0.95)` Light / `rgba(24,25,28,0.95)` Dark, 20px blur, 140% saturation).
   */
  surface?: 'embedded' | 'floating';
  /**
   * - `md` (default): 36x36px circular visual control with a 44x44px accessible touch target on mobile.
   * - `sm`: 32x32px compact circular control for micro-popovers or inline sub-cards (still 44x44px touch target on mobile).
   */
  size?: 'md' | 'sm';
  /** Prevents close clicks from bubbling to underlying cards, map markers, or backdrops (default: true). */
  stopPropagation?: boolean;
  title?: string;
  className?: string;
}

/**
 * Canonical Heyroq Unified Close Button
 * - Minimal circular icon-only button (`X` icon ~16px, zero visible "Close" text)
 * - 100% opaque foreground icon with clear hover, active/pressed, and keyboard focus-visible states
 * - Zero nested backdrop-filter when embedded inside Liquid Glass modals, sheets, or sidebars
 */
export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  (
    {
      ariaLabel,
      onClick,
      id,
      disabled = false,
      surface = 'embedded',
      size = 'md',
      stopPropagation = true,
      title,
      className = '',
    },
    ref
  ) => {
    const sizeClasses =
      size === 'sm'
        ? 'w-8 h-8 after:-inset-1.5 sm:after:inset-0'
        : 'w-9 h-9 after:-inset-1 sm:after:inset-0';

    const surfaceClasses =
      surface === 'floating'
        ? 'liquid-glass-floating text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:border-[var(--heyroq-border-strong)] active:scale-95'
        : 'bg-[#202124]/[0.05] hover:bg-[#202124]/[0.10] active:bg-[#202124]/[0.14] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:active:bg-white/[0.20] border border-[var(--glass-border-strong)] text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] active:scale-95';

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) {
        event.stopPropagation();
      }
      if (disabled) return;
      onClick(event);
    };

    const positionClass = /\b(absolute|fixed|sticky)\b/.test(className) ? '' : 'relative';

    return (
      <button
        ref={ref}
        id={id}
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        className={`${positionClass} inline-flex items-center justify-center rounded-full shrink-0 select-none transition-all duration-150 cursor-pointer heyroq-focus-ring touch-manipulation after:content-[''] after:absolute disabled:opacity-40 disabled:pointer-events-none ${sizeClasses} ${surfaceClasses} ${className}`.trim()}
      >
        <X className="w-4 h-4 stroke-[2] shrink-0" aria-hidden="true" />
      </button>
    );
  }
);

CloseButton.displayName = 'CloseButton';
