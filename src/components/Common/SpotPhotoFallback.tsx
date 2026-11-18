import React from 'react';
import { Compass, MapPin } from 'lucide-react';

export interface SpotPhotoFallbackProps {
  category?: string;
  title?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Editorial placeholder rendered when a spot has no uploaded photo or fails to load,
 * eliminating external stock image dependencies while preserving warm visual balance.
 */
export const SpotPhotoFallback: React.FC<SpotPhotoFallbackProps> = ({
  category,
  title,
  compact = false,
  className = '',
}) => {
  return (
    <div
      role="img"
      aria-label={title ? `${title} — no photo uploaded` : 'Spot photo unavailable'}
      className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#F3F1ED] dark:bg-[#2B2C31] text-[var(--heyroq-text-muted)] select-none ${className}`.trim()}
    >
      <div className="flex flex-col items-center justify-center gap-1.5 px-3 text-center">
        <div
          className={`flex items-center justify-center rounded-full border border-[var(--heyroq-border-subtle)] bg-[var(--heyroq-bg-surface)] text-[var(--brand-primary)] ${
            compact ? 'w-8 h-8' : 'w-11 h-11'
          }`}
        >
          {compact ? (
            <MapPin className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Compass className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
          )}
        </div>
        {!compact && category && (
          <span className="type-caption text-[var(--heyroq-text-subtle)] max-w-[160px] truncate">
            {category}
          </span>
        )}
      </div>
    </div>
  );
};
