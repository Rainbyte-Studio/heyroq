import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';
import { identifyPinLocation, type PinLocation } from '../../services/pinLocation';

interface Props {
  onCancel: () => void;
  onPickOnMap: () => void;
  onContinue: (location?: PinLocation) => void;
}

const optionStyle = 'liquid-glass-card flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-semibold cursor-pointer heyroq-focus-ring disabled:opacity-60';

export function DropPinLocationDialog({ onCancel, onPickOnMap, onContinue }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      request.current++;
      dialog?.close();
    };
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Your browser does not offer location access. Choose a place or use the map.');
      return;
    }
    setSearching(false);
    setLocating(true);
    setError('');
    const current = ++request.current;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (request.current !== current) return;
      const location = await identifyPinLocation({ lat: coords.latitude, lng: coords.longitude });
      if (request.current === current) onContinue(location);
    }, failure => {
      if (request.current !== current) return;
      setLocating(false);
      setError(failure.code === 1
        ? 'Location permission was denied. Search for a place or choose on the map.'
        : 'Your location could not be determined. Try again or choose another option.');
    }, { timeout: 10000, maximumAge: 30000 });
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="drop-pin-location-title"
      onCancel={event => { event.preventDefault(); onCancel(); }}
      onClick={event => { if (event.target === event.currentTarget) onCancel(); }}
      className="liquid-glass-modal m-auto w-[calc(100%-1.5rem)] max-w-sm max-h-[90dvh] overflow-auto rounded-3xl p-4 text-[var(--heyroq-text-primary)] backdrop:bg-black/40">
      <section className="space-y-2">
        <h2 id="drop-pin-location-title" className="font-heading text-lg font-bold">Drop Pin</h2>
        <button type="button" className={optionStyle} aria-expanded={searching}
          onClick={() => { request.current++; setLocating(false); setError(''); setSearching(!searching); }}>
          <Search size={18} aria-hidden="true" /> Search for a Place
        </button>
        {searching && (
          <LocationAutocompleteInput id="drop-pin-place-search" ariaLabel="Search for a place"
            autoFocus value={query} onChange={setQuery}
            onLocationSelect={place => onContinue({
              lat: place.latitude, lng: place.longitude,
              locationName: place.locationName, address: place.formattedAddress,
            })}
          />
        )}
        <button type="button" className={optionStyle} onClick={onPickOnMap}>
          <MapPin size={18} aria-hidden="true" /> Choose on Map
        </button>
        <button type="button" className={optionStyle} disabled={locating} onClick={useMyLocation}>
          <LocateFixed size={18} aria-hidden="true" /> Use My Location
        </button>
        {locating && <p role="status" className="text-sm">Finding your location…</p>}
        {error && <p role="alert" className="text-sm">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="min-h-11 px-2 text-sm underline heyroq-focus-ring"
            onClick={() => onContinue()}>Enter coordinates manually</button>
          <button type="button" className="min-h-11 px-2 text-sm heyroq-focus-ring"
            onClick={onCancel}>Cancel</button>
        </div>
      </section>
    </dialog>
  );
}
