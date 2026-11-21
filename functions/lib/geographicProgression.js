"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_GEOGRAPHY_PINS_PER_UTC_DAY = void 0;
exports.formatGeographicDiscovery = formatGeographicDiscovery;
exports.configuredGeographicPolicy = configuredGeographicPolicy;
exports.validateGeographicSelection = validateGeographicSelection;
exports.geographicReceiptForPin = geographicReceiptForPin;
const progressionLocation_1 = require("./progressionLocation");
const progressionEvidence_1 = require("./progressionEvidence");
const catalog = require('../geographyCatalog.json');
exports.MAX_GEOGRAPHY_PINS_PER_UTC_DAY = 5;
const cities = new Map(catalog.cities.map(city => [city[0], city]));
const CITY_CENTER_LIMIT_KM = 25;
const radians = (degrees) => degrees * Math.PI / 180;
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
function formatGeographicDiscovery(receipt, city) {
    if (!receipt)
        return;
    const entry = cities.get(receipt.cityId);
    if (!entry || entry[1] !== receipt.countryCode || !/^[A-Z]{2}$/.test(receipt.countryCode))
        return;
    return city ? entry[2] : countryNames.of(receipt.countryCode);
}
// Recovery deployments omit the capability. A capable deployment still needs
// a post-reset cutoff in the server-owned writer control document.
function configuredGeographicPolicy(cutoff = undefined) {
    if (process.env.HEYROQ_GEOGRAPHY_V11_CAPABLE !== 'true' ||
        typeof cutoff !== 'number' || !Number.isSafeInteger(cutoff) || cutoff <= 0)
        return undefined;
    return { startsAtMs: cutoff };
}
function validateGeographicSelection(selection, latitude, longitude) {
    if (!selection || typeof selection !== 'object' || Object.keys(selection).length !== 2 ||
        !(0, progressionLocation_1.discoveryLocationKey)(latitude, longitude))
        return;
    const { countryCode, cityId } = selection;
    if (typeof cityId !== 'string' || !/^\d{1,12}$/.test(cityId))
        return;
    const city = cities.get(cityId);
    if (!city || countryCode !== city[1])
        return;
    const latDelta = radians(latitude - city[4]);
    const lngDelta = radians(longitude - city[5]);
    const h = Math.sin(latDelta / 2) ** 2 +
        Math.cos(radians(latitude)) * Math.cos(radians(city[4])) * Math.sin(lngDelta / 2) ** 2;
    const distanceKm = 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h)));
    if (distanceKm > CITY_CENTER_LIMIT_KM)
        return;
    return { countryCode, cityId };
}
function geographicReceiptForPin(pin, userId, policy) {
    const data = pin.data();
    const created = pin.createTime;
    if (!data || !created || !Number.isSafeInteger(policy.startsAtMs) || policy.startsAtMs <= 0 ||
        created.toMillis() < policy.startsAtMs || (policy.pilotUsers && !policy.pilotUsers.has(userId)) ||
        data.userId !== userId || !(0, progressionEvidence_1.isPublishedDiscovery)(data) || data.isReported || data.isPrivate ||
        (data.visibility != null && data.visibility !== 'public') || data.publicAccess === false ||
        data.publishReceipt !== true ||
        typeof data.imageIncarnation !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.imageIncarnation) ||
        !Array.isArray(data.imageUrls) || data.imageUrls.length === 0)
        return;
    const place = validateGeographicSelection(data.geographySelection, data.latitude, data.longitude);
    if (!place)
        return;
    return {
        schemaVersion: 2,
        catalogVersion: catalog.version,
        pinId: pin.id,
        publishedDay: created.toDate().toISOString().slice(0, 10),
        ...place,
    };
}
//# sourceMappingURL=geographicProgression.js.map