import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Map,
  useMap,
  AdvancedMarker,
  ColorScheme,
} from '@vis.gl/react-google-maps';
import { Pin, LatLngBounds, LatLngPoint } from '../../types';
import { ClusteredMarkers } from './ClusteredMarkers';
import { CATEGORY_CONFIG } from './CategoryBadge';
import { LikeIndicator } from '../Pin/LikeButton';
import { useTheme } from '../../context/ThemeContext';
import { CloseButton } from '../Common/CloseButton';
import {
  MapPin,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Info,
  ExternalLink,
  Layers,
  X,
  Globe,
  Plus,
  ListFilter,
  Eye,
  EyeOff,
} from 'lucide-react';

interface HeyroqMapProps {
  pins: Pin[];
  selectedPin: Pin | null;
  onSelectPin: (pin: Pin | null) => void;
  onOpenDetails?: (pin: Pin) => void;
  onBoundsChange: (bounds: LatLngBounds) => void;
  isCreating: boolean;
  createLocation: LatLngPoint | null;
  onSelectCreateLocation: (loc: LatLngPoint) => void;
  onCancelCreateLocation?: () => void;
  center?: LatLngPoint;
  isDesktop?: boolean;
  onToggleDrawer?: () => void;
  isDrawerOpen?: boolean;
  displayedPinsCount?: number;
  onDropPin?: () => void;
  showPinMarkers?: boolean;
  onTogglePinMarkers?: () => void;
}

/**
 * Controller to programmatically synchronize map camera, container resizing, bounds,
 * and seamless camera preservation across Light/Dark ColorScheme transitions.
 */
const MapController: React.FC<{
  center?: LatLngPoint;
  onBoundsChange: (bounds: LatLngBounds) => void;
  isCreating: boolean;
  onSelectCreateLocation: (loc: LatLngPoint) => void;
  onMapInstance?: (map: google.maps.Map | null) => void;
  mapStyle: 'standard' | 'satellite';
}> = ({
  center,
  onBoundsChange,
  isCreating,
  onSelectCreateLocation,
  onMapInstance,
  mapStyle,
}) => {
  const map = useMap();
  const debounceTimer = useRef<any>(null);
  const isInitialMount = useRef(true);
  const lastCameraRef = useRef<{ center: LatLngPoint; zoom: number } | null>(null);
  const prevMapRef = useRef<google.maps.Map | null>(null);
  const prevCenterPropRef = useRef<LatLngPoint | undefined>(center);

  // Synchronize active map instance to parent
  useEffect(() => {
    if (map && onMapInstance) {
      onMapInstance(map);
    }
  }, [map, onMapInstance]);

  // Completely disable all native Google navigation controls, Street View, pan arrows, and keyboard shortcuts
  useEffect(() => {
    if (!map) return;
    map.setOptions({
      disableDefaultUI: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      rotateControl: false,
      scaleControl: false,
      panControl: false,
      cameraControl: false,
      keyboardShortcuts: false,
    });
  }, [map]);

  // Synchronize map type instantly without page reload
  useEffect(() => {
    if (!map) return;
    const targetType = mapStyle === 'satellite' ? 'hybrid' : 'roadmap';
    if (map.getMapTypeId() !== targetType) {
      map.setMapTypeId(targetType);
    }
  }, [map, mapStyle]);

  // Keep center synchronized and preserve camera smoothly if map re-instantiates on theme switch
  useEffect(() => {
    if (!map) return;

    const mapChanged = prevMapRef.current !== null && prevMapRef.current !== map;
    prevMapRef.current = map;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (center) {
        map.setCenter(center);
      }
      const currentZoom = map.getZoom();
      if (typeof currentZoom !== 'number' || currentZoom < 4) {
        map.setZoom(12);
      }
      prevCenterPropRef.current = center;
      return;
    }

    // If map instance swapped due to Light <-> Dark ColorScheme change, restore user's exact camera
    if (mapChanged && lastCameraRef.current) {
      map.setCenter(lastCameraRef.current.center);
      map.setZoom(lastCameraRef.current.zoom);
      prevCenterPropRef.current = center;
      return;
    }

    // Otherwise pan when external center prop explicitly changed
    if (
      center &&
      (!prevCenterPropRef.current ||
        prevCenterPropRef.current.lat !== center.lat ||
        prevCenterPropRef.current.lng !== center.lng)
    ) {
      prevCenterPropRef.current = center;
      map.panTo(center);
    }
  }, [map, center]);

  // Handle container resize, dimension changes and header stabilization
  useEffect(() => {
    if (!map) return;
    const mapDiv = map.getDiv();
    if (!mapDiv) return;

    let resizeTimer: any = null;

    const triggerResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.google?.maps?.event) {
          google.maps.event.trigger(map, 'resize');
        }
        const savedCenter = lastCameraRef.current?.center || center;
        if (savedCenter) {
          map.setCenter(savedCenter);
        }
        const currentZoom = map.getZoom();
        if (typeof currentZoom !== 'number' || currentZoom < 4) {
          map.setZoom(lastCameraRef.current?.zoom || 12);
        }
      }, 50);
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          triggerResize();
        }
      }
    });

    observer.observe(mapDiv);
    if (mapDiv.parentElement) {
      observer.observe(mapDiv.parentElement);
    }

    const initialTimer = setTimeout(triggerResize, 100);
    window.addEventListener('resize', triggerResize);

    return () => {
      clearTimeout(resizeTimer);
      clearTimeout(initialTimer);
      observer.disconnect();
      window.removeEventListener('resize', triggerResize);
    };
  }, [map, center]);

  useEffect(() => {
    if (!map) return;

    const listener = map.addListener('idle', () => {
      const c = map.getCenter();
      const z = map.getZoom();
      if (c && typeof z === 'number') {
        lastCameraRef.current = {
          center: { lat: c.lat(), lng: c.lng() },
          zoom: z,
        };
      }

      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const bounds = map.getBounds();
        if (bounds) {
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          onBoundsChange({
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
          });
        }
      }, 300);
    });

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (isCreating && e.latLng) {
        onSelectCreateLocation({
          lat: e.latLng.lat(),
          lng: e.latLng.lng(),
        });
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
      google.maps.event.removeListener(clickListener);
    };
  }, [map, onBoundsChange, isCreating, onSelectCreateLocation]);

  return null;
};

export const HeyroqMap: React.FC<HeyroqMapProps> = ({
  pins,
  selectedPin,
  onSelectPin,
  onOpenDetails,
  onBoundsChange,
  isCreating,
  createLocation,
  onSelectCreateLocation,
  onCancelCreateLocation,
  center = { lat: 37.7749, lng: -122.4194 },
  isDesktop = false,
  onToggleDrawer,
  isDrawerOpen = false,
  displayedPinsCount,
  onDropPin,
  showPinMarkers = true,
  onTogglePinMarkers,
}) => {
  const { resolvedTheme } = useTheme();
  const effectivePins = showPinMarkers ? pins : [];
  const apiKey = ((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const layersRef = useRef<HTMLDivElement>(null);

  // Close layers popover on outside click or Escape key
  useEffect(() => {
    if (!isLayersOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (layersRef.current && !layersRef.current.contains(e.target as Node)) {
        setIsLayersOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLayersOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLayersOpen]);

  const handleSelectMapStyle = (newStyle: 'standard' | 'satellite') => {
    setMapStyle(newStyle);
    if (mapInstance) {
      mapInstance.setMapTypeId(newStyle === 'satellite' ? 'hybrid' : 'roadmap');
    }
  };

  const handleLocateMe = useCallback(() => {
    if (isLocating) return;

    if (!('geolocation' in navigator)) {
      setLocationNotice('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const userPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        if (mapInstance) {
          mapInstance.panTo(userPos);
          const currentZoom = mapInstance.getZoom();
          if (typeof currentZoom !== 'number' || currentZoom < 14) {
            mapInstance.setZoom(14);
          }
        } else {
          setFallbackZoom(1.8);
          setFallbackPan({ x: 0, y: 0 });
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1 /* PERMISSION_DENIED */) {
          setLocationNotice(
            'Location permission was denied. Please allow location access in your browser.'
          );
        } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
          setLocationNotice('Current location is unavailable.');
        } else if (err.code === 3 /* TIMEOUT */) {
          setLocationNotice('Location request timed out. Please try again.');
        } else {
          setLocationNotice('Unable to determine your current location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [isLocating, mapInstance]);

  useEffect(() => {
    if (!locationNotice) return;
    const timer = setTimeout(() => setLocationNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [locationNotice]);

  const handleMarkerClick = (pin: Pin) => {
    if (isCreating) {
      onSelectCreateLocation({
        lat: pin.latitude,
        lng: pin.longitude,
      });
      return;
    }
    if (!isDesktop && onOpenDetails) {
      onOpenDetails(pin);
    } else {
      onSelectPin(pin);
    }
  };

  // Fallback interactive map state when no API key is set yet
  const [fallbackZoom, setFallbackZoom] = useState(1);
  const [fallbackPan, setFallbackPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleFallbackMouseDown = (e: React.MouseEvent) => {
    if (isCreating) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - fallbackPan.x, y: e.clientY - fallbackPan.y };
  };

  const handleFallbackMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setFallbackPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleFallbackMouseUp = () => {
    setIsDragging(false);
  };

  const handleFallbackWheel = (e: React.WheelEvent) => {
    const zoomDelta = e.deltaY > 0 ? -0.15 : 0.15;
    setFallbackZoom((z) => Math.min(Math.max(Number((z + zoomDelta).toFixed(2)), 0.7), 3));
  };

  const handleFallbackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCreating) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - fallbackPan.x;
    const y = e.clientY - rect.top - fallbackPan.y;
    const lat = 90 - (y / (rect.height * fallbackZoom)) * 180;
    const lng = (x / (rect.width * fallbackZoom)) * 360 - 180;
    onSelectCreateLocation({
      lat: Math.max(-85, Math.min(85, lat)),
      lng: Math.max(-180, Math.min(180, lng)),
    });
  };

  const latLngToPercent = (lat: number, lng: number) => {
    const x = ((lng + 180) / 360) * 100;
    const y = ((90 - lat) / 180) * 100;
    return { x, y };
  };

  // Deliberate Heyroq Lower-Right Liquid Glass Control Hierarchy:
  // UTILITY CONTROLS: [ My Location ] [ Map Layers ]
  // ACTIONS:          [ Hide / Show ] [ Spots (if drawer closed) ] [ Mobile Add Pin (+) ]
  const renderHeyroqControls = () => (
    <div
      id="heyroq-bottom-right-controls"
      className={`absolute right-3.5 sm:right-5 z-20 flex flex-col items-end gap-2 pointer-events-auto select-none transition-all duration-200 ${
        isDrawerOpen
          ? 'bottom-6 sm:bottom-7'
          : 'bottom-[calc(1.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-8'
      }`}
    >
      {/* Location Feedback Notice */}
      {locationNotice && (
        <div
          role="status"
          aria-live="polite"
          className="liquid-glass-floating max-w-[250px] sm:max-w-xs text-[var(--heyroq-text-primary)] text-xs font-medium px-3.5 py-2 rounded-xl flex items-center gap-2 mb-0.5 animate-in fade-in slide-in-from-bottom-2"
        >
          <Info className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
          <span className="leading-snug text-[var(--heyroq-text-secondary)] text-[11px] sm:text-xs">
            {locationNotice}
          </span>
          <button
            type="button"
            onClick={() => setLocationNotice(null)}
            className="ml-auto text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] p-0.5 cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Utility Controls Row: [ My Location ] [ Map Layers ] */}
      <div className="flex items-center gap-2">
        <button
          id="heyroq-my-location-btn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleLocateMe();
          }}
          disabled={isLocating}
          aria-label="My location"
          title="My location"
          className="liquid-glass-floating w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl text-[var(--heyroq-text-primary)] hover:border-[var(--heyroq-border-strong)] active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 heyroq-focus-ring"
        >
          <Crosshair
            className={`w-[18px] h-[18px] text-[var(--brand-primary)] ${isLocating ? 'animate-spin' : ''}`}
          />
        </button>

        {/* Map Layers Control */}
        <div ref={layersRef} className="relative">
          <button
            id="heyroq-map-layers-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsLayersOpen((prev) => !prev);
            }}
            aria-label="Map layers"
            aria-haspopup="true"
            aria-expanded={isLayersOpen}
            title="Map layers"
            className={`liquid-glass-floating w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl transition-all flex items-center justify-center cursor-pointer active:scale-95 heyroq-focus-ring ${
              isLayersOpen
                ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/30'
                : 'hover:border-[var(--heyroq-border-strong)]'
            }`}
          >
            <Layers className="w-[18px] h-[18px] text-[var(--brand-primary)]" />
          </button>

          {/* Map Style Popover */}
          {isLayersOpen && (
            <div
              id="heyroq-layers-popover"
              role="dialog"
              aria-label="Map Style Selection"
              className="liquid-glass-popover absolute right-0 bottom-full mb-2 w-56 sm:w-60 rounded-2xl p-3 z-30 animate-in fade-in zoom-in-95 duration-150 text-[var(--heyroq-text-primary)]"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--heyroq-border-subtle)]">
                <span className="text-xs font-semibold text-[var(--heyroq-text-muted)]">
                  Map Style
                </span>
                <CloseButton
                  size="sm"
                  onClick={() => setIsLayersOpen(false)}
                  ariaLabel="Close Map Layers"
                />
              </div>

              <div className="space-y-1.5" role="radiogroup" aria-label="Map style selection">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapStyle === 'standard'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectMapStyle('standard');
                    setIsLayersOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left heyroq-focus-ring ${
                    mapStyle === 'standard'
                      ? 'bg-[var(--brand-primary)]/12 border-[var(--brand-primary)]/60 text-[var(--heyroq-text-primary)]'
                      : 'bg-[#F3F1ED] dark:bg-[#2B2C31] border-transparent text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-[#ECE9E3] dark:hover:bg-[#33343A]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin
                      strokeWidth={1.75}
                      className={`w-4 h-4 ${
                        mapStyle === 'standard'
                          ? 'text-[var(--brand-primary)]'
                          : 'text-[var(--heyroq-text-muted)]'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold leading-tight">Standard</div>
                      <div className="text-[11px] text-[var(--heyroq-text-muted)]">
                        Street & Vector ({resolvedTheme === 'dark' ? 'Dark' : 'Light'})
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      mapStyle === 'standard'
                        ? 'border-[var(--brand-primary)]'
                        : 'border-[var(--heyroq-border-strong)]'
                    }`}
                  >
                    {mapStyle === 'standard' && (
                      <div className="w-2 h-2 rounded-full bg-[var(--brand-primary)]" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={mapStyle === 'satellite'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectMapStyle('satellite');
                    setIsLayersOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left heyroq-focus-ring ${
                    mapStyle === 'satellite'
                      ? 'bg-[var(--brand-primary)]/12 border-[var(--brand-primary)]/60 text-[var(--heyroq-text-primary)]'
                      : 'bg-[#F3F1ED] dark:bg-[#2B2C31] border-transparent text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-[#ECE9E3] dark:hover:bg-[#33343A]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Globe
                      className={`w-4 h-4 ${
                        mapStyle === 'satellite'
                          ? 'text-[var(--brand-primary)]'
                          : 'text-[var(--heyroq-text-muted)]'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold leading-tight">Satellite</div>
                      <div className="text-[11px] text-[var(--heyroq-text-muted)]">
                        Hybrid Imagery
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      mapStyle === 'satellite'
                        ? 'border-[var(--brand-primary)]'
                        : 'border-[var(--heyroq-border-strong)]'
                    }`}
                  >
                    {mapStyle === 'satellite' && (
                      <div className="w-2 h-2 rounded-full bg-[var(--brand-primary)]" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions Row: [ Hide / Show ] [ Spots (if drawer closed) ] [ Mobile Add Pin (+) ] */}
      <div className="flex items-center gap-2">
        {onTogglePinMarkers && (
          <button
            id="toggle-pin-markers-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinMarkers();
            }}
            aria-label={showPinMarkers ? 'Hide Heyroq pins from map' : 'Show Heyroq pins on map'}
            title={showPinMarkers ? 'Hide Heyroq pins from map' : 'Show Heyroq pins on map'}
            className="liquid-glass-floating h-11 min-h-[44px] px-3.5 hover:border-[var(--heyroq-border-strong)] text-[var(--heyroq-text-primary)] rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer active:scale-95 heyroq-focus-ring whitespace-nowrap"
          >
            {showPinMarkers ? (
              <EyeOff className="w-4 h-4 text-[var(--brand-primary)]" />
            ) : (
              <Eye className="w-4 h-4 text-[var(--brand-primary)]" />
            )}
            <span>{showPinMarkers ? 'Hide' : 'Show'}</span>
          </button>
        )}

        {!isDrawerOpen && onToggleDrawer && (
          <button
            id="toggle-feed-drawer-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDrawer();
            }}
            aria-label={`Open spots feed (${displayedPinsCount ?? pins.length})`}
            title={`Open spots feed (${displayedPinsCount ?? pins.length})`}
            className="liquid-glass-floating h-11 min-h-[44px] px-3.5 hover:border-[var(--heyroq-border-strong)] text-[var(--heyroq-text-primary)] rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer active:scale-95 heyroq-focus-ring tabular-nums whitespace-nowrap"
          >
            <ListFilter className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>{`Spots (${displayedPinsCount ?? pins.length})`}</span>
          </button>
        )}

        {onDropPin && !isCreating && (
          <button
            id="floating-drop-pin-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDropPin();
            }}
            className="heyroq-btn-primary flex md:hidden w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl items-center justify-center active:scale-95 transition-transform cursor-pointer shrink-0 heyroq-focus-ring"
            title="Drop Pin"
            aria-label="Drop a Pin"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        )}
      </div>
    </div>
  );

  const renderCreateModeBanner = () => {
    if (!isCreating) return null;
    return (
      <div
        id="map-pick-instruction-banner"
        className="liquid-glass-floating absolute bottom-20 left-4 right-4 sm:right-auto sm:left-6 z-30 text-[var(--heyroq-text-primary)] px-4 py-2.5 rounded-xl ring-2 ring-[var(--brand-primary)]/40 flex items-center justify-between sm:justify-start gap-3 animate-in fade-in"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
          <span className="font-semibold text-xs truncate">
            Click map to select location
          </span>
        </div>
        {onCancelCreateLocation && (
          <button
            id="cancel-map-pick-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancelCreateLocation();
            }}
            className="px-3 py-1 bg-slate-900/[0.06] dark:bg-white/10 hover:bg-slate-900/[0.12] dark:hover:bg-white/20 text-[var(--heyroq-text-primary)] rounded-lg text-xs font-semibold transition cursor-pointer border border-[var(--heyroq-border-subtle)] shrink-0"
          >
            Cancel
          </button>
        )}
      </div>
    );
  };

  if (apiKey) {
    return (
      <div id="heyroq-google-map-container" className="absolute inset-0 w-full h-full">
        {/*
          Google Maps ColorScheme synchronization:
          `DEMO_MAP_ID` supports runtime Light/Dark switching via `colorScheme` (`ColorScheme.LIGHT` / `ColorScheme.DARK`).
          Note: If replaced in production with a custom cloud-styled Map ID in Google Cloud Console,
          cloud styles override `colorScheme` unless Light and Dark map styles are associated with that Map ID.
        */}
        <Map
          id="heyroq-main-map"
          style={{ width: '100%', height: '100%' }}
          className="w-full h-full"
          defaultCenter={center}
          defaultZoom={12}
          minZoom={3}
          maxZoom={18}
          reuseMaps={true}
          colorScheme={resolvedTheme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT}
          backgroundColor={resolvedTheme === 'dark' ? '#17181B' : '#F3F1ED'}
          mapId="DEMO_MAP_ID"
          mapTypeId={mapStyle === 'satellite' ? 'hybrid' : 'roadmap'}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          disableDefaultUI={true}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          zoomControl={false}
          rotateControl={false}
          scaleControl={false}
          panControl={false}
          keyboardShortcuts={false}
          gestureHandling="greedy"
          restriction={{
            latLngBounds: {
              north: 84,
              south: -84,
              west: -180,
              east: 180,
            },
            strictBounds: true,
          }}
        >
          <MapController
            center={center}
            onBoundsChange={onBoundsChange}
            isCreating={isCreating}
            onSelectCreateLocation={onSelectCreateLocation}
            onMapInstance={setMapInstance}
            mapStyle={mapStyle}
          />

          <ClusteredMarkers
            pins={effectivePins}
            selectedPinId={selectedPin?.id}
            onPinClick={handleMarkerClick}
          />

          {isCreating && createLocation && (
            <AdvancedMarker
              position={{ lat: createLocation.lat, lng: createLocation.lng }}
              title="New Pin Location"
            >
              <div className="flex flex-col items-center transition-transform duration-200 ease-out">
                <div className="bg-[var(--brand-cta-bg)] text-white p-2 rounded-full shadow-lg border-2 border-[#FAF9F6]">
                  <MapPin className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <span className="liquid-glass-floating text-[var(--heyroq-text-primary)] text-[11px] font-semibold px-2.5 py-0.5 rounded-full mt-1">
                  Drop Pin Here
                </span>
              </div>
            </AdvancedMarker>
          )}
        </Map>

        {renderHeyroqControls()}
        {renderCreateModeBanner()}
      </div>
    );
  }

  // Graceful interactive fallback view if Google Maps key is pending configuration
  return (
    <div
      id="heyroq-fallback-map"
      className="absolute inset-0 w-full h-full bg-[var(--heyroq-bg-canvas)] overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleFallbackMouseDown}
      onMouseMove={handleFallbackMouseMove}
      onMouseUp={handleFallbackMouseUp}
      onWheel={handleFallbackWheel}
      onClick={handleFallbackClick}
    >
      <div className="liquid-glass-floating absolute top-4 left-4 right-4 z-20 mx-auto max-w-2xl text-[var(--heyroq-text-primary)] px-5 py-3.5 rounded-2xl flex items-start gap-3">
        <Info className="w-5 h-5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
        <div className="text-xs flex-1">
          <p className="font-heading font-bold tracking-tight text-[var(--heyroq-text-primary)]">
            Heyroq Vector Discovery Engine
          </p>
          <p className="text-[var(--heyroq-text-secondary)] mt-0.5 leading-relaxed">
            Discovery pins, social likes, comments, and profile features are 100% active. To render
            high-resolution Google Maps vector tiles, set{' '}
            <code className="bg-[#F3F1ED] dark:bg-[#2B2C31] text-[var(--heyroq-accent-text)] px-1.5 py-0.5 rounded font-mono">
              VITE_GOOGLE_MAPS_API_KEY
            </code>
            .
          </p>
          <a
            href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--heyroq-accent-text)] hover:underline mt-1.5 font-bold uppercase text-[10px] tracking-wider"
          >
            Get Free Maps Demo Key <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div
        className="w-full h-full relative transition-transform duration-75 origin-center"
        style={{
          transform: `translate(${fallbackPan.x}px, ${fallbackPan.y}px) scale(${fallbackZoom})`,
        }}
      >
        <div className="absolute inset-0 bg-grid-dots opacity-60" />

        <svg
          className="absolute inset-0 w-full h-full opacity-25 pointer-events-none text-slate-400 dark:text-white/20"
          viewBox="0 0 1000 500"
          fill="currentColor"
        >
          <path d="M150,120 Q190,90 280,100 T320,180 T260,250 T180,220 Z" />
          <path d="M250,260 Q280,280 300,360 T270,440 T220,380 T230,300 Z" />
          <path d="M460,90 Q540,80 580,120 T520,190 T470,140 Z" />
          <path d="M470,200 Q550,220 580,300 T530,420 T460,350 T450,250 Z" />
          <path d="M600,100 Q750,70 850,120 T900,220 T780,260 T660,180 Z" />
          <path d="M780,320 Q860,310 880,380 T800,430 T740,370 Z" />
        </svg>

        {effectivePins.map((pin) => {
          const { x, y } = latLngToPercent(pin.latitude, pin.longitude);
          const isSelected = selectedPin?.id === pin.id;
          const config = CATEGORY_CONFIG[pin.category] || CATEGORY_CONFIG.Other;

          return (
            <div
              key={pin.id}
              id={`pin-marker-${pin.id}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={(e) => {
                e.stopPropagation();
                handleMarkerClick(pin);
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform duration-150 hover:scale-110"
            >
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-tight border transition-all ${
                  isSelected
                    ? 'bg-[#202124] dark:bg-[#F5F4F1] text-[#FAF9F6] dark:text-[#17181B] border-transparent ring-2 ring-[var(--brand-primary)] shadow-lg scale-105'
                    : 'liquid-glass-floating text-[var(--heyroq-text-primary)]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${config.bg}`} />
                <span className="truncate max-w-[140px]">{pin.title}</span>
                <LikeIndicator count={pin.likeCount || 0} variant="compact" />
              </div>
            </div>
          );
        })}

        {isCreating && createLocation && (
          <div
            style={{
              left: `${latLngToPercent(createLocation.lat, createLocation.lng).x}%`,
              top: `${latLngToPercent(createLocation.lat, createLocation.lng).y}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-full z-30 pointer-events-none transition-transform duration-200 ease-out"
          >
            <div className="bg-[var(--brand-cta-bg)] text-white p-2.5 rounded-full shadow-lg border-2 border-[#FAF9F6]">
              <MapPin className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div className="liquid-glass-floating text-[var(--heyroq-text-primary)] text-[11px] font-semibold px-2.5 py-0.5 rounded-full mt-1 text-center whitespace-nowrap">
              Drop Location
            </div>
          </div>
        )}
      </div>

      {renderHeyroqControls()}

      <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFallbackZoom((z) => Math.min(z + 0.3, 3));
          }}
          className="liquid-glass-floating min-w-[44px] min-h-[44px] p-2.5 text-[var(--heyroq-text-primary)] rounded-xl flex items-center justify-center cursor-pointer heyroq-focus-ring"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFallbackZoom((z) => Math.max(z - 0.3, 0.7));
          }}
          className="liquid-glass-floating min-w-[44px] min-h-[44px] p-2.5 text-[var(--heyroq-text-primary)] rounded-xl flex items-center justify-center cursor-pointer heyroq-focus-ring"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {renderCreateModeBanner()}
    </div>
  );
};
