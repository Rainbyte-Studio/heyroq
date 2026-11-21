import { where } from 'firebase/firestore';
import type { Pin } from '../types';

export const publicPinFilters = [
  where('publicAccess', '==', true), where('visibility', '==', 'public'), where('status', '==', 'published'),
] as const;

export function isPublicPin(pin: Partial<Pin>) {
  return pin.publicAccess === true && pin.visibility === 'public' && pin.status === 'published' &&
    !pin.isPrivate && !pin.isDeleted && !pin.isReported && !pin.isDemo;
}
