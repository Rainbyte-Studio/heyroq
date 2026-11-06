import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  APIProvider,
  Map,
  useMap,
  AdvancedMarker,
} from '@vis.gl/react-google-maps';
import { Pin } from '../../types';
import {
  GeographicCluster,
  CountryFootprintGroup,
  MapDisplayCluster,
  calculateDynamicViewport,
  getCountryDisplayClusters,
  getCityDisplayClusters,
  extractCityAndCountry,
  normalizeCityName,
  normalizeCountryName,
} from '../../utils/footprintUtils';
import { CATEGORY_CONFIG } from '../Map/CategoryBadge';
import { PinPreviewCard } from '../Pin/PinPreviewCard';
import { LikeIndicator } from '../Pin/LikeButton';
import {
  checkIfLiked,
  toggleLike,
  subscribeToPinLike,
  subscribeToPinDocument,
} from '../../services/pinService';
import { GeographicClusterBadge } from './GeographicClusterBadge';
import { GeographicClusterDetailCard } from './GeographicClusterDetailCard';
import {
  ZoomIn,
  ZoomOut,
  Crosshair,
  Layers,
  X,
} from 'lucide-react';

interface FootprintMapProps {
  clusters: GeographicCluster[];
  countries?: CountryFootprintGroup[];
  allPins?: Pin[];
  totalPins: number;
  isMe?: boolean;
  activeCountry?: string | null;
  activeCity?: string | null;
  currentUserId?: string;
  targetView?: {
    center: { lat: number; lng: number };
    zoom: number;
    bounds?: { north: number; south: number; east: number; west: number };
  } | null;
  onSelectCountry?: (countryName: string) => void;
  onSelectCity?: (cityName: string, countryName: string) => void;
  onClearFilter?: () => void;
  onSelectPin?: (pinId: string) => void;
  onOpenPinDetails?: (pin: Pin) => void;
}

// Map Controller implementing Dynamic Intelligent Zoom, Zoom Tracking, and Target View Navigation
const FootprintMapController: React.FC<{
  clusters: GeographicCluster[];
  resetKey: number;
  targetView?: {
    center: { lat: number; lng: number };
    zoom: number;
    bounds?: { north: number; south: number; east: number; west: number };
  } | null;
  onZoomChange?: (zoom: number) => void;
}> = ({ clusters, resetKey, targetView, onZoomChange }) => {
  const map = useMap();

  // Track map zoom changes continuously
  useEffect(() => {
    if (!map) return;
    const updateZoom = () => {
      const z = map.getZoom();
      if (typeof z === 'number' && onZoomChange) {
        onZoomChange(z);
      }
    };
    const zoomListener = map.addListener('zoom_changed', updateZoom);
    updateZoom();

    return () => {
      google.maps.event.removeListener(zoomListener);
    };
  }, [map, onZoomChange]);

  // Handle programmatic target view (when user clicks country or city)
  useEffect(() => {
    if (!map || !targetView) return;

    if (targetView.bounds) {
      try {
        const googleBounds = new google.maps.LatLngBounds(
          { lat: targetView.bounds.south, lng: targetView.bounds.west },
          { lat: targetView.bounds.north, lng: targetView.bounds.east }
        );

        map.fitBounds(googleBounds, {
          top: 40,
          bottom: 40,
          left: 40,
          right: 40,
        });

        const idleListener = google.maps.event.addListenerOnce(map, 'idle', () => {
          const z = map.getZoom();
          if (typeof z === 'number') {
            if (z > 14) map.setZoom(13);
            if (z < 3) map.setZoom(3);
          }
        });

        return () => {
          google.maps.event.removeListener(idleListener);
        };
      } catch (err) {
        map.panTo(targetView.center);
        map.setZoom(targetView.zoom);
      }
    } else {
      map.panTo(targetView.center);
      map.setZoom(targetView.zoom);
    }
  }, [map, targetView]);

  useEffect(() => {
    if (!map || clusters.length === 0 || targetView) return;

    const viewport = calculateDynamicViewport(clusters);

    if (viewport.shouldFitBounds && viewport.bounds) {
      try {
        const googleBounds = new google.maps.LatLngBounds(
          { lat: viewport.bounds.south, lng: viewport.bounds.west },
          { lat: viewport.bounds.north, lng: viewport.bounds.east }
        );

        // Apply sensible padding
        map.fitBounds(googleBounds, {
          top: 36,
          bottom: 36,
          left: 36,
          right: 36,
        });

        // Clamp the zoom immediately after fitBounds completes to guarantee sensible bounds
        const idleListener = google.maps.event.addListenerOnce(map, 'idle', () => {
          const currentZoom = map.getZoom();
          if (typeof currentZoom === 'number') {
            if (currentZoom > viewport.maxAllowedZoom) {
              map.setZoom(viewport.maxAllowedZoom);
            } else if (currentZoom < viewport.minAllowedZoom) {
              map.setZoom(viewport.minAllowedZoom);
            }
          }
        });

        return () => {
          google.maps.event.removeListener(idleListener);
        };
      } catch (err) {
        // Fallback to direct center/zoom
        map.setCenter(viewport.center);
        map.setZoom(viewport.zoom);
      }
    } else {
      // Single location or point: Directly apply targeted center & zoom
      map.setCenter(viewport.center);
      map.setZoom(viewport.zoom);
    }
  }, [map, clusters, resetKey, targetView]);

  return null;
};

// Minimal Dark Map Style for Heyroq
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#121212' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121212' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#2b2b2b' }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cccccc' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.fill',
    stylers: [{ color: '#1c1c1c' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8a8a8a' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#262626' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0a0a0a' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3d3d3d' }],
  },
];

export const FootprintMap: React.FC<FootprintMapProps> = ({
  clusters,
  countries = [],
  allPins = [],
  totalPins,
  activeCountry,
  activeCity,
  currentUserId,
  targetView,
  onSelectCountry,
  onSelectCity,
  onClearFilter,
  onSelectPin,
  onOpenPinDetails,
}) => {
  const apiKey = ((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const [selectedCluster, setSelectedCluster] = useState<GeographicCluster | null>(null);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [isPinLiked, setIsPinLiked] = useState<boolean>(false);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [resetKey, setResetKey] = useState(0);

  // Dynamic zoom state for adaptive hierarchical clustering
  const [currentZoom, setCurrentZoom] = useState<number>(4);

  // Fallback vector canvas state
  const [fallbackZoom, setFallbackZoom] = useState(1);
  const [fallbackPan, setFallbackPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Compute base viewport from all clusters
  const viewport = useMemo(() => calculateDynamicViewport(clusters), [clusters]);

  // Filter clusters by activeCountry if specified
  const effectiveClusters = useMemo(() => {
    if (!activeCountry) return clusters;
    const cleanActive = activeCountry.trim().toLowerCase();
    const filtered = clusters.filter(
      (c) => c.countryName.trim().toLowerCase() === cleanActive
    );
    return filtered.length > 0 ? filtered : clusters;
  }, [clusters, activeCountry]);

  // Hierarchical Zoom Thresholds:
  // Level A (Country View): < 6.5 (unless a country/city is explicitly selected)
  // Level B (City View): 6.5 to < 11.0
  // Level C (Spot View): >= 11.0 or when an active city is focused
  const COUNTRY_ZOOM_THRESHOLD = 6.5;
  const SPOT_ZOOM_THRESHOLD = 11.0;

  const isSpotZoom = currentZoom >= SPOT_ZOOM_THRESHOLD || Boolean(activeCity);
  const isWideZoom = currentZoom < COUNTRY_ZOOM_THRESHOLD && !activeCountry && !activeCity;

  // Generate display clusters according to zoom level
  const displayClusters: MapDisplayCluster[] = useMemo(() => {
    if (isWideZoom && countries.length > 0) {
      return getCountryDisplayClusters(countries, clusters);
    }
    return getCityDisplayClusters(effectiveClusters);
  }, [isWideZoom, countries, clusters, effectiveClusters]);

  // Filter genuine public pins for Level C spot display
  const filteredPins = useMemo(() => {
    if (!allPins || allPins.length === 0) return [];
    return allPins.filter((pin) => {
      if (activeCity) {
        const { city } = extractCityAndCountry(pin);
        if (normalizeCityName(city).toLowerCase() !== activeCity.toLowerCase()) {
          return false;
        }
      }
      if (activeCountry) {
        const { country } = extractCityAndCountry(pin);
        if (normalizeCountryName(country).toLowerCase() !== activeCountry.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  }, [allPins, activeCountry, activeCity]);

  // Pin like subscription & toggle handlers
  useEffect(() => {
    if (!selectedPin || !currentUserId) {
      setIsPinLiked(false);
      return;
    }
    let isCancelled = false;
    checkIfLiked(selectedPin.id, currentUserId)
      .then((liked) => {
        if (!isCancelled) setIsPinLiked(liked);
      })
      .catch((err) => console.warn('checkIfLiked error:', err));

    const unsubscribe = subscribeToPinLike(selectedPin.id, currentUserId, (liked) => {
      if (!isCancelled) setIsPinLiked(liked);
    });

    const unsubscribeDoc = subscribeToPinDocument(selectedPin.id, ({ likeCount }) => {
      if (!isCancelled && typeof likeCount === 'number') {
        setSelectedPin((prev) => (prev && prev.id === selectedPin.id ? { ...prev, likeCount } : prev));
      }
    });

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, [selectedPin?.id, currentUserId]);

  const handleToggleLikePin = async (pinId: string) => {
    if (!currentUserId) return;
    try {
      const isNowLiked = await toggleLike(pinId, currentUserId);
      setIsPinLiked(isNowLiked);
      if (selectedPin && selectedPin.id === pinId) {
        setSelectedPin({
          ...selectedPin,
          likeCount: Math.max(0, (selectedPin.likeCount || 0) + (isNowLiked ? 1 : -1)),
        });
      }
    } catch (err) {
      console.error('Failed to toggle like in footprint map:', err);
    }
  };

  // Adjust fallback canvas when viewport or targetView changes
  useEffect(() => {
    if (targetView) {
      setFallbackZoom(targetView.zoom >= 11 ? 4.2 : targetView.zoom >= 7 ? 2.6 : 1.6);
      const x = ((targetView.center.lng + 180) / 360) * 100;
      const y = ((90 - targetView.center.lat) / 180) * 100;
      setFallbackPan({ x: -(x - 50) * 5, y: -(y - 50) * 3.5 });
      setCurrentZoom(targetView.zoom);
    } else if (viewport.zoom >= 10) {
      setFallbackZoom(3.5);
      const x = ((viewport.center.lng + 180) / 360) * 100;
      const y = ((90 - viewport.center.lat) / 180) * 100;
      setFallbackPan({ x: -(x - 50) * 6, y: -(y - 50) * 4 });
      setCurrentZoom(viewport.zoom);
    } else if (viewport.zoom >= 6) {
      setFallbackZoom(2.2);
      const x = ((viewport.center.lng + 180) / 360) * 100;
      const y = ((90 - viewport.center.lat) / 180) * 100;
      setFallbackPan({ x: -(x - 50) * 3, y: -(y - 50) * 2.5 });
      setCurrentZoom(viewport.zoom);
    } else {
      setFallbackZoom(1);
      setFallbackPan({ x: 0, y: 0 });
      setCurrentZoom(viewport.zoom || 4);
    }
  }, [viewport, targetView]);

  // Convert lat/lng to percentage on fallback vector canvas
  const latLngToPercent = (lat: number, lng: number) => {
    const x = ((lng + 180) / 360) * 100;
    const y = ((90 - lat) / 180) * 100;
    return { x, y };
  };

  const handleFallbackMouseDown = (e: React.MouseEvent) => {
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

  const handleDisplayClusterClick = (displayCluster: MapDisplayCluster) => {
    setSelectedPin(null);
    if (displayCluster.type === 'country') {
      // Level A (Country View) -> Zoom into Country
      if (onSelectCountry) {
        onSelectCountry(displayCluster.countryName);
      }
    } else {
      // Level B (City View) -> Zoom into City Spot View
      if (onSelectCity) {
        onSelectCity(displayCluster.cityName || displayCluster.shortName, displayCluster.countryName);
      } else {
        const matched = clusters.find((c) => c.id === displayCluster.id);
        if (matched) {
          setSelectedCluster(matched);
        } else {
          setSelectedCluster({
            id: displayCluster.id,
            cityName: displayCluster.cityName || displayCluster.shortName,
            countryName: displayCluster.countryName,
            displayName: displayCluster.label,
            centroid: displayCluster.centroid,
            count: displayCluster.count,
            categoryBreakdown: {},
            pins: displayCluster.pins,
          });
        }
      }
    }
  };

  const handleSpotClick = (pin: Pin) => {
    setSelectedCluster(null);
    setSelectedPin(pin);
  };

  return (
    <div
      id="footprint-interactive-map-container"
      className="relative w-full h-[320px] sm:h-[380px] rounded-2xl overflow-hidden bg-[#0A0A0A] border border-white/10 shadow-inner group"
      onClick={() => {
        // Deselect if clicking container backdrop
        if (selectedCluster) setSelectedCluster(null);
        if (selectedPin) setSelectedPin(null);
      }}
    >
      {/* Active Filter Pill Overlay */}
      {activeCountry && (
        <div
          id="active-footprint-country-pill"
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-white/20 shadow-xl select-none"
        >
          <span className="text-[10px] uppercase font-black tracking-wider text-white/50">
            Showing:
          </span>
          <span className="text-xs font-black uppercase tracking-tight text-[#FF5F40]">
            {activeCountry}
          </span>
          {activeCity && (
            <>
              <span className="text-white/30">/</span>
              <span className="text-xs font-bold text-white/90">{activeCity}</span>
            </>
          )}
          {onClearFilter && (
            <button
              type="button"
              id="clear-footprint-filter-overlay-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClearFilter();
              }}
              className="ml-1 p-0.5 rounded-full hover:bg-white/20 text-white/70 hover:text-white transition cursor-pointer"
              title="Show all locations"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Dynamic Geographic Level Indicator */}
      <div
        id="footprint-level-indicator"
        className="absolute top-3 right-14 z-20 hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-[10px] font-black uppercase tracking-wider text-white/70 shadow-lg select-none"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#FF5F40] animate-pulse" />
        <span>{isSpotZoom ? 'Spot View' : isWideZoom ? 'Country View' : 'City View'}</span>
      </div>

      {/* 1. Google Maps Vector Mode (When API Key is available) */}
      {apiKey ? (
        <APIProvider apiKey={apiKey} libraries={['marker', 'places']}>
          <Map
            id="footprint-google-map"
            mapId="heyroq_footprint_map_v2"
            defaultCenter={viewport.center}
            defaultZoom={viewport.zoom}
            // PREVENT GRAY MAP TILES:
            // minZoom 2.6 prevents zooming out far enough to expose gray unrendered polar tiles
            minZoom={2.6}
            maxZoom={16}
            // Strict bounds prevent panning past the world bounds
            restriction={{
              latLngBounds: {
                north: 84,
                south: -84,
                west: -180,
                east: 180,
              },
              strictBounds: true,
            }}
            backgroundColor="#0A0A0A"
            styles={mapType === 'roadmap' ? DARK_MAP_STYLES : undefined}
            mapTypeId={mapType}
            disableDefaultUI={true}
            gestureHandling="cooperative"
            className="w-full h-full"
          >
            {/* Intelligent dynamic zoom controller */}
            <FootprintMapController
              clusters={effectiveClusters}
              resetKey={resetKey}
              targetView={targetView}
              onZoomChange={setCurrentZoom}
            />

            {/* Hierarchical Markers: Level C (Spot View) vs Level A/B (Country / City Clusters) */}
            {isSpotZoom ? (
              filteredPins.map((pin) => {
                const isSelected = selectedPin?.id === pin.id;
                const catConfig = CATEGORY_CONFIG[pin.category] || CATEGORY_CONFIG.Other;

                return (
                  <AdvancedMarker
                    key={`footprint_spot_${pin.id}`}
                    position={{ lat: pin.latitude, lng: pin.longitude }}
                    onClick={() => handleSpotClick(pin)}
                    zIndex={isSelected ? 120 : 15}
                  >
                    <div
                      id={`footprint-spot-marker-${pin.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSpotClick(pin);
                      }}
                      className="cursor-pointer transform transition-transform duration-200 hover:scale-110 active:scale-95"
                    >
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-2xl border transition-all ${
                          isSelected
                            ? 'bg-white text-black border-white ring-4 ring-[#FF5F40] shadow-[0_0_20px_#FF5F40] scale-110'
                            : 'bg-black/90 text-white border-white/20 hover:border-white backdrop-blur-md'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${catConfig.bg} shadow-[0_0_6px_currentColor]`} />
                        <span className="truncate max-w-[110px]">{pin.title}</span>
                        <LikeIndicator count={pin.likeCount || 0} variant="compact" />
                      </div>
                    </div>
                  </AdvancedMarker>
                );
              })
            ) : (
              displayClusters.map((cluster) => (
                <AdvancedMarker
                  key={cluster.id}
                  position={cluster.centroid}
                  onClick={() => handleDisplayClusterClick(cluster)}
                  zIndex={selectedCluster?.id === cluster.id ? 100 : 10}
                >
                  <GeographicClusterBadge
                    cluster={cluster}
                    displayMode={cluster.type as 'country' | 'city'}
                    isSelected={selectedCluster?.id === cluster.id}
                    onClick={() => handleDisplayClusterClick(cluster)}
                  />
                </AdvancedMarker>
              ))
            )}
          </Map>

          {/* Map Controls */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
            <button
              id="footprint-map-layer-toggle"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMapType((prev) => (prev === 'roadmap' ? 'satellite' : 'roadmap'));
              }}
              className="p-2 bg-black/80 hover:bg-black backdrop-blur-md rounded-xl border border-white/15 text-white/80 hover:text-white transition shadow-lg cursor-pointer"
              title="Toggle Map Style"
              aria-label="Toggle Map Style"
            >
              <Layers className="w-4 h-4 text-[#FF5F40]" />
            </button>
            <button
              id="footprint-map-recenter-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onClearFilter) onClearFilter();
                setSelectedPin(null);
                setSelectedCluster(null);
                setResetKey((prev) => prev + 1);
              }}
              className="p-2 bg-black/80 hover:bg-black backdrop-blur-md rounded-xl border border-white/15 text-white/80 hover:text-white transition shadow-lg cursor-pointer"
              title="Recenter Footprint"
              aria-label="Recenter Footprint"
            >
              <Crosshair className="w-4 h-4 text-[#FF5F40]" />
            </button>
          </div>
        </APIProvider>
      ) : (
        /* 2. Interactive Fallback Canvas (When API Key is not configured yet) */
        <div
          id="footprint-vector-canvas"
          className="relative w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
          onMouseDown={handleFallbackMouseDown}
          onMouseMove={handleFallbackMouseMove}
          onMouseUp={handleFallbackMouseUp}
        >
          {/* Subtle World Map Silhouette */}
          <div
            className="absolute inset-0 transition-transform duration-75 origin-center pointer-events-none"
            style={{
              transform: `translate(${fallbackPan.x}px, ${fallbackPan.y}px) scale(${fallbackZoom})`,
            }}
          >
            {/* Coordinate Grid Lines */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />

            {/* Stylized Landmass Paths */}
            <svg
              className="absolute inset-0 w-full h-full opacity-15"
              viewBox="0 0 1000 500"
              fill="currentColor"
              preserveAspectRatio="none"
            >
              {/* North America */}
              <path
                d="M120,70 Q180,50 260,70 T320,130 T270,220 T210,190 T140,150 Z"
                className="text-white"
              />
              {/* South America */}
              <path
                d="M240,240 Q290,260 300,340 T270,430 T230,370 T220,290 Z"
                className="text-white"
              />
              {/* Europe */}
              <path
                d="M470,80 Q520,70 560,100 T530,160 T480,130 Z"
                className="text-white"
              />
              {/* Africa */}
              <path
                d="M470,170 Q540,180 570,270 T520,380 T460,320 T440,230 Z"
                className="text-white"
              />
              {/* Asia */}
              <path
                d="M580,80 Q740,50 840,110 T880,210 T780,250 T650,170 Z"
                className="text-white"
              />
              {/* Australia */}
              <path
                d="M780,310 Q850,300 880,360 T820,420 T760,370 Z"
                className="text-white"
              />
            </svg>

            {/* Hierarchical Fallback Markers: Level C (Spots) vs Level A/B (Clusters) */}
            {isSpotZoom ? (
              filteredPins.map((pin) => {
                const pos = latLngToPercent(pin.latitude, pin.longitude);
                const isSelected = selectedPin?.id === pin.id;
                const catConfig = CATEGORY_CONFIG[pin.category] || CATEGORY_CONFIG.Other;

                return (
                  <div
                    key={`fallback_spot_${pin.id}`}
                    id={`fallback-spot-marker-${pin.id}`}
                    className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer hover:scale-110 transition-transform"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpotClick(pin);
                    }}
                  >
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-2xl border transition-all ${
                        isSelected
                          ? 'bg-white text-black border-white ring-4 ring-[#FF5F40] shadow-[0_0_20px_#FF5F40] scale-110'
                          : 'bg-black/90 text-white border-white/20 hover:border-white backdrop-blur-md'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${catConfig.bg} shadow-[0_0_6px_currentColor]`} />
                      <span className="truncate max-w-[110px]">{pin.title}</span>
                      <LikeIndicator count={pin.likeCount || 0} variant="compact" />
                    </div>
                  </div>
                );
              })
            ) : (
              displayClusters.map((cluster) => {
                const pos = latLngToPercent(cluster.centroid.lat, cluster.centroid.lng);
                const isSelected = selectedCluster?.id === cluster.id;

                return (
                  <div
                    key={cluster.id}
                    className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 z-20"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                    }}
                  >
                    <GeographicClusterBadge
                      cluster={cluster}
                      displayMode={cluster.type as 'country' | 'city'}
                      isSelected={isSelected}
                      onClick={() => handleDisplayClusterClick(cluster)}
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Fallback Controls */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
            <div className="flex flex-col bg-black/80 backdrop-blur-md rounded-xl border border-white/15 shadow-xl overflow-hidden">
              <button
                id="fallback-zoom-in-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFallbackZoom((z) => {
                    const next = Math.min(z + 0.5, 6);
                    setCurrentZoom(next * 2.5);
                    return next;
                  });
                }}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="h-px bg-white/10" />
              <button
                id="fallback-zoom-out-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFallbackZoom((z) => {
                    const next = Math.max(z - 0.5, 1);
                    setCurrentZoom(next * 2.5);
                    return next;
                  });
                }}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>

            <button
              id="fallback-recenter-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onClearFilter) onClearFilter();
                setSelectedPin(null);
                setSelectedCluster(null);
                setFallbackPan({ x: 0, y: 0 });
                setFallbackZoom(1);
                setCurrentZoom(4);
              }}
              className="p-2 bg-black/80 hover:bg-black backdrop-blur-md rounded-xl border border-white/15 text-white/80 hover:text-white transition shadow-lg cursor-pointer"
              title="Reset View"
              aria-label="Reset View"
            >
              <Crosshair className="w-4 h-4 text-[#FF5F40]" />
            </button>
          </div>
        </div>
      )}

      {/* Selected Aggregated Area Flyout Card (When clicking a cluster that is not zooming) */}
      {selectedCluster && (
        <GeographicClusterDetailCard
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
          onSelectPin={onSelectPin}
        />
      )}

      {/* Selected Pin Spot Preview Card (Level C Spot View) */}
      {selectedPin && (
        <div
          id="footprint-spot-preview-card"
          className="absolute bottom-3 right-3 z-30 max-w-[calc(100%-24px)] sm:max-w-xs animate-in slide-in-from-bottom-3 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <PinPreviewCard
            pin={selectedPin}
            onClose={() => setSelectedPin(null)}
            onOpenDetails={(pin) => {
              if (onOpenPinDetails) {
                onOpenPinDetails(pin);
              } else if (onSelectPin) {
                onSelectPin(pin.id);
              }
            }}
            onOpenProfile={() => {}}
            isLiked={isPinLiked}
            onToggleLike={handleToggleLikePin}
          />
        </div>
      )}
    </div>
  );
};
