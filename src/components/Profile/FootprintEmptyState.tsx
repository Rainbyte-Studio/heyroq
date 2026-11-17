import React from 'react';
import { Compass, Plus } from 'lucide-react';

interface FootprintEmptyStateProps {
  isMe: boolean;
  displayName?: string;
  onDropFirstPin?: () => void;
}

export const FootprintEmptyState: React.FC<FootprintEmptyStateProps> = ({
  isMe,
  displayName,
  onDropFirstPin,
}) => {
  return (
    <div
      id="footprint-empty-state"
      className="liquid-glass-card relative w-full rounded-2xl p-8 sm:p-10 flex flex-col items-center justify-center text-center overflow-hidden"
    >
      <div className="relative z-10 flex flex-col items-center max-w-md mx-auto">
        <div className="w-13 h-13 rounded-2xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center mb-4 text-[var(--brand-primary)]">
          <Compass className="w-6 h-6 stroke-[1.75]" />
        </div>

        <h4 className="font-heading text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white mb-1.5">
          {isMe
            ? 'Your map is waiting for its first spot.'
            : `${displayName || 'This explorer'}'s map is waiting for spots.`}
        </h4>

        <p className="text-xs sm:text-sm text-slate-500 dark:text-white/55 leading-relaxed max-w-sm mb-6">
          {isMe
            ? 'Add your first pin to start building your footprint across the world.'
            : 'No public discoveries have been published yet.'}
        </p>

        {isMe && onDropFirstPin && (
          <button
            id="footprint-empty-drop-pin-btn"
            type="button"
            onClick={onDropFirstPin}
            className="heyroq-btn-primary inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full font-semibold text-xs cursor-pointer whitespace-nowrap heyroq-focus-ring"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Drop Your First Spot</span>
          </button>
        )}
      </div>
    </div>
  );
};
