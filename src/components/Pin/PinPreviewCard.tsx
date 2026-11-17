import React from 'react';
import { Pin } from '../../types';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeButton } from './LikeButton';
import { MessageCircle, MapPin, ArrowRight } from 'lucide-react';
import { UserAvatar } from '../Common/UserAvatar';
import { CloseButton } from '../Common/CloseButton';

interface PinPreviewCardProps {
  pin: Pin;
  onClose: () => void;
  onOpenDetails: (pin: Pin) => void;
  onOpenProfile: (userId: string) => void;
  isLiked: boolean;
  onToggleLike: (pinId: string) => void;
}

export const PinPreviewCard: React.FC<PinPreviewCardProps> = ({
  pin,
  onClose,
  onOpenDetails,
  onOpenProfile,
  isLiked,
  onToggleLike,
}) => {
  const mainImage =
    pin.imageUrls?.[0] ||
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80';

  return (
    <div
      id={`pin-preview-${pin.id}`}
      className="liquid-glass-floating rounded-[26px] sm:rounded-[28px] overflow-hidden w-full max-w-[calc(100vw-24px)] sm:max-w-xs sm:w-80 transition-all duration-200 p-4 text-[var(--heyroq-text-primary)] animate-in fade-in slide-in-from-top-3"
    >
      {/* Cover Photo */}
      <div className="relative h-40 sm:h-44 rounded-2xl overflow-hidden mb-3 border border-slate-900/10 dark:border-white/10 group bg-slate-200 dark:bg-neutral-900">
        <img
          src={mainImage}
          alt={pin.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/30 pointer-events-none" />

        {/* Close Button */}
        <CloseButton
          surface="floating"
          onClick={onClose}
          ariaLabel="Close Spot Preview"
          className="absolute top-2.5 right-2.5 z-10"
        />

        {/* Category Badge */}
        <div className="absolute top-2.5 left-2.5">
          <CategoryBadge category={pin.category} size="xs" />
        </div>

        {/* Like Button */}
        <div className="absolute bottom-2.5 right-2.5">
          <LikeButton
            pinId={pin.id}
            isLiked={isLiked}
            likeCount={pin.likeCount || 0}
            onToggle={onToggleLike}
            variant="pill"
          />
        </div>

        {/* Location overlay */}
        {pin.locationName && (
          <div className="absolute bottom-2.5 left-2.5 text-white text-[11px] flex items-center gap-1 font-semibold bg-black/75 px-2.5 py-1 rounded-full border border-white/15">
            <MapPin className="w-3 h-3 text-[var(--brand-primary)] shrink-0" />
            <span className="truncate max-w-[140px]">{pin.locationName}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div>
        {/* Creator Info */}
        <div
          onClick={() => pin.userId && onOpenProfile(pin.userId)}
          className="flex items-center justify-between gap-2 mb-1.5 cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <UserAvatar
              uid={pin.userId}
              displayName={pin.userName}
              imageUrl={pin.userAvatar}
              size="xs"
            />
            <span className="text-xs font-semibold text-slate-600 dark:text-white/55 group-hover:text-slate-950 dark:group-hover:text-white truncate transition">
              @{pin.userName}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-white/45 tabular-nums">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>{pin.commentCount || 0}</span>
          </div>
        </div>

        <h4 className="font-heading text-lg font-bold tracking-tight mb-1 leading-snug text-slate-900 dark:text-white line-clamp-1">
          {pin.title}
        </h4>
        <p className="text-xs text-slate-600 dark:text-white/65 mb-3 line-clamp-2 leading-relaxed">
          {pin.description}
        </p>

        {/* Quiet inline tags metadata */}
        {pin.tags && pin.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-3.5 text-[11px] font-medium text-slate-500 dark:text-white/50">
            {pin.tags.slice(0, 3).map((tag, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <span>#{tag}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Action Button */}
        <button
          type="button"
          onClick={() => onOpenDetails(pin)}
          className="heyroq-btn-primary w-full min-h-[42px] py-2.5 px-4 font-bold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
        >
          <span>View Spot Details</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
