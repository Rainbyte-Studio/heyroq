"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoveryLocationKey = discoveryLocationKey;
exports.eligibleDiscoveryIds = eligibleDiscoveryIds;
/** Stable, approximate 100m grid fingerprint for one discovery. */
function discoveryLocationKey(latitude, longitude) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return null;
    }
    return `${Math.round(latitude * 1000)}:${Math.round(longitude * 1000)}`;
}
/** Only one new discovery event per location, including already-earned locations. */
function eligibleDiscoveryIds(pins, previouslyEarned) {
    const seen = new Set(previouslyEarned);
    const ids = [];
    const ordered = [...pins].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
        a.id.localeCompare(b.id));
    for (const pin of ordered) {
        const key = discoveryLocationKey(pin.latitude, pin.longitude);
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        ids.push(pin.id);
    }
    return ids;
}
//# sourceMappingURL=progressionLocation.js.map