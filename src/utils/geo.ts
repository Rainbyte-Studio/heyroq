import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';

export interface LatLngBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

// Compute geohash for coordinates
export function computeGeohash(lat: number, lng: number): string {
  return geohashForLocation([lat, lng]);
}

// Check if a point is within bounds
export function isPointInBounds(lat: number, lng: number, bounds: LatLngBounds): boolean {
  const inLat = lat <= bounds.north && lat >= bounds.south;
  const inLng =
    bounds.west <= bounds.east
      ? lng >= bounds.west && lng <= bounds.east
      : lng >= bounds.west || lng <= bounds.east; // crosses antimeridian
  return inLat && inLng;
}

// Calculate center and approximate radius of bounds in meters
export function getBoundsCenterAndRadius(bounds: LatLngBounds): {
  center: LatLngPoint;
  radiusInMeters: number;
} {
  const centerLat = (bounds.north + bounds.south) / 2;
  let centerLng = (bounds.east + bounds.west) / 2;
  if (bounds.west > bounds.east) {
    centerLng = (centerLng + 180) % 360 - 180;
  }

  // Distance from center to corner in km * 1000 = meters
  const distKm = distanceBetween([centerLat, centerLng], [bounds.north, bounds.east]);
  const radiusInMeters = Math.min(distKm * 1000, 2000000); // capped to reasonable max

  return {
    center: { lat: centerLat, lng: centerLng },
    radiusInMeters: Math.max(radiusInMeters, 500),
  };
}

// Generate geohash query bounds
export function getGeohashRanges(center: LatLngPoint, radiusInMeters: number) {
  return geohashQueryBounds([center.lat, center.lng], radiusInMeters);
}

// Calculate distance in km between two coords
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return Math.round(distanceBetween([lat1, lng1], [lat2, lng2]) * 10) / 10;
}
