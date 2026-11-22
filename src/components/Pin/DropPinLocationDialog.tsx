import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
} from 'lucide-react';
import { CloseButton } from '../Common/CloseButton';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';
import { identifyPinLocation, type PinLocation } from '../../services/pinLocation';
import { ensureFocusModalityTracking } from '../../utils/focusModality';

interface Props {
  onCancel: () => void;
  onPickOnMap: () => void;
  onContinue: (location?: PinLocation) => void;
}

const optionCardBase =
  'group flex min-h-[60px] w-full items-center gap-3.5 rounded-2xl border px-3.5 py-3 text-left transition-all duration-150 cursor-pointer heyroq-focus-ring touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]';

const optionCardIdle =
  'bg-[var(--heyroq-bg-surface)] border-[var(--heyroq-border-subtle)] hover:border-[var(--heyroq-border-strong)] hover:bg-[var(--heyroq-bg-elevated)]/70 shadow-[var(--heyroq-shadow-sm)]';

const optionCardActive =
  'bg-[var(--brand-primary)]/[0.07] border-[var(--brand-primary)]/45 shadow-[var(--heyroq-shadow-sm)]';

export function DropPinLocationDialog({ onCancel, onPickOnMap, onContinue }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const request = useRef(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ensureFocusModalityTracking();
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      request.current++;
      dialog?.close();
      const prev = previousFocusRef.current;
      if (prev && prev !== document.body && prev.isConnected) {
        prev.focus({ preventScroll: true });
      }
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
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (request.current !== current) return;
        const location = await identifyPinLocation({ lat: coords.latitude, lng: coords.longitude });
        if (request.current === current) onContinue(location);
      },
      failure => {
        if (request.current !== current) return;
        setLocating(false);
        setError(
          failure.code === 1
            ? 'Location permission was denied. Search for a place or choose on the map.'
            : 'Your location could not be determined. Try again or choose another option.',
        );
      },
      { timeout: 10000, maximumAge: 30000 },
    );
  }

  return (
    <dialog
      ref={dialogRef}
      id="drop-pin-location-dialog"
      aria-labelledby="drop-pin-location-title"
      aria-describedby="drop-pin-location-subtitle"
      onCancel={event => {
        event.preventDefault();
        onCancel();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-[420px] max-h-[90dvh] overflow-hidden rounded-[26px] border border-[var(--glass-border-strong)] bg-transparent p-0 text-[var(--heyroq-text-primary)] shadow-[var(--heyroq-shadow-modal)] backdrop:bg-[var(--heyroq-backdrop-scrim)] backdrop:backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
    >
      <div className="relative flex max-h-[90dvh] flex-col overflow-hidden rounded-[inherit]">
        {/* Sibling glass surface layer matching Heyroq AppWindow */}
        <div
          aria-hidden="true"
          className="liquid-glass-modal-surface absolute inset-0 rounded-[inherit] pointer-events-none"
        />

        {/* Sticky translucent header */}
        <header className="heyroq-window-header relative z-10 flex items-start justify-between gap-3 px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="drop-pin-location-title"
              className="font-heading text-lg font-bold tracking-tight text-[var(--heyroq-text-primary)] leading-tight"
            >
              Drop Pin
            </h2>
            <p
              id="drop-pin-location-subtitle"
              className="mt-0.5 text-xs text-[var(--heyroq-text-secondary)] leading-relaxed"
            >
              Choose how to set the location for your new spot.
            </p>
          </div>
          <CloseButton
            id="drop-pin-dialog-close-btn"
            size="sm"
            ariaLabel="Close Drop Pin"
            onClick={onCancel}
          />
        </header>

        {/* Body */}
        <section className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-2.5">
          {/* Option 1: Search for a Place */}
          <div className="space-y-2">
            <button
              type="button"
              className={`${optionCardBase} ${searching ? optionCardActive : optionCardIdle}`}
              aria-expanded={searching}
              onClick={() => {
                request.current++;
                setLocating(false);
                setError('');
                setSearching(prev => !prev);
              }}
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] transition-colors group-hover:bg-[var(--brand-primary)]/18"
              >
                <Search className="w-[18px] h-[18px]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-tight text-[var(--heyroq-text-primary)] leading-snug">
                  Search for a Place
                </span>
                <span className="mt-0.5 block text-xs text-[var(--heyroq-text-secondary)] leading-snug">
                  Find a landmark, venue, or street address
                </span>
              </span>
              {searching ? (
                <ChevronDown
                  aria-hidden="true"
                  className="w-4 h-4 shrink-0 text-[var(--brand-primary)] transition-transform"
                />
              ) : (
                <ChevronRight
                  aria-hidden="true"
                  className="w-4 h-4 shrink-0 text-[var(--heyroq-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--heyroq-text-primary)]"
                />
              )}
            </button>

            {searching && (
              <div className="rounded-2xl border border-[var(--heyroq-border-subtle)] bg-[var(--heyroq-bg-elevated)]/65 p-3 space-y-2.5 animate-in fade-in duration-150">
                <LocationAutocompleteInput
                  id="drop-pin-place-search"
                  ariaLabel="Search for a place"
                  autoFocus
                  value={query}
                  onChange={setQuery}
                  onLocationSelect={place =>
                    onContinue({
                      lat: place.latitude,
                      lng: place.longitude,
                      locationName: place.locationName,
                      address: place.formattedAddress,
                    })
                  }
                />
                <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-[var(--heyroq-text-muted)]">
                  <span>Can&apos;t find the place?</span>
                  <button
                    type="button"
                    onClick={() => onContinue()}
                    className="inline-flex min-h-[32px] items-center rounded-lg px-1.5 font-medium text-[var(--heyroq-accent-text)] hover:underline cursor-pointer heyroq-focus-ring"
                  >
                    Enter coordinates manually
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Option 2: Choose on Map */}
          <button
            type="button"
            className={`${optionCardBase} ${optionCardIdle}`}
            onClick={onPickOnMap}
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] transition-colors group-hover:bg-[var(--brand-primary)]/18"
            >
              <MapPin className="w-[18px] h-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold tracking-tight text-[var(--heyroq-text-primary)] leading-snug">
                Choose on Map
              </span>
              <span className="mt-0.5 block text-xs text-[var(--heyroq-text-secondary)] leading-snug">
                Tap any point or place directly on the map
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="w-4 h-4 shrink-0 text-[var(--heyroq-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--heyroq-text-primary)]"
            />
          </button>

          {/* Option 3: Use My Location */}
          <button
            type="button"
            className={`${optionCardBase} ${optionCardIdle}`}
            disabled={locating}
            onClick={useMyLocation}
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] transition-colors group-hover:bg-[var(--brand-primary)]/18"
            >
              {locating ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
              ) : (
                <LocateFixed className="w-[18px] h-[18px]" strokeWidth={2} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold tracking-tight text-[var(--heyroq-text-primary)] leading-snug">
                Use My Location
              </span>
              <span className="mt-0.5 block text-xs text-[var(--heyroq-text-secondary)] leading-snug">
                Use your current GPS position
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="w-4 h-4 shrink-0 text-[var(--heyroq-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--heyroq-text-primary)]"
            />
          </button>

          {/* Live status */}
          {locating && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-[var(--heyroq-border-subtle)] bg-[var(--heyroq-bg-elevated)]/70 px-3.5 py-2.5 text-xs font-medium text-[var(--heyroq-text-secondary)]"
            >
              <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin text-[var(--brand-primary)] shrink-0" />
              <span>Finding your location…</span>
            </div>
          )}

          {/* Inline accessible error state with secondary coordinate fallback */}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--heyroq-status-error)]/25 bg-[var(--heyroq-status-error)]/[0.07] px-3.5 py-2.5 text-xs text-[var(--heyroq-text-primary)]"
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  aria-hidden="true"
                  className="w-4 h-4 mt-0.5 shrink-0 text-[var(--heyroq-status-error)]"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="leading-relaxed text-[var(--heyroq-text-secondary)]">{error}</p>
                  <button
                    type="button"
                    onClick={() => onContinue()}
                    className="inline-flex min-h-[28px] items-center font-medium text-[var(--heyroq-accent-text)] hover:underline cursor-pointer heyroq-focus-ring"
                  >
                    Enter coordinates manually
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Quiet footer */}
        <footer className="relative z-[1] flex items-center justify-end border-t border-[var(--heyroq-divider)] px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[40px] rounded-xl px-4 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:bg-[var(--heyroq-bg-subtle)] hover:text-[var(--heyroq-text-primary)] transition-colors cursor-pointer heyroq-focus-ring"
          >
            Cancel
          </button>
        </footer>
      </div>
    </dialog>
  );
}
