import React, { useEffect, useRef } from 'react';
import { useApiIsLoaded, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { Pin } from '../../types';
import { CATEGORY_CONFIG } from './CategoryBadge';
import { normalizeCategory } from '../../utils/categoryUtils';
import { getLikeMarkerHtml } from '../Pin/LikeButton';
import { useTheme } from '../../context/ThemeContext';

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
  const apiLoaded = useApiIsLoaded();
  const markerLib = useMapsLibrary('marker');
  const { resolvedTheme } = useTheme();
  const clusterer = useRef<MarkerClusterer | null>(null);

  // Initialize clusterer
  useEffect(() => {
    if (!apiLoaded || !map || !markerLib || !window.google?.maps?.OverlayView) return;
    const instance = new MarkerClusterer({ map });
    clusterer.current = instance;
    return () => {
      clusterer.current = null;
      instance.setMap(null);
    };
  }, [apiLoaded, map, markerLib]);

  // Update markers when pins, map, markerLib, or resolvedTheme changes
  useEffect(() => {
    const instance = clusterer.current;
    if (!apiLoaded || !map || !markerLib || !instance) return;

    // Resolve AdvancedMarkerElement constructor safely
    const AdvancedMarkerClass = markerLib.AdvancedMarkerElement;

    // Keep the legacy marker available if the advanced constructor is unavailable.
    if (!AdvancedMarkerClass && !markerLib.Marker) return;

    const newMarkers: MapMarker[] = [];
    const isDark = resolvedTheme === 'dark';

    pins.forEach((pin) => {
      const isSelected = pin.id === selectedPinId;
      const canonicalCat = normalizeCategory(pin.category) || 'Other';
      const catConfig = CATEGORY_CONFIG[canonicalCat] || CATEGORY_CONFIG.Other;

      // Create custom DOM element for AdvancedMarker
      const pinContainer = document.createElement('div');
      pinContainer.className =
        'cursor-pointer transform transition-transform duration-150 hover:scale-105 active:scale-95';

      const pillClass = isSelected
        ? isDark
          ? 'bg-[#F5F4F1] text-[#17181B] border-[#F5F4F1] ring-2 ring-[#E87924] shadow-[0_8px_22px_rgba(232,121,36,0.34)] scale-105'
          : 'bg-[#202124] text-[#FAF9F6] border-[#202124] ring-2 ring-[#E87924] shadow-[0_8px_22px_rgba(32,33,36,0.24)] scale-105'
        : isDark
          ? 'bg-[#222327]/95 text-[#F5F4F1] border-[#38393E] hover:border-[#F5F4F1]/35 shadow-[0_6px_18px_rgba(0,0,0,0.48)]'
          : 'bg-[#FFFFFF]/95 text-[#202124] border-[#E6E3DE] hover:border-[#202124]/30 shadow-[0_4px_14px_rgba(32,33,36,0.12)]';

      const pointerTipClass = isSelected
        ? isDark
          ? 'bg-[#F5F4F1]'
          : 'bg-[#202124]'
        : 'hidden';

      const pinContent = `
        <div class="relative flex flex-col items-center">
          <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-tight border ${pillClass}">
            <span class="w-2 h-2 rounded-full ${catConfig.bg}"></span>
            <span class="truncate max-w-[140px]" data-pin-title></span>
            ${getLikeMarkerHtml(pin.likeCount || 0)}
          </div>
          <div class="w-2 h-2 ${pointerTipClass} transform rotate-45 -mt-1 ${isSelected ? 'block' : 'hidden'}"></div>
        </div>
      `;
      pinContainer.innerHTML = pinContent;
      // Titles come from Firestore and must never be parsed as HTML.
      pinContainer.querySelector('[data-pin-title]')!.textContent = pin.title;

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
        marker = new markerLib.Marker({
          position: { lat: pin.latitude, lng: pin.longitude },
          title: pin.title,
        });
      }

      marker.addListener('click', handleMarkerClick);

      newMarkers.push(marker);
    });

    instance.addMarkers(newMarkers);

    return () => {
      instance.clearMarkers(true);
      newMarkers.forEach((m) => {
        if ('map' in m) {
          (m as any).map = null;
        } else if (typeof (m as any).setMap === 'function') {
          (m as any).setMap(null);
        }
      });
    };
  }, [apiLoaded, map, markerLib, pins, selectedPinId, onPinClick, resolvedTheme]);

  return null;
};
