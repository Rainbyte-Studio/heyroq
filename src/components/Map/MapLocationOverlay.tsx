import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { APILoadingStatus } from '@vis.gl/react-google-maps';
import { Crosshair, Loader2, MapPin, Plus } from 'lucide-react';
import type { PinLocation } from '../../services/pinLocation';
import type { LatLngPoint } from '../../types';
import { CloseButton } from '../Common/CloseButton';

export interface MapLocationOverlayProps {
  isDesktop: boolean;
  isCreating: boolean;
  mapCandidate: { location: PinLocation; loading: boolean } | null;
  mapsStatus: APILoadingStatus;
  mapInstance: google.maps.Map | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onConfirmCreateLocation: () => void;
  onSelectCreateLocation: (loc: LatLngPoint, placeId?: string) => void;
  onCancelCreateLocation: () => void;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface BoxSize {
  width: number;
  height: number;
}

const DESKTOP_CARD_DEFAULT_WIDTH = 316;
const DESKTOP_CARD_DEFAULT_HEIGHT = 156;
const EDGE_MARGIN = 16;
const MARKER_GAP_ABOVE = 54;
const MARKER_GAP_BELOW = 20;
const BOTTOM_RIGHT_CONTROLS_HEIGHT = 148;
const BOTTOM_RIGHT_CONTROLS_WIDTH = 212;

/**
 * Projects a map coordinate into container pixel coordinates via a lightweight
 * Google Maps OverlayView. Safely returns null when projection is unavailable
 * (e.g. during fallback map mode or headless test fixtures).
 */
function useMarkerContainerPixel(
  mapInstance: google.maps.Map | null,
  point: LatLngPoint | null,
  enabled: boolean,
): ScreenPoint | null {
  const [pixel, setPixel] = useState<ScreenPoint | null>(null);
  const pointRef = useRef<LatLngPoint | null>(point);
  pointRef.current = point;

  useEffect(() => {
    if (!enabled || !mapInstance || !point) {
      setPixel(null);
      return;
    }

    const googleMaps = typeof window !== 'undefined' ? window.google?.maps : undefined;
    if (!googleMaps?.OverlayView || !googleMaps?.LatLng) {
      setPixel(null);
      return;
    }

    let rafId: number | null = null;
    let active = true;

    class ProjectionHelper extends googleMaps.OverlayView {
      onAdd() {}
      draw() {
        scheduleCompute();
      }
      onRemove() {}
    }

    const overlay = new ProjectionHelper();

    const computeNow = () => {
      if (!active) return;
      const target = pointRef.current;
      if (!target) {
        setPixel(null);
        return;
      }
      const projection =
        typeof overlay.getProjection === 'function' ? overlay.getProjection() : null;
      if (!projection || typeof projection.fromLatLngToContainerPixel !== 'function') {
        setPixel(null);
        return;
      }
      try {
        const pt = projection.fromLatLngToContainerPixel(
          new googleMaps.LatLng(target.lat, target.lng),
        );
        if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
          setPixel(prev =>
            prev && Math.abs(prev.x - pt.x) < 0.5 && Math.abs(prev.y - pt.y) < 0.5
              ? prev
              : { x: pt.x, y: pt.y },
          );
        }
      } catch {
        setPixel(null);
      }
    };

    const scheduleCompute = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        computeNow();
      });
    };

    overlay.setMap(mapInstance);
    scheduleCompute();

    const listeners: google.maps.MapsEventListener[] = [];
    const events = ['bounds_changed', 'center_changed', 'zoom_changed', 'idle'] as const;
    for (const eventName of events) {
      if (typeof mapInstance.addListener === 'function') {
        listeners.push(mapInstance.addListener(eventName, scheduleCompute));
      }
    }
    window.addEventListener('resize', scheduleCompute);

    return () => {
      active = false;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleCompute);
      for (const listener of listeners) {
        googleMaps.event?.removeListener?.(listener);
      }
      overlay.setMap(null);
    };
  }, [enabled, mapInstance, point?.lat, point?.lng]);

  return pixel;
}

/**
 * Computes clamped desktop popup coordinates anchored near the selected map marker,
 * flipping below the marker near the top edge and avoiding bottom-right map controls.
 */
export function computeDesktopCardPlacement(
  markerPx: ScreenPoint | null,
  containerSize: BoxSize,
  cardSize: BoxSize,
): {
  left: number;
  top: number;
  placement: 'above' | 'below' | 'floating';
  caretLeft: number | null;
} {
  const cardWidth = Math.min(
    cardSize.width || DESKTOP_CARD_DEFAULT_WIDTH,
    Math.max(240, containerSize.width - EDGE_MARGIN * 2),
  );
  const cardHeight = cardSize.height || DESKTOP_CARD_DEFAULT_HEIGHT;

  // Fallback centered upper-middle position when map projection is unavailable
  if (!markerPx || containerSize.width <= 0 || containerSize.height <= 0) {
    return {
      left: Math.max(EDGE_MARGIN, Math.round((containerSize.width - cardWidth) / 2)),
      top: Math.max(EDGE_MARGIN, Math.round(containerSize.height * 0.22)),
      placement: 'floating',
      caretLeft: null,
    };
  }

  const markerInViewport =
    markerPx.x >= -24 &&
    markerPx.x <= containerSize.width + 24 &&
    markerPx.y >= -24 &&
    markerPx.y <= containerSize.height + 24;

  const preferredAboveTop = markerPx.y - cardHeight - MARKER_GAP_ABOVE;
  const preferredBelowTop = markerPx.y + MARKER_GAP_BELOW;
  const maxTop = Math.max(EDGE_MARGIN, containerSize.height - cardHeight - EDGE_MARGIN);

  let placement: 'above' | 'below' = 'above';
  let top = preferredAboveTop;

  if (preferredAboveTop < EDGE_MARGIN) {
    if (preferredBelowTop + cardHeight <= containerSize.height - EDGE_MARGIN) {
      placement = 'below';
      top = preferredBelowTop;
    } else {
      placement = 'above';
      top = EDGE_MARGIN;
    }
  } else {
    top = Math.min(preferredAboveTop, maxTop);
  }

  const overlapsBottomRightControls =
    top + cardHeight > containerSize.height - BOTTOM_RIGHT_CONTROLS_HEIGHT;
  const rightMargin = overlapsBottomRightControls ? BOTTOM_RIGHT_CONTROLS_WIDTH : EDGE_MARGIN;
  const maxLeft = Math.max(EDGE_MARGIN, containerSize.width - cardWidth - rightMargin);
  const idealLeft = markerPx.x - cardWidth / 2;
  const left = Math.round(Math.min(Math.max(idealLeft, EDGE_MARGIN), maxLeft));
  const clampedTop = Math.round(Math.min(Math.max(top, EDGE_MARGIN), maxTop));

  const rawCaretOffset = markerPx.x - left;
  const showCaret =
    markerInViewport &&
    rawCaretOffset >= 24 &&
    rawCaretOffset <= cardWidth - 24 &&
    ((placement === 'above' && Math.abs(clampedTop + cardHeight + MARKER_GAP_ABOVE - markerPx.y) < 36) ||
      (placement === 'below' && Math.abs(clampedTop - MARKER_GAP_BELOW - markerPx.y) < 36));

  return {
    left,
    top: clampedTop,
    placement,
    caretLeft: showCaret ? Math.round(rawCaretOffset) : null,
  };
}

export const MapLocationOverlay: React.FC<MapLocationOverlayProps> = ({
  isDesktop,
  isCreating,
  mapCandidate,
  mapsStatus,
  mapInstance,
  containerRef,
  onConfirmCreateLocation,
  onSelectCreateLocation,
  onCancelCreateLocation,
}) => {
  const cardRef = useRef<HTMLElement>(null);
  const [containerSize, setContainerSize] = useState<BoxSize>({ width: 0, height: 0 });
  const [cardSize, setCardSize] = useState<BoxSize>({
    width: DESKTOP_CARD_DEFAULT_WIDTH,
    height: DESKTOP_CARD_DEFAULT_HEIGHT,
  });

  const location = mapCandidate?.location;
  const candidatePoint = location ? { lat: location.lat, lng: location.lng } : null;

  const markerPixel = useMarkerContainerPixel(
    mapInstance,
    candidatePoint,
    Boolean(isDesktop && mapCandidate),
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize(prev =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };

    updateSize();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(container);
    window.addEventListener('resize', updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [containerRef, isDesktop, Boolean(mapCandidate)]);

  useLayoutEffect(() => {
    if (!isDesktop || !mapCandidate || !cardRef.current) return;
    const node = cardRef.current;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCardSize(prev =>
          Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
            ? prev
            : { width: rect.width, height: rect.height },
        );
      }
    };

    measure();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [isDesktop, mapCandidate]);

  if (!isCreating && !mapCandidate) return null;

  const unavailable =
    mapsStatus === APILoadingStatus.FAILED || mapsStatus === APILoadingStatus.AUTH_FAILURE;

  // =========================================================================
  // 1. CHOOSE ON MAP MODE (no candidate selected yet)
  // Compact top-center floating header that keeps central map unobstructed
  // =========================================================================
  if (!location) {
    const instruction = unavailable
      ? 'Google Maps is unavailable. Cancel to choose another option.'
      : mapsStatus === APILoadingStatus.LOADED
        ? 'Tap or click anywhere on the map to place your pin.'
        : 'Loading Google Maps…';

    return (
      <section
        id="map-location-selection"
        aria-label="Map location selection"
        className={`liquid-glass-floating absolute left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-30 mx-auto w-auto sm:min-w-[356px] sm:max-w-[440px] rounded-2xl px-4 py-3 text-[var(--heyroq-text-primary)] animate-in fade-in slide-in-from-top-2 duration-150 ${
          unavailable ? 'top-24 sm:top-24' : 'top-3 sm:top-4'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] mt-0.5"
          >
            <MapPin className="w-4 h-4" strokeWidth={2} />
          </div>

          <div role="status" className="min-w-0 flex-1 break-words">
            <p className="font-heading text-sm font-bold tracking-tight text-[var(--heyroq-text-primary)] leading-tight">
              Choose a Location
            </p>
            <p className="mt-0.5 text-xs text-[var(--heyroq-text-secondary)] leading-snug">
              {instruction}
            </p>
          </div>

          <CloseButton
            id="cancel-map-pick-btn"
            size="sm"
            ariaLabel="Cancel"
            title="Cancel location selection"
            onClick={onCancelCreateLocation}
          />
        </div>

        {isCreating && mapInstance && !unavailable && (
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--heyroq-divider)] pt-2">
            <button
              type="button"
              onClick={() => {
                const point = mapInstance.getCenter();
                if (point) onSelectCreateLocation(point.toJSON());
              }}
              className="inline-flex min-h-[44px] sm:min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 -ml-1.5 text-xs font-medium text-[var(--heyroq-text-secondary)] hover:bg-[var(--heyroq-bg-subtle)] hover:text-[var(--heyroq-text-primary)] transition-colors cursor-pointer heyroq-focus-ring touch-manipulation"
            >
              <Crosshair
                aria-hidden="true"
                className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0"
              />
              <span>Select map center</span>
            </button>
            <span className="text-[11px] text-[var(--heyroq-text-muted)] hidden sm:inline">
              Esc to cancel
            </span>
          </div>
        )}
      </section>
    );
  }

  // Shared content for Selected Location card (Desktop popup & Mobile bottom sheet)
  const placeTitle = location.locationName || 'Selected location';
  const renderLocationDetails = () => (
    <div role="status" className="min-w-0 flex-1 break-words">
      <p className="font-heading text-[15px] font-bold tracking-tight text-[var(--heyroq-text-primary)] leading-snug">
        {placeTitle}
      </p>
      {mapCandidate?.loading ? (
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[var(--heyroq-text-secondary)]">
          <Loader2
            aria-hidden="true"
            className="w-3 h-3 animate-spin text-[var(--brand-primary)] shrink-0"
          />
          <span>Looking up location…</span>
        </p>
      ) : location.address ? (
        <p className="mt-0.5 text-xs text-[var(--heyroq-text-secondary)] leading-relaxed line-clamp-2">
          {location.address} · Google Maps
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-[var(--heyroq-text-muted)] leading-snug">
          No address available
        </p>
      )}
      {location.locationName && !location.address && !mapCandidate?.loading && (
        <p className="mt-0.5 text-[11px] font-medium text-[var(--heyroq-text-muted)]">
          Google Maps
        </p>
      )}
    </div>
  );

  // =========================================================================
  // 2A. SELECTED LOCATION — DESKTOP MARKER-ANCHORED CONTEXTUAL POPUP
  // =========================================================================
  if (isDesktop) {
    const { left, top, placement, caretLeft } = computeDesktopCardPlacement(
      markerPixel,
      containerSize,
      cardSize,
    );

    return (
      <section
        ref={cardRef}
        id="map-location-selection"
        aria-label="Map location selection"
        style={{
          left: `${left}px`,
          top: `${top}px`,
        }}
        className="liquid-glass-floating absolute z-30 w-[316px] max-w-[calc(100%-2rem)] rounded-[20px] p-4 text-[var(--heyroq-text-primary)] animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] mt-0.5"
          >
            <MapPin className="w-[18px] h-[18px]" strokeWidth={2} />
          </div>

          {renderLocationDetails()}

          <CloseButton
            id="cancel-map-pick-btn"
            size="sm"
            ariaLabel="Cancel"
            title="Dismiss selected location"
            onClick={onCancelCreateLocation}
          />
        </div>

        <div className="mt-3.5">
          <button
            type="button"
            onClick={onConfirmCreateLocation}
            disabled={mapCandidate?.loading}
            className="heyroq-btn-primary flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold tracking-tight transition-all active:scale-[0.98] cursor-pointer heyroq-focus-ring disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />
            <span>Create Pin Here</span>
          </button>
        </div>

        {/* Subtle directional caret anchored toward the selected map marker */}
        {caretLeft !== null && placement === 'above' && (
          <div
            aria-hidden="true"
            style={{ left: `${caretLeft}px` }}
            className="pointer-events-none absolute -bottom-[7px] -translate-x-1/2 h-3.5 w-3.5 rotate-45 border-r border-b border-[var(--glass-border-strong)] bg-[var(--glass-floating-bg)]"
          />
        )}
        {caretLeft !== null && placement === 'below' && (
          <div
            aria-hidden="true"
            style={{ left: `${caretLeft}px` }}
            className="pointer-events-none absolute -top-[7px] -translate-x-1/2 h-3.5 w-3.5 rotate-45 border-l border-t border-[var(--glass-border-strong)] bg-[var(--glass-floating-bg)]"
          />
        )}
      </section>
    );
  }

  // =========================================================================
  // 2B. SELECTED LOCATION — MOBILE COMPACT BOTTOM SHEET
  // Respects iPhone safe areas, >=44px touch targets, clear of map controls
  // =========================================================================
  return (
    <section
      id="map-location-selection"
      aria-label="Map location selection"
      className="liquid-glass-floating absolute inset-x-0 bottom-0 z-30 rounded-t-[24px] border-x-0 border-b-0 px-4 pt-2 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] text-[var(--heyroq-text-primary)] animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      {/* Subtle bottom-sheet grab handle */}
      <div
        aria-hidden="true"
        className="mx-auto mb-2 h-1 w-9 rounded-full bg-[var(--heyroq-border-strong)]"
      />

      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] mt-0.5"
        >
          <MapPin className="w-[18px] h-[18px]" strokeWidth={2} />
        </div>

        {renderLocationDetails()}

        <CloseButton
          id="cancel-map-pick-btn"
          size="sm"
          ariaLabel="Cancel"
          title="Dismiss selected location"
          onClick={onCancelCreateLocation}
        />
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onConfirmCreateLocation}
          disabled={mapCandidate?.loading}
          className="heyroq-btn-primary flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tracking-tight transition-all active:scale-[0.98] cursor-pointer heyroq-focus-ring touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />
          <span>Create Pin Here</span>
        </button>
      </div>
    </section>
  );
};
