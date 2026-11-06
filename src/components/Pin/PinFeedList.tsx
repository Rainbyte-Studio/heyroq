import React, { useRef, useLayoutEffect } from 'react';
import { Pin } from '../../types';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeIndicator } from './LikeButton';
import { MessageCircle, MapPin, Sparkles, Navigation } from 'lucide-react';

interface PinFeedListProps {
  pins: Pin[];
  selectedPin: Pin | null;
  onSelectPin: (pin: Pin) => void;
  onOpenDetails: (pin: Pin) => void;
  onFlyToPin: (pin: Pin) => void;
  isOpen: boolean;
  onToggle: () => void;
  initialScrollTop?: number;
  onScroll?: (scrollTop: number) => void;
  isDesktop?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export const PinFeedList: React.FC<PinFeedListProps> = ({
  pins,
  selectedPin,
  onSelectPin,
  onOpenDetails,
  onFlyToPin,
  isOpen,
  onToggle,
  initialScrollTop = 0,
  onScroll,
  isDesktop = false,
  isError = false,
  onRetry,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Restore scroll position immediately upon mount/remount
  useLayoutEffect(() => {
    if (scrollContainerRef.current && initialScrollTop > 0) {
      scrollContainerRef.current.scrollTop = initialScrollTop;
    }
  }, [initialScrollTop]);

  if (!isOpen) return null;

  return (
    <aside
      id="pin-discovery-feed-drawer"
      className="w-full h-[45vh] sm:h-[40vh] lg:w-[380px] xl:w-[420px] lg:h-full transition-all duration-300 ease-in-out flex flex-col bg-black/85 backdrop-blur-2xl border-t lg:border-t-0 lg:border-l border-white/10 shadow-2xl z-20 text-white shrink-0 animate-in fade-in"
    >
      {/* Header with High-Impact Bold Typography */}
      <div className="p-4 sm:p-5 border-b border-white/10 bg-black/40 flex flex-col gap-1.5 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black leading-none uppercase tracking-tighter text-white">
            NEARBY <span className="text-[#FF5F40]">SPOTS</span>
          </h2>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Close spots feed"
            className="text-xs font-black uppercase tracking-widest text-white/70 hover:text-white px-3 py-1.5 rounded-lg border border-white/20 transition cursor-pointer min-h-[36px] flex items-center"
          >
            Close
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/40">
          <span>{isError && pins.length === 0 ? 'Discovery Offline' : `${pins.length} Spots Identified`}</span>
          <span className="text-[#FF5F40] flex items-center gap-1 font-black">
            <Sparkles className="w-3 h-3" /> Live Feed
          </span>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 sm:space-y-3.5 no-scrollbar pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4"
      >
          {pins.length === 0 ? (
            isError ? (
              <div className="text-center py-16 text-white/40 text-xs px-4">
                <MapPin className="w-8 h-8 mx-auto mb-3 opacity-40 text-[#FF5F40]" />
                <p className="font-black text-sm uppercase tracking-wider text-white">Discovery Feed Offline</p>
                <p className="mt-1 text-white/50 max-w-xs mx-auto">
                  Unable to reach discovery service. Please check your connection or retry.
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-wider rounded-xl border border-white/20 transition cursor-pointer min-h-[36px]"
                  >
                    Retry Discovery
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-white/40 text-xs">
                <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30 text-white" />
                <p className="font-black text-sm uppercase tracking-wider text-white">No spots found in view</p>
                <p className="mt-1 text-white/50 max-w-xs mx-auto">
                  Pan the map or be the first explorer to drop a pin in this area.
                </p>
              </div>
            )
          ) : (
            pins.map((pin) => {
              const isSelected = selectedPin?.id === pin.id;
              const img =
                pin.imageUrls?.[0] ||
                'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80';

              return (
                <div
                  key={pin.id}
                  id={`feed-card-${pin.id}`}
                  onClick={() => {
                    onSelectPin(pin);
                    if (!isDesktop) {
                      onOpenDetails(pin);
                    }
                  }}
                  className={`flex gap-3.5 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer group ${
                    isSelected
                      ? 'bg-white/10 border-[#FF5F40] shadow-[0_0_20px_rgba(255,95,64,0.3)] ring-1 ring-[#FF5F40]'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="w-20 h-20 rounded-xl bg-neutral-900 relative overflow-hidden shrink-0 border border-white/10">
                    <img
                      src={img}
                      alt={pin.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <CategoryBadge category={pin.category} size="xs" />
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider truncate">
                          @{pin.userName}
                        </span>
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-tight text-white group-hover:text-[#FF5F40] transition truncate leading-snug">
                        {pin.title}
                      </h3>
                      <p className="text-xs text-white/60 line-clamp-1 mt-0.5 font-normal">
                        {pin.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-white/40">
                      <div className="flex items-center gap-3">
                        <LikeIndicator count={pin.likeCount || 0} variant="feed" />
                        <span className="flex items-center gap-1 font-bold text-xs text-white/50">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {pin.commentCount || 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFlyToPin(pin);
                          }}
                          className="p-1.5 hover:text-white text-white/50 transition cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg hover:bg-white/10"
                          title="Center on Map"
                          aria-label="Center on Map"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetails(pin);
                          }}
                          className="px-3 py-1.5 bg-[#FF5F40] text-white rounded-full font-black text-xs uppercase tracking-wider hover:bg-[#ff7256] transition cursor-pointer min-h-[34px] flex items-center"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
    </aside>
  );
};
