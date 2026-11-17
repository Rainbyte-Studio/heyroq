import React from 'react';
import { Heart } from 'lucide-react';

export interface LikeIndicatorProps {
  count: number;
  variant?: 'compact' | 'feed' | 'badge';
  className?: string;
}

/**
 * Unified Heyroq LikeIndicator Component
 * Renders the authoritative like count with the standard Heyroq Solaris Orange heart icon.
 */
export const LikeIndicator: React.FC<LikeIndicatorProps> = ({
  count,
  variant = 'compact',
  className = '',
}) => {
  const safeCount = typeof count === 'number' && !isNaN(count) ? count : 0;

  if (variant === 'feed') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-bold text-xs tabular-nums text-[var(--heyroq-accent-text)] ${className}`}
      >
        <Heart className="w-3.5 h-3.5 fill-[var(--brand-primary)] text-[var(--brand-primary)]" />
        <span>{safeCount}</span>
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <div
        className={`bg-black/75 px-2 py-0.5 rounded-full text-white text-[11px] font-semibold tabular-nums flex items-center gap-1 border border-white/15 shadow-sm ${className}`}
      >
        <Heart className="w-2.5 h-2.5 fill-[var(--brand-primary)] text-[var(--brand-primary)]" />
        <span>{safeCount}</span>
      </div>
    );
  }

  // Default 'compact' (e.g. Map markers & preview chips)
  return (
    <span
      className={`inline-flex items-center gap-1 text-[var(--heyroq-accent-text)] font-bold text-[11px] tabular-nums leading-none ${className}`}
    >
      <Heart className="w-2.5 h-2.5 fill-[var(--brand-primary)] text-[var(--brand-primary)] shrink-0" />
      <span>{safeCount}</span>
    </span>
  );
};

export interface LikeButtonProps {
  pinId: string;
  isLiked: boolean;
  likeCount: number;
  onToggle: (pinId: string) => void | Promise<void>;
  variant?: 'pill' | 'detail';
  disabled?: boolean;
  className?: string;
}

/**
 * Unified Heyroq LikeButton Component
 * Supports 'pill' (Map Preview Card) and 'detail' (Spot Details modal) variants,
 * keeping the active/inactive Solaris Orange states, stroke/fill, typography, and spacing consistent.
 */
export const LikeButton: React.FC<LikeButtonProps> = ({
  pinId,
  isLiked,
  likeCount,
  onToggle,
  variant = 'pill',
  disabled = false,
  className = '',
}) => {
  const safeCount = typeof likeCount === 'number' && !isNaN(likeCount) ? likeCount : 0;

  if (variant === 'detail') {
    return (
      <button
        type="button"
        id={`like-button-detail-${pinId}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(pinId);
        }}
        className={`min-h-[38px] px-2.5 -ml-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold tracking-wide tabular-nums transition cursor-pointer disabled:opacity-50 ${
          isLiked
            ? 'text-[var(--heyroq-accent-text)] bg-[var(--brand-primary)]/10'
            : 'text-slate-600 dark:text-white/65 hover:text-slate-950 dark:hover:text-white hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.06]'
        } ${className}`}
      >
        <Heart
          className={`w-4 h-4 transition-transform duration-150 ${
            isLiked ? 'fill-[var(--brand-primary)] text-[var(--brand-primary)] scale-110' : ''
          }`}
        />
        <span>
          {safeCount} {safeCount === 1 ? 'Like' : 'Likes'}
        </span>
      </button>
    );
  }

  // 'pill' variant (used over photography in Map Preview Cards)
  return (
    <button
      type="button"
      id={`like-button-pill-${pinId}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(pinId);
      }}
      className={`min-h-[30px] px-2.5 py-1 rounded-full transition-all flex items-center gap-1 text-[11px] font-bold tabular-nums tracking-wide cursor-pointer disabled:opacity-50 ${
        isLiked
          ? 'bg-[var(--brand-cta-bg)] text-white border border-white/25 shadow-md'
          : 'bg-black/75 text-white hover:bg-black/90 border border-white/20'
      } ${className}`}
    >
      <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
      <span>{safeCount}</span>
    </button>
  );
};

/**
 * HTML string generator for Google Maps AdvancedMarker elements.
 * Generates an SVG matching Lucide's Heart icon with Heyroq's Solaris Primary (#E87924) fill.
 */
export function getLikeMarkerHtml(count: number): string {
  const safeCount = typeof count === 'number' && !isNaN(count) ? count : 0;
  return `
    <span class="inline-flex items-center gap-1 text-[#E87924] font-bold text-[11px] tabular-nums leading-none">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block shrink-0">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>
      <span>${safeCount}</span>
    </span>
  `.trim();
}
