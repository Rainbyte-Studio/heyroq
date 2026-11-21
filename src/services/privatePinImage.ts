import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import { isPublicPin } from './pinVisibility';
import type { Pin } from '../types';

const readImage = httpsCallable<{ pinId: string; index: number }, { mimeType: string; content: string }>(
  functions, 'pinImageAccessV1', { timeout: 35_000 },
);

export function usePrivatePinImage(pin: Pin, index: number, uid: string | undefined) {
  const [loaded, setLoaded] = useState<{ pin: Pin; index: number; uid: string; url: string }>();
  const publicPin = isPublicPin(pin);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    if (publicPin || uid !== pin.userId || !uid || !pin.imageUrls?.[index]) return;
    void readImage({ pinId: pin.id, index }).then(({ data }) => {
      if (!active || auth.currentUser?.uid !== uid || !/^image\/(jpeg|png|gif|webp|avif|heic)$/.test(data.mimeType)) return;
      const bytes = Uint8Array.from(atob(data.content), character => character.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType }));
      setLoaded({ pin, index, uid, url });
    }).catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pin, index, uid, publicPin]);
  if (publicPin) return undefined;
  if (loaded?.pin === pin && loaded?.index === index && loaded?.uid === uid) return loaded.url;
  return undefined;
}
