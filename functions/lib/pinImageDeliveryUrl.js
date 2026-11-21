"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIN_IMAGE_REGION = void 0;
exports.pinImageDeliveryUrl = pinImageDeliveryUrl;
exports.PIN_IMAGE_REGION = 'europe-west2';
function pinImageDeliveryUrl(pinId, incarnation, uploadId) {
    const project = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? 'demo-heyroq' : 'rainbyte-studio';
    return 'https://' + exports.PIN_IMAGE_REGION + '-' + project + '.cloudfunctions.net/publicPinImageV1?' +
        new URLSearchParams({ pin: pinId, incarnation, image: uploadId });
}
//# sourceMappingURL=pinImageDeliveryUrl.js.map