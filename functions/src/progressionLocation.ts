/** Stable, approximate 100m grid fingerprint for one discovery. */
export function discoveryLocationKey(latitude: unknown, longitude: unknown): string | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return `${Math.round(latitude * 1000)}:${Math.round(longitude * 1000)}`;
}

/** Only one new discovery event per location, including already-earned locations. */
export function eligibleDiscoveryIds<T extends { id: string; latitude?: unknown; longitude?: unknown; createdAt?: unknown }>(
  pins: T[],
  previouslyEarned: ReadonlySet<string>,
): string[] {
  const seen = new Set(previouslyEarned);
  const ids: string[] = [];
  const ordered = [...pins].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
    a.id.localeCompare(b.id)
  );
  for (const pin of ordered) {
    const key = discoveryLocationKey(pin.latitude, pin.longitude);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ids.push(pin.id);
  }
  return ids;
}
