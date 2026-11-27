import React, { useRef, useLayoutEffect, useState, useEffect, useCallback, useMemo } from 'react';
import { Pin } from '../../types';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeIndicator } from './LikeButton';
import { MessageCircle, MapPin, Navigation } from 'lucide-react';
import { UserAvatar } from '../Common/UserAvatar';
import { CloseButton } from '../Common/CloseButton';
import { SpotPhotoFallback } from '../Common/SpotPhotoFallback';
import {
  type NearbySheetSnap,
  computeNearbySheetHeights,
  cycleNearbySheetSnap,
  stepNearbySheetSnap,
  resolveSnapTarget,
} from '../../utils/nearbySheetState';

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
  sheetSnap?: NearbySheetSnap;
  onSheetSnapChange?: (snap: NearbySheetSnap) => void;
  containerHeight?: number;
  isInitialLoading?: boolean;
}

const DRAG_ACTIVATION_THRESHOLD_PX = 6;

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

function clampWithRubberBand(value: number, min: number, max: number): number {
  if (value < min) {
    return Math.round(min - (min - value) * 0.18);
  }
  if (value > max) {
    return Math.round(max + (value - max) * 0.18);
  }
  return Math.round(value);
}

function getSnapAnnouncement(heading: string, snap: NearbySheetSnap): string {
  if (snap === 'collapsed') return `${heading} collapsed`;
  if (snap === 'half') return `${heading} half expanded`;
  return `${heading} expanded`;
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
  isLive = true,
  searchQuery,
  isSearching = false,
  isError = false,
  onRetry,
  sheetSnap = 'collapsed',
  onSheetSnapChange,
  containerHeight = 560,
  isInitialLoading = false,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const suppressNextHandleClickRef = useRef(false);

  const snapHeights = useMemo(
    () => computeNearbySheetHeights(containerHeight),
    [containerHeight],
  );

  // Keep latest values accessible to active gesture listeners without restarting listeners mid-drag
  const snapHeightsRef = useRef(snapHeights);
  snapHeightsRef.current = snapHeights;
  const sheetSnapRef = useRef<NearbySheetSnap>(sheetSnap);
  sheetSnapRef.current = sheetSnap;
  const onSheetSnapChangeRef = useRef(onSheetSnapChange);
  onSheetSnapChangeRef.current = onSheetSnapChange;

  const heading = searchQuery ? 'Matching Spots' : 'Nearby Spots';
  const headingRef = useRef(heading);
  headingRef.current = heading;

  const commitSnap = useCallback((nextSnap: NearbySheetSnap) => {
    onSheetSnapChangeRef.current?.(nextSnap);
    setAnnouncement(getSnapAnnouncement(headingRef.current, nextSnap));
  }, []);

  // Reset transient drag state if sheet switches to desktop or closes
  useEffect(() => {
    if (isDesktop || !isOpen) {
      setDragHeight(null);
      setIsDragging(false);
    }
  }, [isDesktop, isOpen]);

  const currentHeight = dragHeight ?? snapHeights[sheetSnap];
  const showMobileBody = isDragging
    ? currentHeight > snapHeights.collapsed + 8
    : sheetSnap !== 'collapsed';

  // Restore scroll position immediately upon mount/remount or when mobile body becomes visible
  useLayoutEffect(() => {
    if ((isDesktop || showMobileBody) && scrollContainerRef.current && initialScrollTop > 0) {
      scrollContainerRef.current.scrollTop = initialScrollTop;
    }
  }, [initialScrollTop, isDesktop, showMobileBody]);

  // Pointer drag handler for the mobile drag handle & header bar
  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDesktop) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      const closestButton = target?.closest('button');
      const isHandleButton = closestButton?.id === 'nearby-spots-sheet-handle';
      // Never hijack taps on the Close button or any other interactive header control
      if (closestButton && !isHandleButton) return;

      const pointerId = e.pointerId;
      const startY = e.clientY;
      const startSnap = sheetSnapRef.current;
      const startHeight = snapHeightsRef.current[startSnap];
      let lastY = startY;
      let lastTime = performance.now();
      let velocity = 0; // px/ms (> 0 = dragging up / expanding, < 0 = dragging down / collapsing)
      let moved = false;

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const deltaY = startY - moveEvent.clientY;

        if (!moved && Math.abs(deltaY) < DRAG_ACTIVATION_THRESHOLD_PX) {
          return;
        }

        if (!moved) {
          moved = true;
          setIsDragging(true);
        }

        const now = performance.now();
        const dt = Math.max(1, now - lastTime);
        const instantVelocity = (lastY - moveEvent.clientY) / dt;
        velocity = velocity * 0.4 + instantVelocity * 0.6;
        lastY = moveEvent.clientY;
        lastTime = now;

        const heights = snapHeightsRef.current;
        const nextHeight = clampWithRubberBand(
          startHeight + deltaY,
          heights.collapsed,
          heights.expanded,
        );
        setDragHeight(nextHeight);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerEnd);
        window.removeEventListener('pointercancel', onPointerEnd);
      };

      const onPointerEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        cleanup();

        if (moved) {
          if (isHandleButton) {
            suppressNextHandleClickRef.current = true;
            window.setTimeout(() => {
              suppressNextHandleClickRef.current = false;
            }, 0);
          }
          const finalHeight = startHeight + (startY - endEvent.clientY);
          const targetSnap = resolveSnapTarget({
            startSnap,
            currentHeight: finalHeight,
            velocityPxPerMs: velocity,
            snapHeights: snapHeightsRef.current,
          });
          setDragHeight(null);
          setIsDragging(false);
          commitSnap(targetSnap);
          return;
        }

        // Clean tap on the collapsed header bar (outside the handle button and Close button)
        // smoothly opens to half-expanded. Tapping the handle button is handled by its onClick.
        if (!isHandleButton && startSnap === 'collapsed') {
          commitSnap('half');
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerEnd);
    },
    [isDesktop, commitSnap],
  );

  // Touch scroll-to-sheet handoff on the mobile scrollable content list:
  // - Mid-list (scrollTop > 0): always preserve native vertical scrolling.
  // - At top (scrollTop <= 0) pulling downward: cleanly hand off to collapse/shrink the sheet
  //   while preventing background page scroll or Safari overscroll bounce.
  useEffect(() => {
    if (isDesktop || !isOpen || !showMobileBody) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    let activeTouchId: number | null = null;
    let startY = 0;
    let startX = 0;
    let eligible = false;
    let lockedToScroll = false;
    let draggingSheet = false;
    let dragOriginY = 0;
    let startHeight = 0;
    let startSnap: NearbySheetSnap = 'half';
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    const findTouch = (touches: TouchList, id: number): Touch | null => {
      for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === id) return touches[i];
      }
      return null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      activeTouchId = touch.identifier;
      startY = touch.clientY;
      startX = touch.clientX;
      eligible = el.scrollTop <= 1;
      lockedToScroll = !eligible;
      draggingSheet = false;
      velocity = 0;
      lastY = touch.clientY;
      lastTime = performance.now();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeTouchId === null || lockedToScroll) return;
      const touch = findTouch(e.touches, activeTouchId);
      if (!touch) return;

      const deltaY = touch.clientY - startY; // > 0 means pulling downward
      const deltaX = Math.abs(touch.clientX - startX);

      if (!draggingSheet) {
        if (deltaX > 10 && deltaX > Math.abs(deltaY)) {
          lockedToScroll = true;
          return;
        }
        // User is swiping upward to scroll down through the list -> let native scroll own it
        if (deltaY < -DRAG_ACTIVATION_THRESHOLD_PX) {
          lockedToScroll = true;
          return;
        }
        if (deltaY > DRAG_ACTIVATION_THRESHOLD_PX + 2 && el.scrollTop <= 1) {
          draggingSheet = true;
          dragOriginY = touch.clientY;
          startSnap = sheetSnapRef.current;
          startHeight = snapHeightsRef.current[startSnap];
          lastY = touch.clientY;
          lastTime = performance.now();
          setIsDragging(true);
        } else {
          return;
        }
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      const instantVelocity = (lastY - touch.clientY) / dt;
      velocity = velocity * 0.4 + instantVelocity * 0.6;
      lastY = touch.clientY;
      lastTime = now;

      const heights = snapHeightsRef.current;
      const rawHeight = startHeight - (touch.clientY - dragOriginY);
      setDragHeight(clampWithRubberBand(rawHeight, heights.collapsed, heights.expanded));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (activeTouchId === null) return;
      const ended = findTouch(e.changedTouches, activeTouchId);
      if (!ended) return;

      const wasDragging = draggingSheet;
      const endY = ended.clientY;
      activeTouchId = null;
      draggingSheet = false;
      lockedToScroll = false;

      if (wasDragging) {
        const finalHeight = startHeight - (endY - dragOriginY);
        const targetSnap = resolveSnapTarget({
          startSnap,
          currentHeight: finalHeight,
          velocityPxPerMs: velocity,
          snapHeights: snapHeightsRef.current,
        });
        setDragHeight(null);
        setIsDragging(false);
        commitSnap(targetSnap);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isDesktop, isOpen, showMobileBody, commitSnap]);

  const handleSheetHandleClick = useCallback(() => {
    if (suppressNextHandleClickRef.current) {
      suppressNextHandleClickRef.current = false;
      return;
    }
    commitSnap(cycleNearbySheetSnap(sheetSnapRef.current));
  }, [commitSnap]);

  const handleSheetHandleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        commitSnap(stepNearbySheetSnap(sheetSnapRef.current, 'up'));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        commitSnap(stepNearbySheetSnap(sheetSnapRef.current, 'down'));
      } else if (e.key === 'Home') {
        e.preventDefault();
        commitSnap('expanded');
      } else if (e.key === 'End') {
        e.preventDefault();
        commitSnap('collapsed');
      }
    },
    [commitSnap],
  );

  if (!isOpen) return null;

  const isEmptyNearbyFeed = !searchQuery && pins.length === 0;
  const count = `${pins.length} ${pins.length === 1 ? 'spot' : 'spots'}`;
  const spotCountCopy = searchQuery
    ? isSearching ? 'Searching…' : isError ? 'Search unavailable' : count + ' found'
    : isError
      ? 'Discovery offline'
      : isInitialLoading && pins.length === 0
        ? 'Loading spots…'
        : count + ' in this area';

  const handleAriaLabel =
    sheetSnap === 'collapsed'
      ? `Expand ${heading} sheet`
      : sheetSnap === 'half'
        ? `Expand ${heading} sheet to full height`
        : `Collapse ${heading} sheet`;

  const renderHeaderContent = () => (
    <>
      <div className="min-w-0 flex flex-col gap-0.5 sm:gap-1">
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
    </>
  );

  const renderFeedBodyContent = () => {
    if (pins.length === 0) {
      if (isError) {
        return (
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
        );
      }

      return (
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
      );
    }

    return pins.map((pin) => {
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
    });
  };

  // Desktop: preserve the established right-side Nearby Spots sidebar unchanged
  if (isDesktop) {
    return (
      <aside
        id="pin-discovery-feed-drawer"
        aria-label={heading}
        className="liquid-glass-panel w-[344px] xl:w-[372px] h-full transition-colors duration-200 flex flex-col border-l border-[var(--heyroq-glass-border)] z-20 text-[var(--heyroq-text-primary)] shrink-0 animate-in fade-in"
      >
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--heyroq-divider)] flex items-center justify-between gap-3 shrink-0">
          {renderHeaderContent()}
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
          className={`flex-1 overflow-y-auto p-3 sm:p-3.5 space-y-2.5 subtle-glass-scrollbar ${isEmptyNearbyFeed ? 'pb-4' : 'pb-4'}`}
        >
          {renderFeedBodyContent()}
        </div>
      </aside>
    );
  }

  // Mobile / tablet (< 1024px): draggable multi-position bottom sheet overlaying the map
  return (
    <aside
      id="pin-discovery-feed-drawer"
      data-sheet-snap={sheetSnap}
      aria-label={heading}
      style={{ height: `${currentHeight}px` }}
      className={`liquid-glass-sheet absolute inset-x-0 bottom-0 z-[25] rounded-t-[24px] flex flex-col overflow-hidden text-[var(--heyroq-text-primary)] ${
        isDragging
          ? 'transition-none select-none'
          : 'transition-[height] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
      }`}
    >
      {/* Interactive Drag Handle + Compact Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        className={`shrink-0 touch-none select-none ${
          showMobileBody ? 'border-b border-[var(--heyroq-divider)]' : ''
        }`}
      >
        <button
          id="nearby-spots-sheet-handle"
          type="button"
          onClick={handleSheetHandleClick}
          onKeyDown={handleSheetHandleKeyDown}
          aria-label={handleAriaLabel}
          aria-expanded={sheetSnap !== 'collapsed'}
          aria-controls="nearby-spots-sheet-content"
          className="w-full min-h-[28px] pt-2 pb-1 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none heyroq-focus-ring rounded-t-[24px]"
        >
          <span
            aria-hidden="true"
            className="w-10 h-1 rounded-full bg-[var(--heyroq-border-strong)]"
          />
        </button>

        <div className="px-4 sm:px-5 pt-0.5 pb-3 flex items-center justify-between gap-3">
          {renderHeaderContent()}
        </div>
      </div>

      {/* Scrollable Spots List / Empty State (hidden in Collapsed state) */}
      {showMobileBody && (
        <div
          id="nearby-spots-sheet-content"
          ref={scrollContainerRef}
          onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-3.5 space-y-2.5 subtle-glass-scrollbar pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        >
          {renderFeedBodyContent()}
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </aside>
  );
};
