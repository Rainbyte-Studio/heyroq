import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Loader2, X, Search } from 'lucide-react';
import {
  fetchPlaceSuggestions,
  fetchPlaceDetails,
  PlacesAutocompleteSession,
  PlaceSuggestion,
  PlaceDetailsResult,
} from '../../services/placesService';

interface LocationAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (location: {
    locationName: string;
    latitude: number;
    longitude: number;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const LocationAutocompleteInput: React.FC<LocationAutocompleteInputProps> = ({
  value,
  onChange,
  onLocationSelect,
  placeholder = 'e.g. Tromsø, Norway or Montmartre',
  disabled = false,
}) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<any>(null);
  const sessionRef = useRef<PlacesAutocompleteSession>(new PlacesAutocompleteSession());
  const activeRequestRef = useRef<number>(0);

  // Hook for Google Maps Places library (if wrapped in APIProvider)
  let placesLib: any = null;
  try {
    placesLib = useMapsLibrary('places');
  } catch {
    placesLib = null;
  }

  // Keep query in sync if parent updates value (e.g. from map click or initial load)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Handle outside click to close suggestions
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Debounced search trigger (300ms)
  const triggerDebouncedSearch = useCallback(
    (searchTerm: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const trimmed = searchTerm.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        setIsOpen(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setIsOpen(true);

      const requestId = ++activeRequestRef.current;

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const results = await fetchPlaceSuggestions(trimmed, sessionRef.current, placesLib);

          // Only apply if this is still the most recent request
          if (requestId === activeRequestRef.current) {
            setSuggestions(results);
            setSelectedIndex(-1);
            setIsLoading(false);
            setIsOpen(true);
          }
        } catch (err) {
          if (requestId === activeRequestRef.current) {
            console.warn('Autocomplete fetch failed:', err);
            setSuggestions([]);
            setIsLoading(false);
          }
        }
      }, 300);
    },
    [placesLib]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setQuery(newVal);
    onChange(newVal);
    triggerDebouncedSearch(newVal);
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    setIsFetchingDetails(true);
    setIsOpen(false);
    setSelectedIndex(-1);

    // Provide immediate responsive display
    setQuery(suggestion.fullText);
    onChange(suggestion.fullText);

    try {
      const details: PlaceDetailsResult | null = await fetchPlaceDetails(
        suggestion,
        sessionRef.current,
        placesLib
      );

      if (details) {
        setQuery(details.locationName);
        onChange(details.locationName);
        onLocationSelect({
          locationName: details.locationName,
          latitude: details.latitude,
          longitude: details.longitude,
        });
      }
    } catch (err) {
      console.warn('Failed to retrieve place details:', err);
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && query.trim().length >= 2) {
        triggerDebouncedSearch(query);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else if (suggestions.length > 0) {
        // Default to first suggestion on enter if none actively highlighted
        e.preventDefault();
        handleSelectSuggestion(suggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
    sessionRef.current.reset();
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id="heyroq-location-autocomplete-input"
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim().length >= 2 && suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="liquid-glass-input w-full px-3 py-2 pr-8 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/25 text-xs transition-colors"
        />

        {/* Action icons inside input */}
        <div className="absolute right-2.5 flex items-center gap-1">
          {isLoading || isFetchingDetails ? (
            <Loader2 className="w-3.5 h-3.5 text-[var(--brand-primary)] animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 dark:text-white/40 hover:text-slate-800 dark:hover:text-white p-0.5 rounded transition cursor-pointer"
              title="Clear location"
              aria-label="Clear location"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
          )}
        </div>
      </div>

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && (
        <div
          id="heyroq-places-dropdown"
          className="liquid-glass-popover absolute top-full left-0 mt-1.5 w-full sm:w-[190%] md:w-[220%] max-w-[calc(100vw-3rem)] sm:max-w-lg rounded-2xl z-50 overflow-hidden py-1.5 max-h-64 overflow-y-auto subtle-glass-scrollbar"
        >
          {isLoading ? (
            <div className="flex items-center gap-2.5 px-4 py-3 text-xs text-slate-600 dark:text-white/70">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-primary)]" />
              <span>Searching places...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <ul className="divide-y divide-[var(--heyroq-divider)]" role="listbox">
              {suggestions.map((s, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <li
                    key={s.placeId || index}
                    role="option"
                    aria-selected={isSelected}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(s);
                    }}
                    className={`flex items-start gap-3 px-3.5 py-2.5 cursor-pointer text-left transition-colors min-h-[44px] ${
                      isSelected
                        ? 'bg-[var(--brand-primary)]/12 dark:bg-white/12'
                        : 'hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] mt-0.5 shrink-0 border border-[var(--brand-primary)]/20">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {s.mainText || s.fullText}
                      </div>
                      {s.secondaryText && (
                        <div className="text-[11px] text-slate-500 dark:text-white/50 truncate mt-0.5">
                          {s.secondaryText}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : query.trim().length >= 2 ? (
            <div className="px-4 py-3 text-xs text-slate-500 dark:text-white/45 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-white/30 shrink-0" />
              <span>No places found for &quot;{query.trim()}&quot;</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
