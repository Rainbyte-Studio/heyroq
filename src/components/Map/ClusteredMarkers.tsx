import React, { useEffect, useRef } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { Pin } from '../../types';
import { CATEGORY_CONFIG } from './CategoryBadge';
import { normalizeCategory } from '../../utils/categoryUtils';
import { getLikeMarkerHtml } from '../Pin/LikeButton';
import { escapeHtml } from '../../utils/html';

interface ClusteredMarkersProps {
  pins: Pin[];
  selectedPinId?: string | null;
  onPinClick: (pin: Pin) => void;
}

type MapMarker = google.maps.marker.AdvancedMarkerElement | google.maps.Marker;

export const ClusteredMarkers: React.FC<ClusteredMarkersProps> = ({
  pins,
  selectedPinId,
  onPinClick,
}) => {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<Map<string, MapMarker>>(new Map());

  // Initialize clusterer
  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({ map });
    }
    return () => {
      if (clusterer.current) {
        clusterer.current.clearMarkers();
        clusterer.current = null;
      }
    };
  }, [map]);

  // Update markers when pins, map, or markerLib changes
  useEffect(() => {
    if (!map || !clusterer.current) return;

    // Resolve AdvancedMarkerElement constructor safely
    const AdvancedMarkerClass =
      markerLib?.AdvancedMarkerElement ||
      (typeof google !== 'undefined' && google.maps?.marker?.AdvancedMarkerElement);

    // If marker library is still loading, wait until it or legacy Marker is available
    if (!AdvancedMarkerClass && !(typeof google !== 'undefined' && google.maps?.Marker)) {
      return;
    }

    // Clear old markers
    clusterer.current.clearMarkers();
    markersRef.current.clear();

    const newMarkers: MapMarker[] = [];

    pins.forEach((pin) => {
      const isSelected = pin.id === selectedPinId;
      const canonicalCat = normalizeCategory(pin.category) || 'Other';
      const catConfig = CATEGORY_CONFIG[canonicalCat] || CATEGORY_CONFIG.Other;

      // Create custom DOM element for AdvancedMarker
      const pinContainer = document.createElement('div');
      pinContainer.className =
        'cursor-pointer transform transition-transform duration-200 hover:scale-110 active:scale-95';

      const pinContent = `
        <div class="relative flex flex-col items-center">
          <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-2xl border ${
            isSelected
              ? 'bg-white text-black border-white ring-4 ring-[#FF5F40] shadow-[0_0_20px_#FF5F40] scale-110'
              : 'bg-black/90 text-white border-white/20 hover:border-white backdrop-blur-md'
          }">
            <span class="w-2 h-2 rounded-full ${catConfig.bg}"></span>
            <span class="truncate max-w-[130px]">${escapeHtml(pin.title)}</span>
            ${getLikeMarkerHtml(pin.likeCount || 0)}
          </div>
          <div class="w-2 h-2 ${isSelected ? 'bg-white' : 'bg-black'} transform rotate-45 -mt-1 ${isSelected ? 'block' : 'hidden'}"></div>
        </div>
      `;
      pinContainer.innerHTML = pinContent;

      let lastClickTime = 0;
      const handleMarkerClick = (e?: Event) => {
        const now = Date.now();
        if (now - lastClickTime < 300) return;
        lastClickTime = now;
        if (e && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        onPinClick(pin);
      };

      pinContainer.addEventListener('click', handleMarkerClick);

      let marker: MapMarker;

      if (AdvancedMarkerClass) {
        marker = new AdvancedMarkerClass({
          position: { lat: pin.latitude, lng: pin.longitude },
          title: pin.title,
          content: pinContainer,
        });
        marker.addListener('gmp-click', handleMarkerClick);
      } else {
        marker = new google.maps.Marker({
          position: { lat: pin.latitude, lng: pin.longitude },
          title: pin.title,
        });
      }

      marker.addListener('click', handleMarkerClick);

      newMarkers.push(marker);
      markersRef.current.set(pin.id, marker);
    });

    clusterer.current.addMarkers(newMarkers);

    return () => {
      if (clusterer.current) {
        clusterer.current.clearMarkers();
      }
      newMarkers.forEach((m) => {
        if ('map' in m) {
          (m as any).map = null;
        } else if (typeof (m as any).setMap === 'function') {
          (m as any).setMap(null);
        }
      });
    };
  }, [map, markerLib, pins, selectedPinId, onPinClick]);

  return null;
};
