"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuredGeographicPolicy = configuredGeographicPolicy;
exports.isGeographicDiscovery = isGeographicDiscovery;
exports.resolveGeographicReceipt = resolveGeographicReceipt;
exports.matchesGeographicReceipt = matchesGeographicReceipt;
const node_crypto_1 = require("node:crypto");
const progressionLocation_1 = require("./progressionLocation");
const progressionEvidence_1 = require("./progressionEvidence");
const isoCountries = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
    'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
    'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
// Replacing this stub requires a reviewed provider, corpus and release.
function configuredGeographicPolicy() {
    return undefined;
}
function isGeographicDiscovery(data) {
    return !!data && (0, progressionEvidence_1.isPublishedDiscovery)(data) && !data.isReported &&
        !data.isPrivate && data.visibility !== 'private' &&
        (0, progressionLocation_1.discoveryLocationKey)(data.latitude, data.longitude) !== null;
}
function pinDigest(pin, userId, databaseId) {
    const data = pin.data();
    if (!isGeographicDiscovery(data) || data.userId !== userId || !pin.createTime)
        return;
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify([
        databaseId, userId, pin.ref.path, pin.createTime.seconds, pin.createTime.nanoseconds,
        data.latitude, data.longitude,
    ])).digest('hex');
}
function payload(receipt) {
    return JSON.stringify([
        'heyroq-geography', receipt.schemaVersion, receipt.keyId, receipt.resolverVersion,
        receipt.pinDigest, receipt.countryCode, receipt.cityId,
    ]);
}
function isAfterCutoff(time, cutoff) {
    return Number.isSafeInteger(cutoff) && cutoff > 0 && !!time && time.toMillis() >= cutoff;
}
async function resolveGeographicReceipt(pin, userId, databaseId, policy) {
    if (!policy.pilotUsers.has(userId) || !isAfterCutoff(pin.createTime, policy.startsAtMs))
        return;
    const digest = pinDigest(pin, userId, databaseId);
    if (!digest)
        return;
    const { latitude, longitude } = pin.data();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 750);
    try {
        const unknown = new Promise((resolve) => {
            controller.signal.addEventListener('abort', () => resolve(null), { once: true });
        });
        const result = await Promise.race([policy.resolver.resolve({ latitude, longitude }, controller.signal), unknown]);
        if (!result || !isoCountries.has(result.countryCode))
            return;
        const cityId = typeof result.cityId === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(result.cityId)
            ? result.cityId : null;
        const receipt = {
            schemaVersion: 1, keyId: policy.keyId, resolverVersion: policy.resolver.version,
            pinDigest: digest, countryCode: result.countryCode, cityId,
        };
        return { ...receipt, signature: (0, node_crypto_1.sign)(null, Buffer.from(payload(receipt)), policy.signingKey).toString('base64url') };
    }
    catch {
        console.warn('geographic_resolution_failed');
        return;
    }
    finally {
        clearTimeout(timeout);
    }
}
function matchesGeographicReceipt(receipt, pin, userId, databaseId, policy) {
    return receipt.schemaVersion === 1 && receipt.keyId === policy.keyId &&
        receipt.resolverVersion === policy.resolver.version &&
        policy.pilotUsers.has(userId) && isAfterCutoff(pin.createTime, policy.startsAtMs) &&
        receipt.pinDigest === pinDigest(pin, userId, databaseId) &&
        (0, node_crypto_1.verify)(null, Buffer.from(payload(receipt)), policy.verificationKey, Buffer.from(receipt.signature, 'base64url'));
}
//# sourceMappingURL=geographicProgression.js.map