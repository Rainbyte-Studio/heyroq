/**
 * Google Places API & Geocoding Service for Heyroq
 *
 * Uses Places API (New) for autocomplete and place details.
 */

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
  prediction: google.maps.places.PlacePrediction;
}

export interface PlaceDetailsResult {
  placeId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
}

export class PlacesAutocompleteSession {
  private token?: google.maps.places.AutocompleteSessionToken;

  getToken(places: google.maps.PlacesLibrary) {
    return this.token ??= new places.AutocompleteSessionToken();
  }

  reset() {
    this.token = undefined;
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

/** Fetch predictions for places, businesses and geographic locations. */
export async function fetchPlaceSuggestions(
  input: string,
  session: PlacesAutocompleteSession,
  places: google.maps.PlacesLibrary,
): Promise<PlaceSuggestion[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: trimmed,
    sessionToken: session.getToken(places),
  });
  return suggestions.flatMap(({ placePrediction: prediction }) => prediction ? [{
    placeId: prediction.placeId,
    mainText: prediction.mainText?.text || prediction.text.text,
    secondaryText: prediction.secondaryText?.text || '',
    fullText: prediction.text.text,
    prediction,
  }] : []);
}

export async function fetchPlaceDetails(suggestion: PlaceSuggestion): Promise<PlaceDetailsResult | null> {
  const place = suggestion.prediction.toPlace();
  await place.fetchFields({ fields: ['formattedAddress', 'location'] });
  const coords = extractCoordinates(place);
  if (!coords) return null;
  return {
    placeId: suggestion.placeId,
    locationName: suggestion.mainText,
    formattedAddress: place.formattedAddress ?? undefined,
    latitude: Number(coords.lat.toFixed(6)),
    longitude: Number(coords.lng.toFixed(6)),
  };
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
