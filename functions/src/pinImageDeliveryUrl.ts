export const PIN_IMAGE_REGION = 'europe-west2';

export function pinImageDeliveryUrl(pinId: string, incarnation: string, uploadId: string) {
  const project = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? 'demo-heyroq' : 'rainbyte-studio';
  return 'https://' + PIN_IMAGE_REGION + '-' + project + '.cloudfunctions.net/publicPinImageV1?' +
    new URLSearchParams({ pin: pinId, incarnation, image: uploadId });
}
