import { useEffect, useId, useRef, useState } from 'react';
import { APILoadingStatus, useMapsLibrary } from '@vis.gl/react-google-maps';
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
}

export function LocationAutocompleteInput({
  id, value, onChange, onLocationSelect, disabled = false, ariaLabel, autoFocus,
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
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const open = !disabled && query.trim().length >= 2 && query === value;
  const expanded = open && !unavailable && suggestions.length > 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);

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
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? listId + '-' + activeIndex : undefined}
        value={value}
        disabled={disabled}
        readOnly={selecting}
        placeholder="Search for a place or enter a name"
        autoComplete="off"
        onChange={event => {
          closeSuggestions();
          onChange(event.target.value);
          setQuery(event.target.value);
          if (!event.target.value.trim()) session.current.reset();
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && open) {
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
        className="liquid-glass-input w-full px-3 py-2 rounded-xl text-base sm:text-xs"
      />
      <div role="status" className={expanded || (!selecting && !message) ? 'sr-only' : 'mt-1 text-xs'}>
        {selecting ? 'Loading place details…' : message}
      </div>
      {expanded && (
        <div className="liquid-glass-popover mt-1 rounded-xl border border-[var(--heyroq-divider)]">
          <ul id={listId} role="listbox" aria-label="Suggested places"
            className="max-h-40 overflow-y-auto overscroll-contain touch-pan-y divide-y divide-[var(--heyroq-divider)]">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.placeId}
                id={listId + '-' + index}
                ref={node => { optionRefs.current[index] = node; }}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={event => event.preventDefault()}
                onClick={() => void select(suggestion)}
                className={'min-h-[44px] cursor-pointer px-3 py-2 break-words ' +
                  (index === activeIndex ? 'bg-[var(--brand-primary)]/15' : 'hover:bg-slate-500/10')}
              >
                <div className="font-semibold">{suggestion.mainText}</div>
                {suggestion.secondaryText && <div className="text-[var(--heyroq-text-muted)]">{suggestion.secondaryText}</div>}
              </li>
            ))}
          </ul>
          <p className="px-3 py-1 text-right text-xs font-medium">Google Maps</p>
        </div>
      )}
    </div>
  );
}
