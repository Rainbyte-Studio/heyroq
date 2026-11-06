import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Map,
  useMap,
  AdvancedMarker,
} from '@vis.gl/react-google-maps';
import { Pin, LatLngBounds, LatLngPoint } from '../../types';
import { ClusteredMarkers } from './ClusteredMarkers';
import { CATEGORY_CONFIG } from './CategoryBadge';
import { LikeIndicator } from '../Pin/LikeButton';
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

// Controller to programmatically change map view, handle container resizing and bounds
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

  // Keep center synchronized and ensure sensible initial zoom
  useEffect(() => {
    if (!map || !center) return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      map.setCenter(center);
      const currentZoom = map.getZoom();
      if (typeof currentZoom !== 'number' || currentZoom < 4) {
        map.setZoom(12);
      }
    } else {
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
        // Ensure center is maintained after resize
        if (center) {
          map.setCenter(center);
        }
        // If zoom was collapsed due to 0-height init, restore target zoom
        const currentZoom = map.getZoom();
        if (typeof currentZoom !== 'number' || currentZoom < 4) {
          map.setZoom(12);
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

    // Run trigger shortly after mount to ensure initial tile fill once layout finishes
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

  // Map type switcher with instantaneous update and zero reload
  const handleSelectMapStyle = (newStyle: 'standard' | 'satellite') => {
    setMapStyle(newStyle);
    if (mapInstance) {
      mapInstance.setMapTypeId(newStyle === 'satellite' ? 'hybrid' : 'roadmap');
    }
  };

  // Functional Heyroq My Location / Recenter handler
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
          // Fallback interactive map recenter
          setFallbackZoom(1.8);
          setFallbackPan({ x: 0, y: 0 });
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1 /* PERMISSION_DENIED */) {
          setLocationNotice('Location permission was denied. Please allow location access in your browser.');
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

  // Auto-dismiss user location notices
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
    // Map pixel back to approx lat/lng
    const lat = 90 - (y / (rect.height * fallbackZoom)) * 180;
    const lng = (x / (rect.width * fallbackZoom)) * 360 - 180;
    onSelectCreateLocation({
      lat: Math.max(-85, Math.min(85, lat)),
      lng: Math.max(-180, Math.min(180, lng)),
    });
  };

  // Convert lat/lng to percentage on fallback canvas
  const latLngToPercent = (lat: number, lng: number) => {
    const x = ((lng + 180) / 360) * 100;
    const y = ((90 - lat) / 180) * 100;
    return { x, y };
  };

  // Deliberate Heyroq Lower-Right Control Hierarchy:
  // UTILITY CONTROLS: [ My Location ] [ Map Layers ]
  // ACTIONS:          [ HIDE ]        [ Add Pin (+) ]
  const renderHeyroqControls = () => (
    <div
      id="heyroq-bottom-right-controls"
      className={`absolute right-3.5 sm:right-6 z-20 flex flex-col items-end gap-2 pointer-events-auto select-none transition-all duration-200 ${
        isDrawerOpen
          ? 'bottom-6 sm:bottom-7'
          : 'bottom-[calc(1.875rem+env(safe-area-inset-bottom,0px))] sm:bottom-8'
      }`}
    >
      {/* User-friendly Location Feedback Notice (floats above utility row to keep controls coherent) */}
      {locationNotice && (
        <div
          role="status"
          aria-live="polite"
          className="max-w-[240px] sm:max-w-xs bg-black/90 backdrop-blur-xl text-white text-xs font-medium px-3.5 py-2 rounded-xl border border-white/20 shadow-2xl flex items-center gap-2 mb-0.5 animate-in fade-in slide-in-from-bottom-2"
        >
          <Info className="w-4 h-4 text-[#FF5F40] shrink-0" />
          <span className="leading-snug text-white/90 text-[11px] sm:text-xs">{locationNotice}</span>
          <button
            type="button"
            onClick={() => setLocationNotice(null)}
            className="ml-auto text-white/50 hover:text-white p-0.5 cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Utility Controls Row: [ My Location ] [ Map Layers ] */}
      <div className="flex items-center gap-2">
        {/* My Location / Recenter */}
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
          className="w-11 h-11 min-w-[44px] min-h-[44px] bg-black/85 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-2xl border border-white/20 text-white hover:bg-black hover:border-white/40 active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#FF5F40]"
        >
          <Crosshair className={`w-4 h-4 sm:w-5 sm:h-5 text-[#FF5F40] ${isLocating ? 'animate-spin' : ''}`} />
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
            className={`w-11 h-11 min-w-[44px] min-h-[44px] bg-black/85 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-2xl border transition-all flex items-center justify-center cursor-pointer active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#FF5F40] ${
              isLayersOpen
                ? 'border-[#FF5F40] ring-2 ring-[#FF5F40]/40 bg-black'
                : 'border-white/20 hover:border-white/40 hover:bg-black'
            }`}
          >
            <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF5F40]" />
          </button>

          {/* Map Style Popover - Expands upwards into clear map area */}
          {isLayersOpen && (
            <div
              id="heyroq-layers-popover"
              role="dialog"
              aria-label="Map Style Selection"
              className="absolute right-0 bottom-full mb-2 w-56 sm:w-60 bg-black/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl p-3 z-30 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/50">Map Style</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLayersOpen(false);
                  }}
                  className="p-1 text-white/40 hover:text-white rounded-lg transition cursor-pointer"
                  aria-label="Close map layers"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5" role="radiogroup" aria-label="Map style selection">
                {/* Standard Option */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapStyle === 'standard'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectMapStyle('standard');
                    setIsLayersOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-[#FF5F40] ${
                    mapStyle === 'standard'
                      ? 'bg-white/10 border-[#FF5F40]/60 text-white shadow-[0_0_15px_rgba(255,95,64,0.15)]'
                      : 'bg-white/5 border-transparent text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className={`w-4 h-4 ${mapStyle === 'standard' ? 'text-[#FF5F40]' : 'text-white/40'}`} />
                    <div>
                      <div className="text-xs font-bold leading-tight">Standard</div>
                      <div className="text-[10px] text-white/50 font-medium">Street & Vector</div>
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      mapStyle === 'standard' ? 'border-[#FF5F40]' : 'border-white/30'
                    }`}
                  >
                    {mapStyle === 'standard' && <div className="w-2 h-2 rounded-full bg-[#FF5F40]" />}
                  </div>
                </button>

                {/* Satellite Option */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapStyle === 'satellite'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectMapStyle('satellite');
                    setIsLayersOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-[#FF5F40] ${
                    mapStyle === 'satellite'
                      ? 'bg-white/10 border-[#FF5F40]/60 text-white shadow-[0_0_15px_rgba(255,95,64,0.15)]'
                      : 'bg-white/5 border-transparent text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className={`w-4 h-4 ${mapStyle === 'satellite' ? 'text-[#FF5F40]' : 'text-white/40'}`} />
                    <div>
                      <div className="text-xs font-bold leading-tight">Satellite</div>
                      <div className="text-[10px] text-white/50 font-medium">Hybrid Imagery</div>
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      mapStyle === 'satellite' ? 'border-[#FF5F40]' : 'border-white/30'
                    }`}
                  >
                    {mapStyle === 'satellite' && <div className="w-2 h-2 rounded-full bg-[#FF5F40]" />}
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions Row: [ HIDE / SHOW ] [ Spots (if drawer closed) ] [ Add Pin (+) ] */}
      <div className="flex items-center gap-2">
        {/* SECONDARY ACTION: HIDE / SHOW Heyroq Pin Markers */}
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
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-black/85 backdrop-blur-xl hover:bg-black hover:border-white/40 text-white rounded-full text-xs font-black uppercase tracking-wider shadow-2xl border border-white/20 flex items-center gap-2 transition cursor-pointer min-h-[44px] active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            {showPinMarkers ? (
              <EyeOff className="w-4 h-4 text-[#FF5F40]" />
            ) : (
              <Eye className="w-4 h-4 text-[#FF5F40]" />
            )}
            <span>{showPinMarkers ? 'Hide' : 'Show'}</span>
          </button>
        )}

        {/* If Nearby Spots drawer is closed, provide button to reopen it */}
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
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-black/85 backdrop-blur-xl hover:bg-black hover:border-white/40 text-white rounded-full text-xs font-black uppercase tracking-wider shadow-2xl border border-white/20 flex items-center gap-2 transition cursor-pointer min-h-[44px] active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <ListFilter className="w-4 h-4 text-[#FF5F40]" />
            <span>{`Spots (${displayedPinsCount ?? pins.length})`}</span>
          </button>
        )}

        {/* PRIMARY ACTION: Add Pin (+) */}
        {onDropPin && !isCreating && (
          <button
            id="floating-drop-pin-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDropPin();
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-[#FF5F40] rounded-full flex items-center justify-center shadow-[0_0_28px_rgba(255,95,64,0.5)] text-white hover:scale-105 active:scale-95 transition-transform cursor-pointer relative group shrink-0 min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-[#FF5F40]"
            title="Drop a Pin"
            aria-label="Drop a Pin"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
            <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-transform bg-white text-black px-3 py-1 rounded-lg text-[10px] font-black uppercase whitespace-nowrap shadow-xl">
              Drop Pin
            </div>
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
        className="absolute bottom-20 left-4 right-4 sm:right-auto sm:left-6 z-30 bg-black/90 backdrop-blur-xl border border-white/20 text-white px-4 py-2.5 rounded-full shadow-[0_0_30px_rgba(255,95,64,0.4)] flex items-center justify-between sm:justify-start gap-3 animate-in fade-in"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-[#FF5F40] animate-pulse shrink-0" />
          <span className="font-black uppercase tracking-wider text-xs truncate">
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
            className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-full text-[10px] font-black uppercase tracking-wider transition cursor-pointer border border-white/20 shrink-0"
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
        <Map
          id="heyroq-main-map"
          style={{ width: '100%', height: '100%' }}
          className="w-full h-full"
          defaultCenter={center}
          defaultZoom={12}
          minZoom={3}
          maxZoom={18}
          backgroundColor="#0A0A0A"
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

          {/* Pins clustered */}
          <ClusteredMarkers
            pins={effectivePins}
            selectedPinId={selectedPin?.id}
            onPinClick={handleMarkerClick}
          />

          {/* In Create Mode: selected position marker */}
          {isCreating && createLocation && (
            <AdvancedMarker
              position={{ lat: createLocation.lat, lng: createLocation.lng }}
              title="New Pin Location"
            >
              <div className="flex flex-col items-center animate-bounce">
                <div className="bg-rose-600 text-white p-2 rounded-full shadow-2xl border-2 border-white">
                  <MapPin className="w-6 h-6" />
                </div>
                <span className="bg-neutral-900/90 text-white text-[11px] font-medium px-2 py-0.5 rounded-full mt-1">
                  Drop Pin Here
                </span>
              </div>
            </AdvancedMarker>
          )}
        </Map>

        {/* Heyroq Map Controls */}
        {renderHeyroqControls()}

        {/* Location Pick Mode Banner */}
        {renderCreateModeBanner()}
      </div>
    );
  }

  // Graceful interactive fallback view if Google Maps key is pending configuration
  return (
    <div
      id="heyroq-fallback-map"
      className="absolute inset-0 w-full h-full bg-[#0A0A0A] overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleFallbackMouseDown}
      onMouseMove={handleFallbackMouseMove}
      onMouseUp={handleFallbackMouseUp}
      onWheel={handleFallbackWheel}
      onClick={handleFallbackClick}
    >
      {/* Notice Banner */}
      <div className="absolute top-4 left-4 right-4 z-20 mx-auto max-w-2xl bg-black/85 backdrop-blur-xl text-white px-5 py-3 rounded-2xl border border-white/20 shadow-2xl flex items-start gap-3">
        <Info className="w-5 h-5 text-[#FF5F40] shrink-0 mt-0.5" />
        <div className="text-xs flex-1">
          <p className="font-black uppercase tracking-wider text-white">Heyroq Vector Discovery Engine</p>
          <p className="text-white/60 mt-0.5 leading-relaxed">
            Discovery pins, social likes, comments, and profile features are 100% active. To render high-resolution Google Maps vector tiles, set <code className="bg-white/10 text-[#FF5F40] px-1.5 py-0.5 rounded font-mono">VITE_GOOGLE_MAPS_API_KEY</code>.
          </p>
          <a
            href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#FF5F40] hover:underline mt-1 font-black uppercase text-[10px] tracking-wider"
          >
            Get Free Maps Demo Key <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Styled vector discovery canvas */}
      <div
        className="w-full h-full relative transition-transform duration-75 origin-center"
        style={{
          transform: `translate(${fallbackPan.x}px, ${fallbackPan.y}px) scale(${fallbackZoom})`,
        }}
      >
        {/* Subtle dark dot grid background */}
        <div className="absolute inset-0 bg-grid-dots opacity-40" />

        {/* Global Continental Silhouettes */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
          viewBox="0 0 1000 500"
          fill="currentColor"
        >
          {/* Stylized world land masses */}
          <path d="M150,120 Q190,90 280,100 T320,180 T260,250 T180,220 Z" className="text-white/20" />
          <path d="M250,260 Q280,280 300,360 T270,440 T220,380 T230,300 Z" className="text-white/20" />
          <path d="M460,90 Q540,80 580,120 T520,190 T470,140 Z" className="text-white/20" />
          <path d="M470,200 Q550,220 580,300 T530,420 T460,350 T450,250 Z" className="text-white/20" />
          <path d="M600,100 Q750,70 850,120 T900,220 T780,260 T660,180 Z" className="text-white/20" />
          <path d="M780,320 Q860,310 880,380 T800,430 T740,370 Z" className="text-white/20" />
        </svg>

        {/* Render Pins */}
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
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform duration-200 hover:scale-125"
            >
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-2xl border transition-all ${
                  isSelected
                    ? 'bg-white text-black border-white ring-4 ring-[#FF5F40] shadow-[0_0_25px_#FF5F40] scale-110'
                    : 'bg-black/90 text-white border-white/20 hover:border-white backdrop-blur-md'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${config.bg} shadow-[0_0_6px_currentColor]`} />
                <span className="truncate max-w-[130px]">{pin.title}</span>
                <LikeIndicator count={pin.likeCount || 0} variant="compact" />
              </div>
            </div>
          );
        })}

        {/* Creation Target Marker */}
        {isCreating && createLocation && (
          <div
            style={{
              left: `${latLngToPercent(createLocation.lat, createLocation.lng).x}%`,
              top: `${latLngToPercent(createLocation.lat, createLocation.lng).y}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-full z-30 pointer-events-none animate-bounce"
          >
            <div className="bg-[#FF5F40] text-white p-2.5 rounded-full shadow-[0_0_30px_#FF5F40] border-2 border-white">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="bg-white text-black text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 text-center whitespace-nowrap shadow-xl">
              Drop Location
            </div>
          </div>
        )}
      </div>

      {/* Heyroq Map Controls in Fallback Mode */}
      {renderHeyroqControls()}

      {/* Fallback Zoom Controls */}
      <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFallbackZoom((z) => Math.min(z + 0.3, 3));
          }}
          className="p-2.5 bg-black/80 text-white rounded-xl border border-white/20 hover:bg-black shadow-2xl backdrop-blur-md cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFallbackZoom((z) => Math.max(z - 0.3, 0.7));
          }}
          className="p-2.5 bg-black/80 text-white rounded-xl border border-white/20 hover:bg-black shadow-2xl backdrop-blur-md cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Location Pick Mode Banner */}
      {renderCreateModeBanner()}
    </div>
  );
};
