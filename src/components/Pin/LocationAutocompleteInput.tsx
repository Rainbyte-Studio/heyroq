import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { APILoadingStatus, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useHeyroqMapsStatus } from '../Map/MapsProvider';
import {
  fetchPlaceSuggestions,
  fetchPlaceDetails,
  PlacesAutocompleteSession,
  type PlaceSuggestion,
  type PlaceDetailsResult,
} from '../../services/placesService';

interface LocationAutocompleteInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (location: PlaceDetailsResult) => void;
  disabled?: boolean;
  ariaLabel?: string;
  autoFocus?: boolean;
  onInputFocus?: () => void;
}

export function LocationAutocompleteInput({
  id, value, onChange, onLocationSelect, disabled = false, ariaLabel, autoFocus, onInputFocus,
}: LocationAutocompleteInputProps) {
  const places = useMapsLibrary('places');
  const mapsStatus = useHeyroqMapsStatus();
  const unavailable = mapsStatus === APILoadingStatus.FAILED || mapsStatus === APILoadingStatus.AUTH_FAILURE;
  const listId = useId();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [message, setMessage] = useState('');
  const [selecting, setSelecting] = useState(false);
  const session = useRef(new PlacesAutocompleteSession());
  const generation = useRef(0);
  const mounted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const open = !disabled && query.trim().length >= 2 && query === value;
  const expanded = open && !unavailable && suggestions.length > 0;
  const isBusy = selecting || (open && !unavailable && (message === 'Searching places…' || message === 'Loading place search…'));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);

  // Use synchronous preventScroll focus instead of raw HTML autoFocus so iOS
  // Safari opens the keyboard on tap without scrolling the background layout.
  useLayoutEffect(() => {
    if (!autoFocus || disabled) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (!open) return;
    if (unavailable) {
      setMessage('Place search is unavailable. You can enter a name manually.');
      return;
    }
    setMessage(places ? 'Searching places…' : 'Loading place search…');
    if (!places) return;
    const request = generation.current;
    const timer = window.setTimeout(async () => {
      try {
        const results = await fetchPlaceSuggestions(query, session.current, places);
        if (request !== generation.current) return;
        setSuggestions(results);
        setMessage(results.length ? results.length + ' suggestions available.' : 'No places found.');
      } catch {
        if (request === generation.current) {
          setMessage('Place search is unavailable. Edit the name to try again.');
        }
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      generation.current++;
    };
  }, [open, places, query, unavailable]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function closeSuggestions() {
    generation.current++;
    setQuery('');
    setSuggestions([]);
    setActiveIndex(-1);
    setMessage('');
  }

  async function select(suggestion: PlaceSuggestion) {
    closeSuggestions();
    setSelecting(true);
    session.current = new PlacesAutocompleteSession();
    // The search effect also cleans up when the list closes. Selection has
    // its own session and can only be superseded by unmounting the input.
    try {
      const details = await fetchPlaceDetails(suggestion);
      if (!details) throw new Error('Place has no coordinates');
      if (!mounted.current) return;
      onLocationSelect(details);
      setMessage('');
    } catch {
      if (mounted.current) setMessage('Could not load this place. Edit the name to try again.');
    } finally {
      if (mounted.current) setSelecting(false);
    }
  }

  return (
    <div onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget) && !selecting) {
        closeSuggestions();
        session.current.reset();
      }
    }}>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--heyroq-text-muted)]"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && activeIndex >= 0 ? listId + '-' + activeIndex : undefined}
          value={value}
          disabled={disabled}
          readOnly={selecting}
          placeholder="Search for a place or enter a name"
          autoComplete="off"
          onFocus={() => onInputFocus?.()}
          onChange={event => {
            closeSuggestions();
            onChange(event.target.value);
            setQuery(event.target.value);
            if (!event.target.value.trim()) session.current.reset();
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              closeSuggestions();
            } else if (expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActiveIndex(index => index < 0 && step < 0
                ? suggestions.length - 1
                : (index + step + suggestions.length) % suggestions.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (expanded && activeIndex >= 0) void select(suggestions[activeIndex]);
            }
          }}
          className="liquid-glass-input w-full min-h-[44px] sm:min-h-[40px] pl-9 pr-9 py-2 rounded-xl text-base [@media(hover:hover)_and_(pointer:fine)]:text-sm text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] heyroq-focus-ring"
        />
        {isBusy && (
          <Loader2
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--brand-primary)]"
          />
        )}
      </div>
      <div
        role="status"
        className={
          expanded || (!selecting && !message)
            ? 'sr-only'
            : 'mt-1.5 px-0.5 text-xs text-[var(--heyroq-text-secondary)]'
        }
      >
        {selecting ? 'Loading place details…' : message}
      </div>
      {expanded && (
        <div className="liquid-glass-popover mt-1.5 overflow-hidden rounded-2xl border border-[var(--glass-border-strong)]">
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggested places"
            className="max-h-40 overflow-y-auto overscroll-contain touch-pan-y divide-y divide-[var(--heyroq-divider)]"
          >
            {suggestions.map((suggestion, index) => {
              const isActive = index === activeIndex;
              return (
                <li
                  key={suggestion.placeId}
                  id={listId + '-' + index}
                  ref={node => { optionRefs.current[index] = node; }}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => void select(suggestion)}
                  className={
                    'min-h-[44px] flex items-start gap-2.5 cursor-pointer px-3 py-2.5 transition-colors break-words ' +
                    (isActive
                      ? 'bg-[var(--brand-primary)]/14 text-[var(--heyroq-text-primary)]'
                      : 'hover:bg-[var(--heyroq-bg-subtle)] text-[var(--heyroq-text-primary)]')
                  }
                >
                  <MapPin
                    aria-hidden="true"
                    strokeWidth={1.9}
                    className={
                      'w-4 h-4 mt-0.5 shrink-0 ' +
                      (isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--heyroq-text-muted)]')
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm sm:text-xs font-semibold leading-snug">
                      {suggestion.mainText}
                    </div>
                    {suggestion.secondaryText && (
                      <div className="mt-0.5 text-xs sm:text-[11px] text-[var(--heyroq-text-muted)] leading-snug">
                        {suggestion.secondaryText}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-[var(--heyroq-divider)] bg-[var(--heyroq-bg-subtle)] px-3 py-1.5 text-right text-[11px] font-medium text-[var(--heyroq-text-muted)]">
            Google Maps
          </p>
        </div>
      )}
    </div>
  );
}
