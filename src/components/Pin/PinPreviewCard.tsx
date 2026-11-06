import React from 'react';
import { Pin } from '../../types';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeButton } from './LikeButton';
import { MessageCircle, MapPin, X, ArrowRight, User } from 'lucide-react';

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
      className="bg-black/85 backdrop-blur-2xl border border-white/20 rounded-[28px] sm:rounded-[32px] overflow-hidden w-full max-w-[calc(100vw-24px)] sm:max-w-xs sm:w-80 transition-all duration-300 transform shadow-2xl p-4 sm:p-5 text-white animate-in fade-in slide-in-from-top-4"
    >
      {/* Cover Photo */}
      <div className="relative h-40 sm:h-44 rounded-2xl overflow-hidden mb-3 sm:mb-3.5 border border-white/10 group bg-neutral-900">
        <img
          src={mainImage}
          alt={pin.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center bg-black/60 hover:bg-black text-white rounded-full backdrop-blur-md transition border border-white/20 cursor-pointer z-10"
          aria-label="Close spot preview"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Category Pill */}
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

        {/* Location chip */}
        {pin.locationName && (
          <div className="absolute bottom-2.5 left-2.5 text-white text-[10px] flex items-center gap-1 font-bold uppercase tracking-wider bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10">
            <MapPin className="w-3 h-3 text-[#FF5F40]" />
            <span className="truncate max-w-[140px]">{pin.locationName}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div>
        {/* Creator Info */}
        <div
          onClick={() => pin.userId && onOpenProfile(pin.userId)}
          className="flex items-center justify-between gap-2 mb-2 cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            {pin.userAvatar ? (
              <img
                src={pin.userAvatar}
                alt={pin.userName}
                referrerPolicy="no-referrer"
                className="w-5 h-5 rounded-full object-cover ring-1 ring-[#FF5F40]"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[#FF5F40] flex items-center justify-center text-white text-[9px] font-black">
                {pin.userName?.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-[11px] font-bold text-white/50 group-hover:text-white uppercase tracking-wider truncate transition">
              @{pin.userName}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-white/40">
            <MessageCircle className="w-3 h-3" />
            <span>{pin.commentCount || 0}</span>
          </div>
        </div>

        <h4 className="text-xl font-black uppercase tracking-tight mb-1.5 leading-tight text-white line-clamp-1">
          {pin.title}
        </h4>
        <p className="text-xs text-white/60 mb-3 line-clamp-2 leading-relaxed">
          {pin.description}
        </p>

        {/* Tags */}
        {pin.tags && pin.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {pin.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="text-[9px] font-black uppercase tracking-wider bg-white/10 text-white/80 px-2 py-0.5 rounded border border-white/10"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Action Button */}
        <button
          type="button"
          onClick={() => onOpenDetails(pin)}
          className="w-full py-3 bg-white text-black font-black uppercase tracking-widest text-xs rounded-xl hover:bg-[#FF5F40] hover:text-white transition-colors cursor-pointer shadow-xl flex items-center justify-center gap-1.5"
        >
          <span>View Spot Details</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
