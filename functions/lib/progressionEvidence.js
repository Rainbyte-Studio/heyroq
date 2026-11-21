"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPublishedDiscovery = isPublishedDiscovery;
exports.getDiscoveryBadgeMetrics = getDiscoveryBadgeMetrics;
exports.countTrustedLikes = countTrustedLikes;
const progressionConfig_1 = require("./progressionConfig");
const node_crypto_1 = require("node:crypto");
const progressionLocation_1 = require("./progressionLocation");
const SPOT_CATEGORIES = new Set([
    'food', 'travel', 'nature', 'events', 'activities', 'hidden gems', 'photography', 'other',
]);
function normalizeText(value) {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
function spotCategory(data) {
    return typeof data.category === 'string' ? normalizeText(data.category) : '';
}
function isPublishedDiscovery(data) {
    return !data.isDeleted && (data.status === 'published' || data.status == null);
}
function hasPublishedPhoto(data) {
    return Array.isArray(data.imageUrls) && data.imageUrls.some((value) => {
        if (typeof value !== 'string')
            return false;
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password && url.pathname.length > 1;
        }
        catch {
            return false;
        }
    });
}
function getDiscoveryBadgeMetrics(pins) {
    const candidates = pins.filter(pin => isPublishedDiscovery(pin) && typeof pin.title === 'string' && pin.title.trim().length > 0 &&
        SPOT_CATEGORIES.has(spotCategory(pin)));
    const distinctIds = new Set((0, progressionLocation_1.eligibleDiscoveryIds)(candidates, new Set()));
    const categories = new Set();
    const richCandidates = new Map();
    const richDescriptions = new Set();
    let photoSpotsCount = 0;
    for (const pin of candidates) {
        if (!distinctIds.has(pin.id))
            continue;
        categories.add(spotCategory(pin));
        if (hasPublishedPhoto(pin))
            photoSpotsCount++;
        const description = typeof pin.description === 'string' ? normalizeText(pin.description) : '';
        const tags = new Set(pin.tags.map(normalizeText).filter(Boolean));
        if (description.length >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_DESC_LEN &&
            tags.size >= progressionConfig_1.PROGRESSION_CONSTANTS.RICH_DISCOVERY_MIN_TAGS) {
            const locationKey = (0, progressionLocation_1.discoveryLocationKey)(pin.latitude, pin.longitude);
            const descriptionKey = (0, node_crypto_1.createHash)('sha256').update(description).digest('hex');
            richCandidates.set(pin.id, { locationKey, descriptionKey });
            richDescriptions.add(descriptionKey);
        }
    }
    return {
        distinctDiscoveryCount: distinctIds.size,
        distinctCategoryCount: categories.size,
        qualifyingRichCount: richDescriptions.size,
        photoSpotsCount,
        richCandidates,
    };
}
/** Canonical likes are keyed by authenticated UID. Count each eligible account once per author. */
async function countTrustedLikes(db, authorId, pins, target) {
    const checked = new Set();
    let count = 0;
    for (const pin of pins) {
        if (!isPublishedDiscovery(pin.data()))
            continue;
        const likes = pin.ref.collection('likes').orderBy('__name__').limit(50);
        let cursor;
        do {
            const page = await (cursor ? likes.startAfter(cursor) : likes).get();
            const actorIds = [];
            for (const like of page.docs) {
                const actorId = like.id;
                const storedUid = like.get('userId');
                if (actorId === authorId || checked.has(actorId) ||
                    actorId.startsWith('system_') || actorId.startsWith('demo_') ||
                    (storedUid !== undefined && storedUid !== actorId) ||
                    like.createTime.valueOf() < pin.createTime.valueOf())
                    continue;
                checked.add(actorId);
                actorIds.push(actorId);
            }
            if (actorIds.length > 0) {
                const people = await db.getAll(...actorIds.map(id => db.collection('users').doc(id)), ...actorIds.map(id => db.collection('accountDeletionLocks').doc(id)));
                actorIds.forEach((_, index) => {
                    const profile = people[index];
                    if (profile.exists && profile.get('deletionStatus') !== 'deleting' &&
                        !people[index + actorIds.length].exists)
                        count++;
                });
                if (count >= target)
                    return target;
            }
            cursor = page.size === 50 ? page.docs.at(-1) : undefined;
        } while (cursor);
    }
    return count;
}
//# sourceMappingURL=progressionEvidence.js.map