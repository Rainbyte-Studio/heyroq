/**
 * Google Places API & Geocoding Service for Heyroq
 *
 * Supports both Google Places API (New) and legacy Places API,
 * with AutocompleteSessionToken management, debouncing support,
 * clean human-readable label formatting, and reverse-geocoding for manual map clicks.
 */

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
  rawSuggestion?: any;
}

export interface PlaceDetailsResult {
  placeId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
}

export class PlacesAutocompleteSession {
  private token: any = null;

  getToken(placesLib?: any): any {
    const places = placesLib || (typeof window !== 'undefined' ? (window as any).google?.maps?.places : null);
    if (!this.token && places?.AutocompleteSessionToken) {
      try {
        this.token = new places.AutocompleteSessionToken();
      } catch (err) {
        console.warn('Failed to instantiate AutocompleteSessionToken:', err);
      }
    }
    return this.token;
  }

  reset() {
    this.token = null;
  }
}

/**
 * Extracts numeric coordinates safely from a Google Place object
 * (Handles both Places API New location and legacy geometry.location).
 */
export function extractCoordinates(place: any): { lat: number; lng: number } | null {
  if (!place) return null;

  // Places API (New): place.location
  if (place.location) {
    const lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
    const lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  // Legacy Places API: place.geometry.location
  if (place.geometry?.location) {
    const lat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
    const lng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Creates a clean, concise, human-readable location label
 * (e.g., "Tromsø, Norway", "Montmartre, Paris, France", "Mission District, San Francisco, CA, USA")
 * rather than overly long raw street addresses with postal codes.
 */
export function formatCleanLocationLabel(
  place: any,
  predictionText?: string,
  mainText?: string,
  secondaryText?: string
): string {
  // If prediction already provided clean main + secondary
  if (mainText && secondaryText) {
    const cleanSecondary = secondaryText.replace(/\b\d{4,6}\b,?\s*/g, '').trim().replace(/,\s*$/, '');
    return `${mainText}${cleanSecondary ? `, ${cleanSecondary}` : ''}`;
  }

  if (predictionText) {
    return predictionText.replace(/\b\d{4,6}\b,?\s*/g, '').trim().replace(/,\s*$/, '');
  }

  // Attempt to build from place displayName and address components
  const displayName =
    typeof place?.displayName === 'string'
      ? place.displayName
      : place?.displayName?.text || place?.name;

  const components = place?.addressComponents || place?.address_components;
  if (components && Array.isArray(components)) {
    const getComp = (type: string) => {
      const found = components.find((c: any) => c.types?.includes(type));
      return found?.longText || found?.long_name || found?.shortText || found?.short_name || '';
    };

    const neighborhood = getComp('neighborhood') || getComp('sublocality_level_1') || getComp('sublocality');
    const city = getComp('locality') || getComp('postal_town');
    const state = getComp('administrative_area_level_1');
    const country = getComp('country');

    const parts = [displayName || neighborhood, city, state, country].filter(Boolean);
    const deduped: string[] = [];
    for (const p of parts) {
      if (!deduped.some((d) => d.toLowerCase() === p.toLowerCase())) {
        deduped.push(p);
      }
    }
    if (deduped.length > 0) {
      return deduped.join(', ');
    }
  }

  const rawAddress = place?.formattedAddress || place?.formatted_address;
  if (rawAddress) {
    return rawAddress.replace(/\b\d{4,6}\b,?\s*/g, '').trim().replace(/,\s*$/, '');
  }

  return displayName || predictionText || '';
}

/**
 * Fetches place suggestions for the given user input.
 * Supports both Places API (New) and legacy AutocompleteService.
 */
export async function fetchPlaceSuggestions(
  input: string,
  session?: PlacesAutocompleteSession,
  placesLib?: any
): Promise<PlaceSuggestion[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const places = placesLib || (typeof window !== 'undefined' ? (window as any).google?.maps?.places : null);
  if (!places) {
    return [];
  }

  // 1. Prefer Places API (New): AutocompleteSuggestion.fetchAutocompleteSuggestions
  if (places.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    try {
      const request: any = {
        input: trimmed,
        // Crucial: do NOT restrict types to '(cities)' so neighborhoods, landmarks, POIs are included
      };

      const token = session?.getToken(places);
      if (token) {
        request.sessionToken = token;
      }

      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      if (response && Array.isArray(response.suggestions) && response.suggestions.length > 0) {
        return response.suggestions
          .filter((s: any) => s.placePrediction)
          .map((s: any) => {
            const pred = s.placePrediction;
            return {
              placeId: pred.placeId,
              mainText: pred.mainText?.text || pred.text?.text || '',
              secondaryText: pred.secondaryText?.text || '',
              fullText: pred.text?.text || pred.mainText?.text || '',
              rawSuggestion: s,
            };
          });
      }
    } catch (err) {
      console.warn('Places API (New) Autocomplete failed, falling back to classic service:', err);
    }
  }

  // 2. Legacy fallback: google.maps.places.AutocompleteService
  if (places.AutocompleteService) {
    return new Promise((resolve) => {
      try {
        const service = new places.AutocompleteService();
        const request: any = {
          input: trimmed,
        };

        const token = session?.getToken(places);
        if (token) {
          request.sessionToken = token;
        }

        service.getPlacePredictions(request, (predictions: any, status: any) => {
          if (status === 'OK' && Array.isArray(predictions)) {
            resolve(
              predictions.map((p: any) => ({
                placeId: p.place_id,
                mainText: p.structured_formatting?.main_text || p.description,
                secondaryText: p.structured_formatting?.secondary_text || '',
                fullText: p.description,
                rawSuggestion: p,
              }))
            );
          } else {
            resolve([]);
          }
        });
      } catch (err) {
        console.warn('Legacy AutocompleteService failed:', err);
        resolve([]);
      }
    });
  }

  return [];
}

/**
 * Fetches place details (geometry and clean name) for a selected suggestion.
 * Supports Places API (New) Place.fetchFields and legacy PlacesService.getDetails.
 */
export async function fetchPlaceDetails(
  suggestion: PlaceSuggestion,
  session?: PlacesAutocompleteSession,
  placesLib?: any
): Promise<PlaceDetailsResult | null> {
  const places = placesLib || (typeof window !== 'undefined' ? (window as any).google?.maps?.places : null);
  if (!places) return null;

  // 1. Try Places API (New) via placePrediction.toPlace()
  if (suggestion.rawSuggestion?.placePrediction?.toPlace) {
    try {
      const place = suggestion.rawSuggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      const coords = extractCoordinates(place);
      if (coords) {
        const cleanName = formatCleanLocationLabel(
          place,
          suggestion.fullText,
          suggestion.mainText,
          suggestion.secondaryText
        );
        session?.reset();
        return {
          placeId: place.id || suggestion.placeId,
          locationName: cleanName,
          latitude: Number(coords.lat.toFixed(6)),
          longitude: Number(coords.lng.toFixed(6)),
          formattedAddress: place.formattedAddress,
        };
      }
    } catch (err) {
      console.warn('Places API (New) toPlace().fetchFields failed, trying Place constructor:', err);
    }
  }

  // 1b. Try new places.Place({ id: suggestion.placeId })
  if (places.Place && suggestion.placeId) {
    try {
      const place = new places.Place({ id: suggestion.placeId });
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      const coords = extractCoordinates(place);
      if (coords) {
        const cleanName = formatCleanLocationLabel(
          place,
          suggestion.fullText,
          suggestion.mainText,
          suggestion.secondaryText
        );
        session?.reset();
        return {
          placeId: place.id || suggestion.placeId,
          locationName: cleanName,
          latitude: Number(coords.lat.toFixed(6)),
          longitude: Number(coords.lng.toFixed(6)),
          formattedAddress: place.formattedAddress,
        };
      }
    } catch (err) {
      console.warn('places.Place constructor fetchFields failed, trying legacy PlacesService:', err);
    }
  }

  // 2. Legacy fallback: google.maps.places.PlacesService
  if (places.PlacesService && suggestion.placeId) {
    return new Promise((resolve) => {
      try {
        const dummyDiv = document.createElement('div');
        const service = new places.PlacesService(dummyDiv);
        const token = session?.getToken(places);

        service.getDetails(
          {
            placeId: suggestion.placeId,
            fields: ['name', 'formatted_address', 'geometry', 'address_components'],
            sessionToken: token || undefined,
          },
          (place: any, status: any) => {
            session?.reset();
            if (status === 'OK' && place) {
              const coords = extractCoordinates(place);
              if (coords) {
                const cleanName = formatCleanLocationLabel(
                  place,
                  suggestion.fullText,
                  suggestion.mainText,
                  suggestion.secondaryText
                );
                resolve({
                  placeId: suggestion.placeId,
                  locationName: cleanName,
                  latitude: Number(coords.lat.toFixed(6)),
                  longitude: Number(coords.lng.toFixed(6)),
                  formattedAddress: place.formatted_address,
                });
                return;
              }
            }
            resolve(null);
          }
        );
      } catch (err) {
        console.warn('Legacy PlacesService.getDetails failed:', err);
        session?.reset();
        resolve(null);
      }
    });
  }

  session?.reset();
  return null;
}

/**
 * Reverse geocodes coordinates (lat, lng) into a concise human-readable location name
 * for when the user clicks the map to pick a location.
 */
export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number,
  geocodingLib?: any
): Promise<{ locationName: string; fullAddress?: string } | null> {
  return new Promise((resolve) => {
    const GeocoderClass =
      geocodingLib?.Geocoder ||
      (typeof window !== 'undefined' ? (window as any).google?.maps?.Geocoder : null);

    if (!GeocoderClass) {
      resolve(null);
      return;
    }

    try {
      const geocoder = new GeocoderClass();
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
        if (status === 'OK' && results && results.length > 0) {
          const cleanName = buildCleanReverseGeocodeLabel(results);
          resolve({
            locationName: cleanName,
            fullAddress: results[0].formatted_address,
          });
        } else {
          resolve(null);
        }
      });
    } catch (err) {
      console.warn('Reverse geocode error:', err);
      resolve(null);
    }
  });
}

function buildCleanReverseGeocodeLabel(results: any[]): string {
  if (!results || results.length === 0) return '';

  for (const res of results) {
    const components = res.address_components || [];
    const getComp = (type: string) => {
      const c = components.find((comp: any) => comp.types?.includes(type));
      return c?.long_name || c?.short_name || '';
    };

    const neighborhood = getComp('neighborhood') || getComp('sublocality_level_1') || getComp('sublocality');
    const locality = getComp('locality') || getComp('postal_town');
    const adminArea = getComp('administrative_area_level_1');
    const country = getComp('country');

    if (neighborhood && locality) {
      return country ? `${neighborhood}, ${locality}, ${country}` : `${neighborhood}, ${locality}`;
    }
    if (locality && country) {
      return `${locality}, ${country}`;
    }
    if (adminArea && country) {
      return `${adminArea}, ${country}`;
    }
  }

  const first = results[0].formatted_address || '';
  return first.replace(/\b\d{4,6}\b,?\s*/g, '').trim().replace(/,\s*$/, '');
}
