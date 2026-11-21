import React, { useRef, useLayoutEffect, useState } from 'react';
import { Pin } from '../../types';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeIndicator } from './LikeButton';
import { MessageCircle, MapPin, Navigation } from 'lucide-react';
import { UserAvatar } from '../Common/UserAvatar';
import { CloseButton } from '../Common/CloseButton';
import { SpotPhotoFallback } from '../Common/SpotPhotoFallback';

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
  isLive?: boolean;
  searchQuery?: string;
  isSearching?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

const FeedThumbnail: React.FC<{ pin: Pin }> = ({ pin }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = pin.imageUrls?.[0];

  if (!src || imgFailed) {
    return (
      <SpotPhotoFallback
        category={pin.category}
        title={pin.title}
        compact
        className="w-full h-full"
      />
    );
  }

  return (
    <img
      src={src}
      alt={pin.title}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
};

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
  isLive = true,
  searchQuery,
  isSearching = false,
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

  const mobileHeightClass =
    pins.length === 0 ? 'h-auto max-h-[224px]' : 'h-[38vh] sm:h-[36vh]';

  const heading = searchQuery ? 'Matching Spots' : 'Nearby Spots';
  const count = `${pins.length} ${pins.length === 1 ? 'spot' : 'spots'}`;
  const spotCountCopy = searchQuery
    ? isSearching ? 'Searching…' : isError ? 'Search unavailable' : count + ' found'
    : isError ? 'Discovery offline' : count + ' in this area';

  return (
    <aside
      id="pin-discovery-feed-drawer"
      aria-label={heading}
      className={`liquid-glass-panel w-full ${mobileHeightClass} lg:max-h-none lg:w-[344px] xl:w-[372px] lg:h-full transition-colors duration-200 flex flex-col border-t lg:border-t-0 lg:border-l border-[var(--heyroq-glass-border)] z-20 text-[var(--heyroq-text-primary)] shrink-0 animate-in fade-in`}
    >
      {/* Unified Compact Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--heyroq-divider)] flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 flex flex-col gap-1">
          <h2 className="font-heading text-base sm:text-[17px] font-semibold leading-tight tracking-tight text-[var(--heyroq-text-primary)] truncate">
            {heading}
          </h2>
          <p className="font-sans text-xs font-medium text-[var(--heyroq-text-secondary)] leading-snug tabular-nums truncate">
            {spotCountCopy}
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-3.5 shrink-0">
          {!searchQuery && !isError &&
            (isLive ? (
              <span
                id="nearby-spots-live-indicator"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--heyroq-text-secondary)] select-none whitespace-nowrap"
                title="Real-time map updates active"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] shrink-0"
                  aria-hidden="true"
                />
                <span>Live</span>
              </span>
            ) : (
              <span
                id="nearby-spots-filtered-indicator"
                className="text-xs font-medium text-[var(--heyroq-text-muted)] select-none whitespace-nowrap"
              >
                Filtered
              </span>
            ))}

          <CloseButton onClick={onToggle} ariaLabel={`Close ${heading}`} />
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto p-3 sm:p-3.5 space-y-2.5 subtle-glass-scrollbar pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-4"
      >
        {pins.length === 0 ? (
          isError ? (
            <div className="text-center py-6 lg:py-12 text-[var(--heyroq-text-muted)] text-xs px-4">
              <div className="w-9 h-9 rounded-xl liquid-glass-card mx-auto mb-2.5 flex items-center justify-center text-[var(--brand-primary)]">
                <MapPin className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <p className="font-heading font-semibold text-sm text-[var(--heyroq-text-primary)]">
                {searchQuery ? 'Spot search unavailable' : 'Discovery feed offline'}
              </p>
              <p className="mt-1 text-[var(--heyroq-text-secondary)] max-w-[236px] mx-auto leading-relaxed">
                {searchQuery ? 'Check your connection and retry.' : 'Unable to reach the discovery service. Check your connection or retry.'}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-3 px-4 py-2 liquid-glass-pill text-[var(--heyroq-text-primary)] text-xs font-semibold rounded-full transition cursor-pointer min-h-[38px]"
                >
                  {searchQuery ? 'Retry search' : 'Retry Discovery'}
                </button>
              )}
            </div>
          ) : (
            <div
              id="nearby-spots-empty-state"
              className="text-center py-5 lg:py-10 text-[var(--heyroq-text-muted)] text-xs px-4"
            >
              <div className="w-9 h-9 rounded-xl liquid-glass-card mx-auto mb-2.5 flex items-center justify-center text-[var(--brand-primary)]">
                <MapPin className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <p className="font-heading font-semibold text-sm text-[var(--heyroq-text-primary)]">
                {isSearching ? 'Searching spots…' : searchQuery ? 'No matching spots' : 'No spots in this area'}
              </p>
              <p className="mt-1 text-xs text-[var(--heyroq-text-secondary)] max-w-[236px] mx-auto leading-relaxed">
                {searchQuery ? (isSearching ? '' : `No spots match “${searchQuery}”.`) : 'Move the map or explore another location to discover spots.'}
              </p>
            </div>
          )
        ) : (
          pins.map((pin) => {
            const isSelected = selectedPin?.id === pin.id;

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
                className={`flex gap-3.5 p-3.5 rounded-2xl transition-all duration-150 cursor-pointer group ${
                  isSelected
                    ? 'bg-[#FFFFFF] dark:bg-[#2B2C31] border border-[var(--brand-primary)]/75 ring-1 ring-[var(--brand-primary)]/45 shadow-[var(--heyroq-shadow-floating)]'
                    : 'liquid-glass-card hover:border-[#202124]/20 dark:hover:border-[#F5F4F1]/22'
                }`}
              >
                <div className="w-20 h-20 rounded-xl bg-[#F3F1ED] dark:bg-[#2B2C31] relative overflow-hidden shrink-0 border border-[var(--heyroq-border-subtle)]">
                  <FeedThumbnail pin={pin} />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <CategoryBadge category={pin.category} size="xs" />
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--heyroq-text-muted)] min-w-0">
                        <UserAvatar
                          uid={pin.userId}
                          displayName={pin.userName}
                          imageUrl={pin.userAvatar}
                          size="xs"
                          className="w-4 h-4"
                        />
                        <span className="truncate">@{pin.userName}</span>
                      </span>
                    </div>
                    <h3 className="font-heading font-semibold text-sm tracking-tight text-[var(--heyroq-text-primary)] group-hover:text-[var(--heyroq-accent-text)] transition truncate leading-snug">
                      {pin.title}
                    </h3>
                    <p className="text-xs text-[var(--heyroq-text-secondary)] line-clamp-1 mt-0.5">
                      {pin.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-[var(--heyroq-divider)] text-xs text-[var(--heyroq-text-muted)]">
                    <div className="flex items-center gap-3 tabular-nums">
                      <LikeIndicator count={pin.likeCount || 0} variant="feed" />
                      <span className="flex items-center gap-1 font-semibold text-xs text-[var(--heyroq-text-muted)]">
                        <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>{pin.commentCount || 0}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFlyToPin(pin);
                        }}
                        className="p-1.5 text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl hover:bg-[#F3F1ED] dark:hover:bg-[#2B2C31]"
                        title="Center on Map"
                        aria-label="Center on Map"
                      >
                        <Navigation className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetails(pin);
                        }}
                        className="heyroq-btn-primary px-3.5 py-1.5 rounded-full font-semibold text-xs cursor-pointer min-h-[34px] flex items-center"
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
