import React from 'react';
import { Heart } from 'lucide-react';

export interface LikeIndicatorProps {
  count: number;
  variant?: 'compact' | 'feed' | 'badge';
  className?: string;
}

/**
 * Unified Heyroq LikeIndicator Component
 * Renders the authoritative like count with the standard Heyroq coral heart icon.
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
        className={`flex items-center gap-1 font-black text-xs text-[#FF5F40] ${className}`}
      >
        <Heart className="w-3.5 h-3.5 fill-current" />
        <span>{safeCount}</span>
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <div
        className={`bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full text-white text-[10px] font-mono flex items-center gap-1 border border-white/10 ${className}`}
      >
        <Heart className="w-2.5 h-2.5 fill-current text-[#FF5F40]" />
        <span>{safeCount}</span>
      </div>
    );
  }

  // Default 'compact' (e.g. Map markers & preview chips)
  return (
    <span
      className={`inline-flex items-center gap-1 text-[#FF5F40] font-black text-[11px] leading-none ${className}`}
    >
      <Heart className="w-2.5 h-2.5 fill-current shrink-0" />
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
 * keeping the active/inactive coral states, stroke/fill, typography, and spacing consistent.
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
        className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider transition cursor-pointer disabled:opacity-50 ${
          isLiked ? 'text-[#FF5F40]' : 'text-white/60 hover:text-white'
        } ${className}`}
      >
        <Heart className={`w-4 h-4 transition-transform duration-150 ${isLiked ? 'fill-current scale-110' : ''}`} />
        <span>
          {safeCount} {safeCount === 1 ? 'Like' : 'Likes'}
        </span>
      </button>
    );
  }

  // 'pill' variant (used in Map Preview Cards & floating cards)
  return (
    <button
      type="button"
      id={`like-button-pill-${pinId}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(pinId);
      }}
      className={`px-2.5 py-1 rounded-full backdrop-blur-md transition-all flex items-center gap-1 text-[11px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
        isLiked
          ? 'bg-[#FF5F40] text-white shadow-[0_0_15px_#FF5F40]'
          : 'bg-black/60 text-white hover:bg-black/80 border border-white/20'
      } ${className}`}
    >
      <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
      <span>{safeCount}</span>
    </button>
  );
};

/**
 * HTML string generator for Google Maps AdvancedMarker elements.
 * Generates an SVG matching Lucide's Heart icon with Heyroq's coral (#FF5F40) fill.
 */
export function getLikeMarkerHtml(count: number): string {
  const safeCount = typeof count === 'number' && !isNaN(count) ? count : 0;
  return `
    <span class="inline-flex items-center gap-1 text-[#FF5F40] font-black text-[11px] leading-none">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block shrink-0">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>
      <span>${safeCount}</span>
    </span>
  `.trim();
}
