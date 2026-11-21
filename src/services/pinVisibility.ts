import { where } from 'firebase/firestore';
import type { Pin } from '../types';

export const publicPinFilter = () => where('publicAccess', '==', true);

export function isPublicPin(pin: Partial<Pin>) {
  return pin.publicAccess === true && pin.visibility === 'public' && pin.status === 'published' &&
    !pin.isPrivate && !pin.isDeleted && !pin.isReported && !pin.isDemo;
}
