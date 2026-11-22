import type { LatLngPoint } from '../types';
import { reverseGeocodeCoordinates } from './placesService';

export interface PinLocation extends LatLngPoint {
  locationName?: string;
  address?: string;
}

async function fetchLocation(
  point: LatLngPoint,
  placeId?: string,
): Promise<PinLocation> {
  let locationName = '';
  if (placeId) {
    try {
      const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      locationName = place.displayName ?? '';
      if (place.formattedAddress) return { ...point, locationName, address: place.formattedAddress };
    } catch {
      // The coordinates remain usable if Place Details is unavailable.
    }
  }

  try {
    const geocoding = await google.maps.importLibrary('geocoding') as google.maps.GeocodingLibrary;
    const result = await reverseGeocodeCoordinates(point.lat, point.lng, geocoding);
    return { ...point, locationName, address: result?.fullAddress };
  } catch {
    return { ...point, locationName };
  }
}

export async function identifyPinLocation(point: LatLngPoint, placeId?: string): Promise<PinLocation> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PinLocation>(resolve => {
    timer = setTimeout(() => resolve({ ...point, locationName: '' }), 5000);
  });
  try {
    return await Promise.race([fetchLocation(point, placeId), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function pinPositionDiffers(a: LatLngPoint, b: LatLngPoint) {
  // The provider returns coordinates rounded to six decimal places.
  return Math.abs(a.lat - b.lat) > 0.000001 || Math.abs(a.lng - b.lng) > 0.000001;
}
