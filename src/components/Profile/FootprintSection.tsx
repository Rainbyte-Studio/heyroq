import React, { useState, useEffect } from 'react';
import { Pin } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { FootprintStats } from './FootprintStats';
import { FootprintMap } from './FootprintMap';
import { FootprintEmptyState } from './FootprintEmptyState';
import { PlacesDiscovered } from './PlacesDiscovered';
import {
  subscribeToUserFootprint,
  buildFootprintFromPins,
  filterValidPublicPins,
  UserFootprintData,
} from '../../services/footprintService';
import { CountryFootprintGroup, CityFootprintGroup } from '../../utils/footprintUtils';
import { Globe, Loader2, AlertCircle } from 'lucide-react';

interface FootprintSectionProps {
  userId: string;
  isMe: boolean;
  displayName?: string;
  onSelectPin: (pin: Pin) => void;
  onOpenCreatePin?: () => void;
  onCloseProfileModal?: () => void;
  pins?: Pin[];
}

export const FootprintSection: React.FC<FootprintSectionProps> = ({
  userId,
  isMe,
  displayName,
  onSelectPin,
  onOpenCreatePin,
  onCloseProfileModal,
  pins: preloadedPins,
}) => {
  const { user } = useAuth();
  const [footprint, setFootprint] = useState<UserFootprintData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Map Target Navigation state
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [targetView, setTargetView] = useState<{
    center: { lat: number; lng: number };
    zoom: number;
    bounds?: { north: number; south: number; east: number; west: number };
  } | null>(null);

  // Synchronize footprint data (reuses already-fetched pins if provided, otherwise subscribes)
  useEffect(() => {
    if (preloadedPins !== undefined) {
      const validPins = filterValidPublicPins(preloadedPins);
      const data = buildFootprintFromPins(validPins);
      setFootprint(data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToUserFootprint(
      userId,
      (data) => {
        setFootprint(data);
        setIsLoading(false);
      },
      (err: any) => {
        console.warn('Footprint subscription note:', err);
        setError('Unable to load geographic footprint.');
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [userId, preloadedPins]);

  const handleSelectCountry = (country: CountryFootprintGroup) => {
    if (activeCountry?.toLowerCase() === country.countryName.toLowerCase() && !activeCity) {
      handleClearFilter();
      return;
    }

    setActiveCountry(country.countryName);
    setActiveCity(null);
    setTargetView({
      center: country.center,
      zoom: country.citiesCount > 1 ? 6.5 : 8,
      bounds: country.bounds,
    });
  };

  const handleSelectCountryByName = (countryName: string) => {
    const matched = footprint?.countries.find(
      (c) => c.countryName.toLowerCase() === countryName.toLowerCase()
    );
    if (matched) {
      handleSelectCountry(matched);
    } else {
      setActiveCountry(countryName);
      setActiveCity(null);
    }
  };

  const handleSelectCity = (city: CityFootprintGroup, country: CountryFootprintGroup) => {
    if (
      activeCity?.toLowerCase() === city.cityName.toLowerCase() &&
      activeCountry?.toLowerCase() === country.countryName.toLowerCase()
    ) {
      setActiveCity(null);
      setTargetView({
        center: country.center,
        zoom: 6.5,
        bounds: country.bounds,
      });
      return;
    }

    setActiveCountry(country.countryName);
    setActiveCity(city.cityName);
    setTargetView({
      center: city.center,
      zoom: 12,
      bounds: city.bounds,
    });
  };

  const handleSelectCityByName = (cityName: string, countryName: string) => {
    const country = footprint?.countries.find(
      (c) => c.countryName.toLowerCase() === countryName.toLowerCase()
    );
    const city = country?.cities.find(
      (ci) => ci.cityName.toLowerCase() === cityName.toLowerCase()
    );

    if (city && country) {
      handleSelectCity(city, country);
    } else {
      setActiveCountry(countryName);
      setActiveCity(cityName);
      if (country) {
        setTargetView({
          center: country.center,
          zoom: 12,
        });
      }
    }
  };

  const handleClearFilter = () => {
    setActiveCountry(null);
    setActiveCity(null);
    setTargetView(null);
  };

  const handleSelectPinById = (pinId: string) => {
    if (!footprint) return;
    const found = footprint.pins.find((p) => p.id === pinId);
    if (found) {
      onSelectPin(found);
      if (onCloseProfileModal) onCloseProfileModal();
    }
  };

  const handleOpenPinDetails = (pin: Pin) => {
    onSelectPin(pin);
    if (onCloseProfileModal) onCloseProfileModal();
  };

  const handleDropFirstSpot = () => {
    if (onCloseProfileModal) onCloseProfileModal();
    if (onOpenCreatePin) onOpenCreatePin();
  };

  const handleSelectLevel = (level: 'spots' | 'cities' | 'countries') => {
    if (!footprint || footprint.pins.length === 0) return;

    if (level === 'countries') {
      handleClearFilter();
      setTargetView({
        center: footprint.viewport.center,
        zoom: Math.min(footprint.viewport.zoom, 4),
      });
    } else if (level === 'cities') {
      setActiveCity(null);
      setTargetView({
        center: footprint.viewport.center,
        zoom: Math.max(footprint.viewport.zoom, 7.5),
      });
    } else if (level === 'spots') {
      setTargetView({
        center: footprint.viewport.center,
        zoom: Math.max(footprint.viewport.zoom, 12),
      });
    }
  };

  const stats = footprint?.stats || { totalSpots: 0, citiesCount: 0, countriesCount: 0 };
  const clusters = footprint?.clusters || [];
  const countries = footprint?.countries || [];
  const pins = footprint?.pins || [];
  const hasSpots = stats.totalSpots > 0;
  const activeLevel = activeCity ? 'spots' : activeCountry ? 'cities' : null;

  return (
    <div
      id="footprint-section"
      className="border-t border-slate-900/8 dark:border-white/10 p-4 sm:p-6 bg-slate-900/[0.015] dark:bg-black/15"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>My Footprint</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-white/50 mt-0.5">
            {isMe
              ? 'Your geographic discoveries aggregated worldwide'
              : `${displayName || 'User'}'s geographic discoveries aggregated worldwide`}
          </p>
        </div>

        {/* Dynamic Geographic Statistics */}
        {!isLoading && hasSpots && (
          <FootprintStats
            stats={stats}
            activeLevel={activeLevel}
            onSelectLevel={handleSelectLevel}
          />
        )}
      </div>

      {/* Content: Loading / Error / Empty / Interactive Map & Places Discovered */}
      {isLoading ? (
        <div
          id="footprint-loading-state"
          className="liquid-glass-card w-full h-[300px] rounded-2xl flex flex-col items-center justify-center text-slate-500 dark:text-white/45"
        >
          <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-primary)] mb-2" />
          <span className="text-xs font-medium">Aggregating footprint...</span>
        </div>
      ) : error ? (
        <div
          id="footprint-error-state"
          className="liquid-glass-card w-full h-[200px] rounded-2xl flex flex-col items-center justify-center text-slate-600 dark:text-white/55 p-4 text-center"
        >
          <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400 mb-2" />
          <p className="text-xs">{error}</p>
        </div>
      ) : !hasSpots ? (
        <FootprintEmptyState
          isMe={isMe}
          displayName={displayName}
          onDropFirstPin={handleDropFirstSpot}
        />
      ) : (
        <>
          <FootprintMap
            clusters={clusters}
            countries={countries}
            allPins={pins}
            totalPins={stats.totalSpots}
            isMe={isMe}
            currentUserId={user?.uid}
            activeCountry={activeCountry}
            activeCity={activeCity}
            targetView={targetView}
            onSelectCountry={handleSelectCountryByName}
            onSelectCity={handleSelectCityByName}
            onClearFilter={handleClearFilter}
            onSelectPin={handleSelectPinById}
            onOpenPinDetails={handleOpenPinDetails}
          />

          <PlacesDiscovered
            countries={countries}
            activeCountry={activeCountry}
            activeCity={activeCity}
            onSelectCountry={handleSelectCountry}
            onSelectCity={handleSelectCity}
            onClearFilter={handleClearFilter}
          />
        </>
      )}
    </div>
  );
};
