import React from 'react';
import { Compass, Plus, MapPin } from 'lucide-react';

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
      className="relative w-full rounded-2xl bg-[#0F0F0F] border border-white/10 p-8 sm:p-10 flex flex-col items-center justify-center text-center overflow-hidden"
    >
      {/* Ambient background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FF5F40]/5 via-transparent to-black/40 pointer-events-none" />
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-[#FF5F40]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-black/60 border border-white/15 flex items-center justify-center mb-4 shadow-xl text-[#FF5F40]">
          <Compass className="w-7 h-7 stroke-[1.75]" />
        </div>

        <h4 className="text-base sm:text-lg font-black uppercase tracking-tight text-white mb-1.5">
          {isMe ? 'Your map is waiting for its first spot.' : `${displayName || 'This explorer'}'s map is waiting for spots.`}
        </h4>

        <p className="text-xs sm:text-sm text-white/50 leading-relaxed max-w-sm mb-6">
          {isMe
            ? 'Add your first pin to start building your footprint across the world.'
            : 'No public discoveries have been published yet.'}
        </p>

        {isMe && onDropFirstPin && (
          <button
            id="footprint-empty-drop-pin-btn"
            type="button"
            onClick={onDropFirstPin}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5F40] text-black font-black uppercase tracking-wider text-xs hover:bg-[#ff7257] active:scale-95 transition shadow-lg shadow-[#FF5F40]/20 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Drop Your First Spot</span>
          </button>
        )}
      </div>
    </div>
  );
};
